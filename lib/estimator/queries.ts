import "server-only";

import { requireTool } from "@/lib/auth/access";
import { listWorkCategories, listWorkGroups, listWorkItems } from "@/lib/masters/works";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import type { FrozenLineRow, FrozenTakeoffRow, MaterialDef, MixDef, WorkRecipe } from "./calc";

/**
 * Reads for the Estimator.
 *
 * Every function opens with `requireTool("/estimator")`. The 0074
 * policies gate SELECT as well as writes, so an ungranted person would
 * get an empty list rather than an error — which reads as "no materials
 * set up yet" instead of "not for you". The explicit check redirects
 * them instead of lying (the Financial Management reasoning, kept).
 *
 * The only thing read from outside this tool is the works vocabulary in
 * Masters (`lib/masters/works.ts`) — a shared surface, money-free, and
 * ungated by design. Nothing here reads another tool's tables.
 *
 * Almost no embeds: the estimates list needs villa names, and `units`
 * has had two foreign keys to `plots` since 0029, so a bare embed
 * answers HTTP 300 at runtime while compiling perfectly (BUGCATCHER
 * #2). Names are merged through a Map instead — the Directory pattern.
 * The one embed is listMaterials' `items(...)`: estimator_materials has
 * exactly one path to items (0076), so it cannot go ambiguous, and it
 * was exercised against staging PostgREST before shipping.
 */

const GRANT = "/estimator";

function fail(context: string, error: { message: string }): never {
  console.error(`estimator: ${context} failed:`, error);
  throw new Error(`Could not load ${context}.`);
}

// ---------------------------------------------------------------------
// Welcome
// ---------------------------------------------------------------------

export async function getWelcomeCounts(): Promise<{
  estimates: number;
  official: number;
  worksSetUp: number;
  materials: number;
}> {
  await requireTool(GRANT);
  const supabase = await createClient();

  const [estimates, official, worksSetUp, materials] = await Promise.all([
    supabase
      .from("estimator_estimates")
      .select("id", { count: "exact", head: true })
      .eq("is_template", false),
    supabase
      .from("estimator_estimates")
      .select("id", { count: "exact", head: true })
      .eq("status", "submitted"),
    supabase.from("estimator_work_info").select("id", { count: "exact", head: true }),
    supabase.from("estimator_materials").select("id", { count: "exact", head: true }),
  ]);

  return {
    estimates: estimates.count ?? 0,
    official: official.count ?? 0,
    worksSetUp: worksSetUp.count ?? 0,
    materials: materials.count ?? 0,
  };
}

// ---------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------

export type MaterialRow = {
  id: string;
  name: string;
  uom: string;
  rate: number | null;
  isActive: boolean;
  /** How many mixes and recipes use it — a material in use can't be deleted. */
  useCount: number;
  /** The catalogue item this material is bought and issued as (0076). */
  itemId: string | null;
  /** One <uom> of the material = factor × <default_uom> of the item. */
  itemUomFactor: number | null;
  /** Display fields of the linked item; null when unlinked. */
  itemName: string | null;
  itemCode: string | null;
  itemDefaultUom: string | null;
};

export async function listMaterials(): Promise<MaterialRow[]> {
  await requireTool(GRANT);
  const supabase = await createClient();

  const [materials, mixUses, workUses] = await Promise.all([
    fetchAll<{
      id: string;
      name: string;
      uom: string;
      rate: number | null;
      is_active: boolean;
      item_id: string | null;
      item_uom_factor: number | null;
      items: { name: string; code: string | null; default_uom: string } | null;
    }>((from, to) =>
      supabase
        .from("estimator_materials")
        .select(
          "id, name, uom, rate, is_active, item_id, item_uom_factor, items(name, code, default_uom)",
        )
        .order("name")
        .order("id")
        .range(from, to),
    ),
    fetchAll<{ material_id: string }>((from, to) =>
      supabase.from("estimator_mix_components").select("material_id").order("id").range(from, to),
    ),
    fetchAll<{ material_id: string | null }>((from, to) =>
      supabase
        .from("estimator_work_components")
        .select("material_id")
        .not("material_id", "is", null)
        .order("id")
        .range(from, to),
    ),
  ]);

  const uses = new Map<string, number>();
  for (const row of mixUses) uses.set(row.material_id, (uses.get(row.material_id) ?? 0) + 1);
  for (const row of workUses) {
    if (row.material_id) uses.set(row.material_id, (uses.get(row.material_id) ?? 0) + 1);
  }

  return materials.map((material) => ({
    id: material.id,
    name: material.name,
    uom: material.uom,
    rate: material.rate,
    isActive: material.is_active,
    useCount: uses.get(material.id) ?? 0,
    itemId: material.item_id,
    itemUomFactor: material.item_uom_factor,
    itemName: material.items?.name ?? null,
    itemCode: material.items?.code ?? null,
    itemDefaultUom: material.items?.default_uom ?? null,
  }));
}

// ---------------------------------------------------------------------
// Units of measure (0075) — the master behind every uom picker
// ---------------------------------------------------------------------

export type UomRow = {
  id: string;
  name: string;
  isActive: boolean;
  /** Rows across materials, mixes and work setups spelling this unit. */
  useCount: number;
};

/** Every unit, for the management list on the Materials screen. */
export async function listUoms(): Promise<UomRow[]> {
  await requireTool(GRANT);
  const supabase = await createClient();

  const [uoms, materials, mixes, works] = await Promise.all([
    fetchAll<{ id: string; name: string; is_active: boolean }>((from, to) =>
      supabase
        .from("estimator_uoms")
        .select("id, name, is_active")
        .order("sort_order")
        .order("name")
        .range(from, to),
    ),
    fetchAll<{ uom: string }>((from, to) =>
      supabase.from("estimator_materials").select("uom").order("id").range(from, to),
    ),
    fetchAll<{ uom: string }>((from, to) =>
      supabase.from("estimator_mixes").select("uom").order("id").range(from, to),
    ),
    fetchAll<{ uom: string }>((from, to) =>
      supabase.from("estimator_work_info").select("uom").order("id").range(from, to),
    ),
  ]);

  const uses = new Map<string, number>();
  for (const row of [...materials, ...mixes, ...works]) {
    const key = row.uom.toLowerCase();
    uses.set(key, (uses.get(key) ?? 0) + 1);
  }

  return uoms.map((uom) => ({
    id: uom.id,
    name: uom.name,
    isActive: uom.is_active,
    useCount: uses.get(uom.name.toLowerCase()) ?? 0,
  }));
}

/** Active unit names in picker order, for every uom select in the tool. */
export async function listUomNames(): Promise<string[]> {
  await requireTool(GRANT);
  const supabase = await createClient();

  const rows = await fetchAll<{ name: string }>((from, to) =>
    supabase
      .from("estimator_uoms")
      .select("name")
      .eq("is_active", true)
      .order("sort_order")
      .order("name")
      .range(from, to),
  );
  return rows.map((row) => row.name);
}

// ---------------------------------------------------------------------
// Mixes
// ---------------------------------------------------------------------

export type MixRow = {
  id: string;
  name: string;
  uom: string;
  description: string | null;
  isActive: boolean;
  componentCount: number;
  /** How many work recipes use it. */
  useCount: number;
};

export async function listMixes(): Promise<MixRow[]> {
  await requireTool(GRANT);
  const supabase = await createClient();

  const [mixes, components, workUses] = await Promise.all([
    fetchAll<{
      id: string;
      name: string;
      uom: string;
      description: string | null;
      is_active: boolean;
    }>((from, to) =>
      supabase
        .from("estimator_mixes")
        .select("id, name, uom, description, is_active")
        .order("name")
        .order("id")
        .range(from, to),
    ),
    fetchAll<{ mix_id: string }>((from, to) =>
      supabase.from("estimator_mix_components").select("mix_id").order("id").range(from, to),
    ),
    fetchAll<{ mix_id: string | null }>((from, to) =>
      supabase
        .from("estimator_work_components")
        .select("mix_id")
        .not("mix_id", "is", null)
        .order("id")
        .range(from, to),
    ),
  ]);

  const counts = new Map<string, number>();
  for (const row of components) counts.set(row.mix_id, (counts.get(row.mix_id) ?? 0) + 1);
  const uses = new Map<string, number>();
  for (const row of workUses) {
    if (row.mix_id) uses.set(row.mix_id, (uses.get(row.mix_id) ?? 0) + 1);
  }

  return mixes.map((mix) => ({
    id: mix.id,
    name: mix.name,
    uom: mix.uom,
    description: mix.description,
    isActive: mix.is_active,
    componentCount: counts.get(mix.id) ?? 0,
    useCount: uses.get(mix.id) ?? 0,
  }));
}

export type MixComponentRow = {
  id: string;
  materialId: string;
  materialName: string;
  materialUom: string;
  materialRate: number | null;
  qtyPerUnit: number;
};

export type MixDetail = {
  id: string;
  name: string;
  uom: string;
  description: string | null;
  isActive: boolean;
  components: MixComponentRow[];
};

export async function getMix(mixId: string): Promise<MixDetail | null> {
  await requireTool(GRANT);
  const supabase = await createClient();

  const { data: mix, error } = await supabase
    .from("estimator_mixes")
    .select("id, name, uom, description, is_active")
    .eq("id", mixId)
    .maybeSingle();
  if (error) fail("the mix", error);
  if (!mix) return null;

  const [components, materials] = await Promise.all([
    fetchAll<{ id: string; material_id: string; qty_per_unit: number }>((from, to) =>
      supabase
        .from("estimator_mix_components")
        .select("id, material_id, qty_per_unit")
        .eq("mix_id", mixId)
        .order("id")
        .range(from, to),
    ),
    listMaterialsRaw(supabase),
  ]);

  const materialsById = new Map(materials.map((m) => [m.id, m]));

  return {
    id: mix.id,
    name: mix.name,
    uom: mix.uom,
    description: mix.description,
    isActive: mix.is_active,
    components: components
      .map((component) => {
        const material = materialsById.get(component.material_id);
        return {
          id: component.id,
          materialId: component.material_id,
          materialName: material?.name ?? "Unknown material",
          materialUom: material?.uom ?? "",
          materialRate: material?.rate ?? null,
          qtyPerUnit: component.qty_per_unit,
        };
      })
      .sort((a, b) => a.materialName.localeCompare(b.materialName)),
  };
}

type RawMaterial = { id: string; name: string; uom: string; rate: number | null };

async function listMaterialsRaw(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<RawMaterial[]> {
  return fetchAll<RawMaterial>((from, to) =>
    supabase
      .from("estimator_materials")
      .select("id, name, uom, rate")
      .order("name")
      .order("id")
      .range(from, to),
  );
}

// ---------------------------------------------------------------------
// Works — the masters vocabulary joined with this tool's setup
// ---------------------------------------------------------------------

export type WorkStatusRow = {
  workItemId: string;
  code: string;
  name: string;
  categoryCode: string;
  categoryName: string;
  groupName: string | null;
  isActive: boolean;
  uom: string | null;
  labourRate: number | null;
  componentCount: number;
};

/**
 * Every work in the Masters vocabulary with its estimator setup beside
 * it. A row with no `uom` has never been set up — the screen shows those
 * as the outstanding to-do rather than hiding them.
 */
export async function listWorkStatus(): Promise<WorkStatusRow[]> {
  await requireTool(GRANT);
  const supabase = await createClient();

  const [categories, groups, items, info, components] = await Promise.all([
    listWorkCategories(),
    listWorkGroups(),
    listWorkItems(),
    fetchAll<{ work_item_id: string; uom: string; labour_rate: number | null }>((from, to) =>
      supabase
        .from("estimator_work_info")
        .select("work_item_id, uom, labour_rate")
        .order("work_item_id")
        .range(from, to),
    ),
    fetchAll<{ work_item_id: string }>((from, to) =>
      supabase.from("estimator_work_components").select("work_item_id").order("id").range(from, to),
    ),
  ]);

  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const infoByWork = new Map(info.map((row) => [row.work_item_id, row]));
  const componentCounts = new Map<string, number>();
  for (const row of components) {
    componentCounts.set(row.work_item_id, (componentCounts.get(row.work_item_id) ?? 0) + 1);
  }

  return items.map((item) => {
    const category = categoryById.get(item.category_id);
    const setup = infoByWork.get(item.id);
    return {
      workItemId: item.id,
      code: item.code,
      name: item.name,
      categoryCode: category?.code ?? "",
      categoryName: category?.name ?? "",
      groupName: item.group_id ? (groupById.get(item.group_id)?.name ?? null) : null,
      isActive: item.is_active,
      uom: setup?.uom ?? null,
      labourRate: setup?.labour_rate ?? null,
      componentCount: componentCounts.get(item.id) ?? 0,
    };
  });
}

export type WorkComponentRow = {
  id: string;
  kind: "material" | "mix";
  refId: string;
  name: string;
  uom: string;
  qtyPerUnit: number;
  /** For a mix: how many materials it holds. Zero is worth flagging. */
  mixComponentCount: number | null;
};

export type WorkSetup = {
  workItemId: string;
  code: string;
  name: string;
  categoryName: string;
  groupName: string | null;
  uom: string | null;
  labourRate: number | null;
  components: WorkComponentRow[];
  /** How many estimate lines use this work — changing its unit rewrites their meaning. */
  lineCount: number;
};

export async function getWorkSetup(workItemId: string): Promise<WorkSetup | null> {
  await requireTool(GRANT);
  const supabase = await createClient();

  const [items, categories, groups] = await Promise.all([
    listWorkItems(),
    listWorkCategories(),
    listWorkGroups(),
  ]);
  const item = items.find((row) => row.id === workItemId);
  if (!item) return null;

  const [info, components, materials, mixes, lines] = await Promise.all([
    supabase
      .from("estimator_work_info")
      .select("uom, labour_rate")
      .eq("work_item_id", workItemId)
      .maybeSingle(),
    fetchAll<{
      id: string;
      material_id: string | null;
      mix_id: string | null;
      qty_per_unit: number;
    }>((from, to) =>
      supabase
        .from("estimator_work_components")
        .select("id, material_id, mix_id, qty_per_unit")
        .eq("work_item_id", workItemId)
        .order("id")
        .range(from, to),
    ),
    listMaterialsRaw(supabase),
    listMixes(),
    supabase
      .from("estimator_estimate_lines")
      .select("id", { count: "exact", head: true })
      .eq("work_item_id", workItemId),
  ]);

  if (info.error) fail("the work setup", info.error);

  const materialsById = new Map(materials.map((m) => [m.id, m]));
  const mixesById = new Map(mixes.map((m) => [m.id, m]));

  return {
    workItemId: item.id,
    code: item.code,
    name: item.name,
    categoryName: categories.find((c) => c.id === item.category_id)?.name ?? "",
    groupName: item.group_id ? (groups.find((g) => g.id === item.group_id)?.name ?? null) : null,
    uom: info.data?.uom ?? null,
    labourRate: info.data?.labour_rate ?? null,
    lineCount: lines.count ?? 0,
    components: components.map((component) => {
      if (component.material_id) {
        const material = materialsById.get(component.material_id);
        return {
          id: component.id,
          kind: "material" as const,
          refId: component.material_id,
          name: material?.name ?? "Unknown material",
          uom: material?.uom ?? "",
          qtyPerUnit: component.qty_per_unit,
          mixComponentCount: null,
        };
      }
      const mix = component.mix_id ? mixesById.get(component.mix_id) : undefined;
      return {
        id: component.id,
        kind: "mix" as const,
        refId: component.mix_id ?? "",
        name: mix?.name ?? "Unknown mix",
        uom: mix?.uom ?? "",
        qtyPerUnit: component.qty_per_unit,
        mixComponentCount: mix?.componentCount ?? 0,
      };
    }),
  };
}

// ---------------------------------------------------------------------
// The recipe book — everything calc.ts needs, in one read
// ---------------------------------------------------------------------

export type RecipeBook = {
  materials: MaterialDef[];
  mixes: MixDef[];
  recipes: WorkRecipe[];
};

export async function getRecipeBook(): Promise<RecipeBook> {
  await requireTool(GRANT);
  const supabase = await createClient();

  const [materials, mixes, mixComponents, info, workComponents] = await Promise.all([
    listMaterialsRaw(supabase),
    fetchAll<{ id: string; name: string; uom: string }>((from, to) =>
      supabase.from("estimator_mixes").select("id, name, uom").order("id").range(from, to),
    ),
    fetchAll<{ mix_id: string; material_id: string; qty_per_unit: number }>((from, to) =>
      supabase
        .from("estimator_mix_components")
        .select("mix_id, material_id, qty_per_unit")
        .order("id")
        .range(from, to),
    ),
    fetchAll<{ work_item_id: string; uom: string; labour_rate: number | null }>((from, to) =>
      supabase
        .from("estimator_work_info")
        .select("work_item_id, uom, labour_rate")
        .order("work_item_id")
        .range(from, to),
    ),
    fetchAll<{
      work_item_id: string;
      material_id: string | null;
      mix_id: string | null;
      qty_per_unit: number;
    }>((from, to) =>
      supabase
        .from("estimator_work_components")
        .select("work_item_id, material_id, mix_id, qty_per_unit")
        .order("id")
        .range(from, to),
    ),
  ]);

  const componentsByMix = new Map<string, { materialId: string; qtyPerUnit: number }[]>();
  for (const row of mixComponents) {
    const list = componentsByMix.get(row.mix_id) ?? [];
    list.push({ materialId: row.material_id, qtyPerUnit: row.qty_per_unit });
    componentsByMix.set(row.mix_id, list);
  }

  const componentsByWork = new Map<
    string,
    { materialId: string | null; mixId: string | null; qtyPerUnit: number }[]
  >();
  for (const row of workComponents) {
    const list = componentsByWork.get(row.work_item_id) ?? [];
    list.push({
      materialId: row.material_id,
      mixId: row.mix_id,
      qtyPerUnit: row.qty_per_unit,
    });
    componentsByWork.set(row.work_item_id, list);
  }

  return {
    materials: materials.map((m) => ({ id: m.id, name: m.name, uom: m.uom, rate: m.rate })),
    mixes: mixes.map((mix) => ({
      id: mix.id,
      name: mix.name,
      uom: mix.uom,
      components: componentsByMix.get(mix.id) ?? [],
    })),
    recipes: info.map((row) => ({
      workItemId: row.work_item_id,
      uom: row.uom,
      labourRate: row.labour_rate,
      components: componentsByWork.get(row.work_item_id) ?? [],
    })),
  };
}

// ---------------------------------------------------------------------
// Estimates
// ---------------------------------------------------------------------

export type EstimateRow = {
  id: string;
  name: string;
  note: string | null;
  isTemplate: boolean;
  projectId: string;
  projectName: string;
  unitId: string | null;
  unitName: string | null;
  lineCount: number;
  createdAt: string;
  status: "draft" | "submitted" | "superseded";
  /** EST/<code>/NNN once submitted; null while a working draft. */
  reference: string | null;
};

/**
 * Every estimate and template, with project and villa names merged in
 * through Maps rather than embedded — see the module note.
 */
export async function listEstimates(): Promise<EstimateRow[]> {
  await requireTool(GRANT);
  const supabase = await createClient();

  const [estimates, lines, projects, units] = await Promise.all([
    fetchAll<{
      id: string;
      name: string;
      note: string | null;
      is_template: boolean;
      project_id: string;
      unit_id: string | null;
      created_at: string;
      status: string;
      reference: string | null;
    }>((from, to) =>
      supabase
        .from("estimator_estimates")
        .select("id, name, note, is_template, project_id, unit_id, created_at, status, reference")
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to),
    ),
    fetchAll<{ estimate_id: string }>((from, to) =>
      supabase.from("estimator_estimate_lines").select("estimate_id").order("id").range(from, to),
    ),
    fetchAll<{ id: string; name: string }>((from, to) =>
      supabase.from("projects").select("id, name").order("id").range(from, to),
    ),
    fetchAll<{ id: string; name: string }>((from, to) =>
      supabase.from("units").select("id, name").order("id").range(from, to),
    ),
  ]);

  const lineCounts = new Map<string, number>();
  for (const row of lines) {
    lineCounts.set(row.estimate_id, (lineCounts.get(row.estimate_id) ?? 0) + 1);
  }
  const projectById = new Map(projects.map((p) => [p.id, p.name]));
  const unitById = new Map(units.map((u) => [u.id, u.name]));

  return estimates.map((estimate) => ({
    id: estimate.id,
    name: estimate.name,
    note: estimate.note,
    isTemplate: estimate.is_template,
    projectId: estimate.project_id,
    projectName: projectById.get(estimate.project_id) ?? "Unknown project",
    unitId: estimate.unit_id,
    unitName: estimate.unit_id ? (unitById.get(estimate.unit_id) ?? null) : null,
    lineCount: lineCounts.get(estimate.id) ?? 0,
    createdAt: estimate.created_at,
    status: estimate.status as EstimateRow["status"],
    reference: estimate.reference,
  }));
}

export type EstimateLineRow = {
  id: string;
  workItemId: string;
  code: string;
  name: string;
  categoryCode: string;
  qty: number;
  note: string | null;
};

export type EstimateDetail = {
  id: string;
  name: string;
  note: string | null;
  isTemplate: boolean;
  projectId: string;
  projectName: string;
  unitId: string | null;
  unitName: string | null;
  sourceName: string | null;
  lines: EstimateLineRow[];
  status: "draft" | "submitted" | "superseded";
  reference: string | null;
  submittedByName: string | null;
  submittedAt: string | null;
  supersededAt: string | null;
  /** The revision that replaced (or is replacing) this one, if any. */
  successor: { id: string; name: string; status: string } | null;
  /**
   * The 0077 snapshot, present whenever the estimate is no longer a
   * draft. The screen renders THIS — costs frozen on the day of submit
   * — through the same calc.ts grouping as a live draft.
   */
  frozen: {
    lineCosts: FrozenLineRow[];
    takeoff: FrozenTakeoffRow[];
  } | null;
};

export async function getEstimate(estimateId: string): Promise<EstimateDetail | null> {
  await requireTool(GRANT);
  const supabase = await createClient();

  const { data: estimate, error } = await supabase
    .from("estimator_estimates")
    .select(
      "id, name, note, is_template, project_id, unit_id, source_estimate_id, status, reference, submitted_by, submitted_at, superseded_at",
    )
    .eq("id", estimateId)
    .maybeSingle();
  if (error) fail("the estimate", error);
  if (!estimate) return null;

  const [lines, items, categories, project, unit, source] = await Promise.all([
    fetchAll<{ id: string; work_item_id: string; qty: number; note: string | null }>((from, to) =>
      supabase
        .from("estimator_estimate_lines")
        .select("id, work_item_id, qty, note")
        .eq("estimate_id", estimateId)
        .order("id")
        .range(from, to),
    ),
    listWorkItems(),
    listWorkCategories(),
    supabase.from("projects").select("name").eq("id", estimate.project_id).maybeSingle(),
    estimate.unit_id
      ? supabase.from("units").select("name").eq("id", estimate.unit_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    estimate.source_estimate_id
      ? supabase
          .from("estimator_estimates")
          .select("name")
          .eq("id", estimate.source_estimate_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (project.error) fail("the estimate's project", project.error);
  if (unit.error) fail("the estimate's villa", unit.error);

  const itemById = new Map(items.map((item) => [item.id, item]));
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  // The lifecycle extras: who submitted, what replaced this, and the
  // frozen snapshot for anything past draft. Fetched after the header
  // because all three hang off its fields.
  const [submitter, successor, frozenCosts, frozenTakeoff] = await Promise.all([
    estimate.submitted_by
      ? supabase.from("profiles").select("full_name").eq("id", estimate.submitted_by).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("estimator_estimates")
      .select("id, name, status")
      .eq("source_estimate_id", estimate.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    estimate.status !== "draft"
      ? fetchAll<{
          work_item_id: string;
          qty: number;
          uom: string | null;
          labour_cost: number | null;
          material_cost: number | null;
          total_cost: number | null;
        }>((from, to) =>
          supabase
            .from("estimator_estimate_line_costs")
            .select("work_item_id, qty, uom, labour_cost, material_cost, total_cost")
            .eq("estimate_id", estimateId)
            .order("id")
            .range(from, to),
        )
      : Promise.resolve([]),
    estimate.status !== "draft"
      ? fetchAll<{
          work_item_id: string;
          material_id: string;
          material_name: string;
          uom: string;
          quantity: number;
          rate: number | null;
        }>((from, to) =>
          supabase
            .from("estimator_estimate_takeoff")
            .select("work_item_id, material_id, material_name, uom, quantity, rate")
            .eq("estimate_id", estimateId)
            .order("id")
            .range(from, to),
        )
      : Promise.resolve([]),
  ]);
  if (successor.error) fail("the estimate's revision", successor.error);

  return {
    id: estimate.id,
    name: estimate.name,
    note: estimate.note,
    isTemplate: estimate.is_template,
    projectId: estimate.project_id,
    projectName: project.data?.name ?? "Unknown project",
    unitId: estimate.unit_id,
    unitName: unit.data?.name ?? null,
    sourceName: source.data?.name ?? null,
    status: estimate.status as EstimateDetail["status"],
    reference: estimate.reference,
    submittedByName: submitter.data?.full_name ?? null,
    submittedAt: estimate.submitted_at,
    supersededAt: estimate.superseded_at,
    successor: successor.data ?? null,
    frozen:
      estimate.status === "draft"
        ? null
        : {
            lineCosts: frozenCosts.map((row) => ({
              workItemId: row.work_item_id,
              qty: row.qty,
              uom: row.uom,
              labourCost: row.labour_cost,
              materialCost: row.material_cost,
              totalCost: row.total_cost,
            })),
            takeoff: frozenTakeoff.map((row) => ({
              workItemId: row.work_item_id,
              materialId: row.material_id,
              materialName: row.material_name,
              uom: row.uom,
              quantity: row.quantity,
              rate: row.rate,
            })),
          },
    lines: lines
      .map((line) => {
        const item = itemById.get(line.work_item_id);
        return {
          id: line.id,
          workItemId: line.work_item_id,
          code: item?.code ?? "?",
          name: item?.name ?? "Unknown work",
          categoryCode: item ? (categoryById.get(item.category_id)?.code ?? "") : "",
          qty: line.qty,
          note: line.note,
        };
      })
      // Sheet order: the works vocabulary is already sorted, so sorting
      // by code keeps an estimate reading the way the site team reads it.
      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })),
  };
}

/** The templates a new villa estimate can be copied from. */
export async function listTemplates(): Promise<EstimateRow[]> {
  const estimates = await listEstimates();
  return estimates.filter((estimate) => estimate.isTemplate);
}

// ---------------------------------------------------------------------
// Issued against the official estimate (0080)
// ---------------------------------------------------------------------

export type IssuedAgainstEstimate = {
  /** One line per issue line to the villa's plot, work included. */
  lines: { workItemId: string | null; itemId: string; quantity: number }[];
  /** The material→item bridge, for compare.ts. */
  links: { materialId: string; itemId: string; itemUom: string; factor: number | null }[];
  /** Item names for the unmatched footnote. */
  itemNamesById: Map<string, string>;
};

/**
 * Every stock issue line to the estimate's villa, with the work each
 * issue was tagged with. Inventory's reads are open to all signed-in
 * staff (no money anywhere in that tool), so this needs no view — the
 * one-way rule stays: Inventory never reads the estimator's tables,
 * the estimator reads Inventory's open quantities.
 */
export async function getIssuedAgainstEstimate(
  unitId: string,
): Promise<IssuedAgainstEstimate | null> {
  await requireTool(GRANT);
  const supabase = await createClient();

  // The villa's plot: strictly 1:1 since 0029.
  const { data: unit, error: unitError } = await supabase
    .from("units")
    .select("plot_id")
    .eq("id", unitId)
    .maybeSingle();
  if (unitError) fail("the villa's plot", unitError);
  if (!unit?.plot_id) return null;

  const issues = await fetchAll<{ id: string; work_item_id: string | null }>((from, to) =>
    supabase
      .from("stock_issues")
      .select("id, work_item_id")
      .eq("plot_id", unit.plot_id!)
      .order("id")
      .range(from, to),
  );
  if (issues.length === 0) {
    return { lines: [], links: await materialLinks(supabase), itemNamesById: new Map() };
  }

  const workByIssue = new Map(issues.map((issue) => [issue.id, issue.work_item_id]));
  const lines = await fetchAll<{ issue_id: string; item_id: string; quantity: number }>(
    (from, to) =>
      supabase
        .from("stock_issue_lines")
        .select("issue_id, item_id, quantity")
        .in(
          "issue_id",
          issues.map((issue) => issue.id),
        )
        .order("id")
        .range(from, to),
  );

  const itemIds = [...new Set(lines.map((line) => line.item_id))];
  const { data: items, error: itemsError } = itemIds.length
    ? await supabase.from("items").select("id, name").in("id", itemIds)
    : { data: [], error: null };
  if (itemsError) fail("the issued items", itemsError);

  return {
    lines: lines.map((line) => ({
      workItemId: workByIssue.get(line.issue_id) ?? null,
      itemId: line.item_id,
      quantity: line.quantity,
    })),
    links: await materialLinks(supabase),
    itemNamesById: new Map((items ?? []).map((item) => [item.id, item.name])),
  };
}

async function materialLinks(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<{ materialId: string; itemId: string; itemUom: string; factor: number | null }[]> {
  const rows = await fetchAll<{
    id: string;
    uom: string;
    item_id: string | null;
    item_uom_factor: number | null;
    items: { default_uom: string } | null;
  }>((from, to) =>
    supabase
      .from("estimator_materials")
      .select("id, uom, item_id, item_uom_factor, items(default_uom)")
      .not("item_id", "is", null)
      .order("id")
      .range(from, to),
  );
  return rows
    .filter((row) => row.item_id !== null)
    .map((row) => ({
      materialId: row.id,
      itemId: row.item_id!,
      itemUom: row.items?.default_uom ?? "",
      factor: row.item_uom_factor,
    }));
}
