import "server-only";

import { requireTool } from "@/lib/auth/access";
import { listActiveUomNames } from "@/lib/masters/uoms";
import { listWorkCategories, listWorkGroups, listWorkItems } from "@/lib/masters/works";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { readFailed } from "@/lib/supabase/read-failed";
import { createClient } from "@/lib/supabase/server";
import type { FrozenLineRow, FrozenTakeoffRow, MaterialDef, MixDef, WorkRecipe } from "./calc";
import { compareIssuesToEstimate } from "./compare";

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
 * No embeds: the estimates list needs villa names, and `units` has had
 * two foreign keys to `plots` since 0029, so a bare embed answers HTTP
 * 300 at runtime while compiling perfectly (BUGCATCHER #2). Names are
 * merged through a Map instead — the Directory pattern.
 *
 * Since 0086 the material vocabulary IS the items master (founder:
 * "materials are exactly the same as in the items master") — the rate
 * is `items.indicative_price`, the unit is `items.default_uom`, and
 * `estimator_materials` survives only to resolve components and frozen
 * takeoff rows from before that day.
 */

const GRANT = "/estimator";

const fail = (context: string, error: { message: string }): never =>
  readFailed("estimator", context, error);

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
    // Since 0086 the material list IS the items master's material band.
    supabase
      .from("items")
      .select("id", { count: "exact", head: true })
      .eq("kind", "material")
      .eq("is_active", true),
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

/** A master item wearing its material hat: the rate is Masters'
 * indicative price, the unit is how stock moves. Since 0086 (founder:
 * "materials are exactly the same as in the items master") this is the
 * whole material vocabulary — there is no separate list to maintain. */
export type MaterialItemRow = {
  id: string;
  name: string;
  uom: string;
  /** items.indicative_price — null = nobody has priced it in Masters. */
  rate: number | null;
  isActive: boolean;
};

export async function listMaterialItems(): Promise<MaterialItemRow[]> {
  await requireTool(GRANT);
  const supabase = await createClient();

  const rows = await fetchAll<{
    id: string;
    name: string;
    default_uom: string;
    indicative_price: number | null;
    is_active: boolean;
  }>((from, to) =>
    supabase
      .from("items")
      .select("id, name, default_uom, indicative_price, is_active")
      .eq("kind", "material")
      .order("name")
      .order("id")
      .range(from, to),
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    uom: row.default_uom,
    rate: row.indicative_price,
    isActive: row.is_active,
  }));
}

/** MaterialDefs for exactly the referenced items — the recipe book and
 * the mix/work screens resolve components through this. */
async function itemDefsByIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[],
): Promise<Map<string, MaterialDef>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase
    .from("items")
    .select("id, name, default_uom, indicative_price")
    .in("id", ids);
  if (error) fail("the materials", error);
  return new Map(
    (data ?? []).map((row) => [
      row.id,
      { id: row.id, name: row.name, uom: row.default_uom, rate: row.indicative_price },
    ]),
  );
}

// ---------------------------------------------------------------------
// Units of measure (0075) — the master behind every uom picker
// ---------------------------------------------------------------------

/** Active unit names in picker order — since 0082 the ONE Masters list,
 * not the tool's own (estimator_uoms is retired in place; the table
 * stays, nothing reads it). Managing the list lives in Masters. */
export async function listUomNames(): Promise<string[]> {
  await requireTool(GRANT);
  return listActiveUomNames();
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
  /** The item id since 0086; a legacy estimator_materials id before. */
  materialId: string;
  materialName: string;
  materialUom: string;
  materialRate: number | null;
  qtyPerUnit: number;
  /** true = a pre-0086 row still priced off the retired materials list. */
  legacy: boolean;
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

  const [components, legacyMaterials] = await Promise.all([
    fetchAll<{
      id: string;
      material_id: string | null;
      item_id: string | null;
      qty_per_unit: number;
    }>((from, to) =>
      supabase
        .from("estimator_mix_components")
        .select("id, material_id, item_id, qty_per_unit")
        .eq("mix_id", mixId)
        .order("id")
        .range(from, to),
    ),
    listMaterialsRaw(supabase),
  ]);
  const itemDefs = await itemDefsByIds(supabase, [
    ...new Set(components.flatMap((c) => (c.item_id ? [c.item_id] : []))),
  ]);
  const legacyById = new Map(legacyMaterials.map((m) => [m.id, m]));

  return {
    id: mix.id,
    name: mix.name,
    uom: mix.uom,
    description: mix.description,
    isActive: mix.is_active,
    components: components
      .map((component) => {
        const def = component.item_id
          ? itemDefs.get(component.item_id)
          : legacyById.get(component.material_id ?? "");
        return {
          id: component.id,
          materialId: component.item_id ?? component.material_id ?? "",
          materialName: def?.name ?? "Unknown material",
          materialUom: def?.uom ?? "",
          materialRate: def?.rate ?? null,
          qtyPerUnit: component.qty_per_unit,
          legacy: component.item_id === null,
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
      item_id: string | null;
      mix_id: string | null;
      qty_per_unit: number;
    }>((from, to) =>
      supabase
        .from("estimator_work_components")
        .select("id, material_id, item_id, mix_id, qty_per_unit")
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
  const itemDefs = await itemDefsByIds(supabase, [
    ...new Set(components.flatMap((c) => (c.item_id ? [c.item_id] : []))),
  ]);

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
      if (component.item_id || component.material_id) {
        // An item since 0086; a legacy material row before it.
        const def = component.item_id
          ? itemDefs.get(component.item_id)
          : materialsById.get(component.material_id ?? "");
        return {
          id: component.id,
          kind: "material" as const,
          refId: component.item_id ?? component.material_id ?? "",
          name: def?.name ?? "Unknown material",
          uom: def?.uom ?? "",
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
  /** Which MaterialDef ids are master ITEMS (0086) — the snapshot
   * writer needs to know which column a takeoff row anchors on. */
  itemIds: string[];
};

export async function getRecipeBook(): Promise<RecipeBook> {
  await requireTool(GRANT);
  const supabase = await createClient();

  const [legacyMaterials, mixes, mixComponents, info, workComponents] = await Promise.all([
    listMaterialsRaw(supabase),
    fetchAll<{ id: string; name: string; uom: string }>((from, to) =>
      supabase.from("estimator_mixes").select("id, name, uom").order("id").range(from, to),
    ),
    fetchAll<{
      mix_id: string;
      material_id: string | null;
      item_id: string | null;
      qty_per_unit: number;
    }>((from, to) =>
      supabase
        .from("estimator_mix_components")
        .select("mix_id, material_id, item_id, qty_per_unit")
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
      item_id: string | null;
      mix_id: string | null;
      qty_per_unit: number;
    }>((from, to) =>
      supabase
        .from("estimator_work_components")
        .select("work_item_id, material_id, item_id, mix_id, qty_per_unit")
        .order("id")
        .range(from, to),
    ),
  ]);

  // Since 0086 a component's material IS a master item; rows from
  // before that resolve through the retired estimator_materials list.
  // calc.ts never knows the difference — a MaterialDef is a MaterialDef.
  const itemDefs = await itemDefsByIds(supabase, [
    ...new Set(
      [...mixComponents, ...workComponents].flatMap((row) => (row.item_id ? [row.item_id] : [])),
    ),
  ]);

  const componentsByMix = new Map<string, { materialId: string; qtyPerUnit: number }[]>();
  for (const row of mixComponents) {
    const sourceId = row.item_id ?? row.material_id;
    if (!sourceId) continue;
    const list = componentsByMix.get(row.mix_id) ?? [];
    list.push({ materialId: sourceId, qtyPerUnit: row.qty_per_unit });
    componentsByMix.set(row.mix_id, list);
  }

  const componentsByWork = new Map<
    string,
    { materialId: string | null; mixId: string | null; qtyPerUnit: number }[]
  >();
  for (const row of workComponents) {
    const list = componentsByWork.get(row.work_item_id) ?? [];
    list.push({
      materialId: row.item_id ?? row.material_id,
      mixId: row.mix_id,
      qtyPerUnit: row.qty_per_unit,
    });
    componentsByWork.set(row.work_item_id, list);
  }

  return {
    materials: [
      ...itemDefs.values(),
      ...legacyMaterials.map((m) => ({ id: m.id, name: m.name, uom: m.uom, rate: m.rate })),
    ],
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
    itemIds: [...itemDefs.keys()],
  };
}

// ---------------------------------------------------------------------
// Per-villa variations (0087)
// ---------------------------------------------------------------------

/** One row of a line's own recipe, raw — the screen resolves names
 * through the book and extraMaterials. */
export type LineVariationRow = {
  id: string;
  itemId: string | null;
  mixId: string | null;
  materialId: string | null;
  qtyPerUnit: number;
};

export type EstimateVariations = {
  /** line_id → its components. A line present here IS customised: its
   * list replaces the standard whole (0087 — no deltas). */
  byLine: Map<string, LineVariationRow[]>;
  /** work_item_id → calc-ready components, for merging into recipes. */
  byWork: Map<string, WorkRecipe["components"]>;
  /** work_item_id → this villa's labour rate (0088). Absent = standard. */
  labourRateByWork: Map<string, number>;
  /** material/item id → this villa's price (0088). Absent = Masters'. */
  rateByMaterialId: Map<string, number>;
  /** The price overrides as rows, for the screen to render and clear. */
  itemRates: { id: string; itemId: string | null; materialId: string | null; rate: number }[];
  /** Defs for variation items the global book may not know. */
  extraMaterials: MaterialDef[];
  /** Which of those defs are master items (snapshot anchoring). */
  extraItemIds: string[];
};

const NO_VARIATIONS: EstimateVariations = {
  byLine: new Map(),
  byWork: new Map(),
  labourRateByWork: new Map(),
  rateByMaterialId: new Map(),
  itemRates: [],
  extraMaterials: [],
  extraItemIds: [],
};

export async function getEstimateVariations(estimateId: string): Promise<EstimateVariations> {
  await requireTool(GRANT);
  const supabase = await createClient();

  const [lines, itemRates] = await Promise.all([
    fetchAll<{ id: string; work_item_id: string; labour_rate: number | null }>((from, to) =>
      supabase
        .from("estimator_estimate_lines")
        .select("id, work_item_id, labour_rate")
        .eq("estimate_id", estimateId)
        .order("id")
        .range(from, to),
    ),
    fetchAll<{ id: string; item_id: string | null; material_id: string | null; rate: number }>(
      (from, to) =>
        supabase
          .from("estimator_estimate_item_rates")
          .select("id, item_id, material_id, rate")
          .eq("estimate_id", estimateId)
          .order("id")
          .range(from, to),
    ),
  ]);

  // Prices are per (estimate, material) — no line needed, so they stand
  // even on an estimate whose works carry no recipe variation.
  const rateByMaterialId = new Map<string, number>();
  for (const row of itemRates) {
    const id = row.item_id ?? row.material_id;
    if (id) rateByMaterialId.set(id, row.rate);
  }
  const shapedRates = itemRates.map((row) => ({
    id: row.id,
    itemId: row.item_id,
    materialId: row.material_id,
    rate: row.rate,
  }));
  const labourRateByWork = new Map<string, number>();
  for (const line of lines) {
    if (line.labour_rate !== null) labourRateByWork.set(line.work_item_id, line.labour_rate);
  }

  if (lines.length === 0) {
    return { ...NO_VARIATIONS, rateByMaterialId, itemRates: shapedRates };
  }

  const components = await fetchAll<{
    id: string;
    line_id: string;
    item_id: string | null;
    mix_id: string | null;
    material_id: string | null;
    qty_per_unit: number;
  }>((from, to) =>
    supabase
      .from("estimator_estimate_line_components")
      .select("id, line_id, item_id, mix_id, material_id, qty_per_unit")
      .in(
        "line_id",
        lines.map((line) => line.id),
      )
      .order("id")
      .range(from, to),
  );

  const itemDefs = await itemDefsByIds(supabase, [
    ...new Set(components.flatMap((row) => (row.item_id ? [row.item_id] : []))),
  ]);

  const byLine = new Map<string, LineVariationRow[]>();
  for (const row of components) {
    const bucket = byLine.get(row.line_id) ?? [];
    bucket.push({
      id: row.id,
      itemId: row.item_id,
      mixId: row.mix_id,
      materialId: row.material_id,
      qtyPerUnit: row.qty_per_unit,
    });
    byLine.set(row.line_id, bucket);
  }

  const workByLine = new Map(lines.map((line) => [line.id, line.work_item_id]));
  const byWork = new Map<string, WorkRecipe["components"]>();
  for (const [lineId, rows] of byLine) {
    const workItemId = workByLine.get(lineId);
    if (!workItemId) continue;
    byWork.set(
      workItemId,
      rows.map((row) => ({
        materialId: row.itemId ?? row.materialId,
        mixId: row.mixId,
        qtyPerUnit: row.qtyPerUnit,
      })),
    );
  }

  return {
    byLine,
    byWork,
    labourRateByWork,
    rateByMaterialId,
    itemRates: shapedRates,
    extraMaterials: [...itemDefs.values()],
    extraItemIds: [...itemDefs.keys()],
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
  /** This villa's labour rate (0088); null = the work's standard. */
  labourRate: number | null;
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
    fetchAll<{
      id: string;
      work_item_id: string;
      qty: number;
      note: string | null;
      labour_rate: number | null;
    }>((from, to) =>
      supabase
        .from("estimator_estimate_lines")
        .select("id, work_item_id, qty, note, labour_rate")
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
          material_id: string | null;
          item_id: string | null;
          material_name: string;
          uom: string;
          quantity: number;
          rate: number | null;
        }>((from, to) =>
          supabase
            .from("estimator_estimate_takeoff")
            .select("work_item_id, material_id, item_id, material_name, uom, quantity, rate")
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
              materialId: row.item_id ?? row.material_id ?? "",
              itemId: row.item_id,
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
          labourRate: line.labour_rate,
          note: line.note,
        };
      })
      // Sheet order: the works vocabulary is already sorted, so sorting
      // by code keeps an estimate reading the way the site team reads it.
      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })),
  };
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
 * Every quantity that reached the estimate's villa, with the work it
 * was tagged with: stock issues out of a store (0080) AND deliveries
 * received straight to site (0081) — a to-site GRN never passes
 * through a store, so skipping it would under-count everything bought
 * in bulk and unloaded at the plot. Inventory's reads are open to all
 * signed-in staff (no money anywhere in that tool), so this needs no
 * view — the one-way rule stays: Inventory never reads the estimator's
 * tables, the estimator reads Inventory's open quantities.
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

  const [issues, receipts] = await Promise.all([
    fetchAll<{ id: string; work_item_id: string | null }>((from, to) =>
      supabase
        .from("stock_issues")
        .select("id, work_item_id")
        .eq("plot_id", unit.plot_id!)
        .order("id")
        .range(from, to),
    ),
    // Direct-to-site deliveries: matched on the plot OR the unit — a
    // to-site GRN carries whichever its PO named (0023).
    fetchAll<{ id: string; work_item_id: string | null }>((from, to) =>
      supabase
        .from("goods_receipts")
        .select("id, work_item_id")
        .eq("to_site", true)
        .or(`plot_id.eq.${unit.plot_id},unit_id.eq.${unitId}`)
        .order("id")
        .range(from, to),
    ),
  ]);
  if (issues.length === 0 && receipts.length === 0) {
    return { lines: [], links: await materialLinks(supabase), itemNamesById: new Map() };
  }

  const workByIssue = new Map(issues.map((issue) => [issue.id, issue.work_item_id]));
  const workByReceipt = new Map(receipts.map((receipt) => [receipt.id, receipt.work_item_id]));
  const [issueLines, receiptLines] = await Promise.all([
    issues.length
      ? fetchAll<{ issue_id: string; item_id: string; quantity: number }>((from, to) =>
          supabase
            .from("stock_issue_lines")
            .select("issue_id, item_id, quantity")
            .in(
              "issue_id",
              issues.map((issue) => issue.id),
            )
            .order("id")
            .range(from, to),
        )
      : Promise.resolve([]),
    receipts.length
      ? fetchAll<{ receipt_id: string; item_id: string; quantity: number }>((from, to) =>
          supabase
            .from("goods_receipt_lines")
            .select("receipt_id, item_id, quantity")
            .in(
              "receipt_id",
              receipts.map((receipt) => receipt.id),
            )
            .order("id")
            .range(from, to),
        )
      : Promise.resolve([]),
  ]);

  const lines = [
    ...issueLines.map((line) => ({
      workItemId: workByIssue.get(line.issue_id) ?? null,
      itemId: line.item_id,
      quantity: line.quantity,
    })),
    ...receiptLines.map((line) => ({
      workItemId: workByReceipt.get(line.receipt_id) ?? null,
      itemId: line.item_id,
      quantity: line.quantity,
    })),
  ];

  const itemIds = [...new Set(lines.map((line) => line.itemId))];
  const { data: items, error: itemsError } = itemIds.length
    ? await supabase.from("items").select("id, name").in("id", itemIds)
    : { data: [], error: null };
  if (itemsError) fail("the issued items", itemsError);

  return {
    lines,
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

// ---------------------------------------------------------------------
// Reconciliation approvals (0083)
// ---------------------------------------------------------------------

export type ReconciliationApproval = {
  workItemId: string | null;
  itemId: string;
  note: string | null;
  approvedByName: string;
  approvedAt: string;
};

/**
 * The estimator's acknowledgements of material that reached the villa
 * outside the official estimate's plan. The PENDING side is never
 * stored — compare.ts derives it from what actually arrived — so this
 * reads only the approvals and the page lines the two up by
 * (work, item). The flag itself is permanent either way; an approval
 * changes who has looked, not what happened.
 */
export async function getReconciliationApprovals(
  estimateId: string,
): Promise<ReconciliationApproval[]> {
  await requireTool(GRANT);
  const supabase = await createClient();

  const rows = await fetchAll<{
    work_item_id: string | null;
    item_id: string;
    note: string | null;
    created_by: string | null;
    created_at: string;
  }>((from, to) =>
    supabase
      .from("estimator_reconciliation_approvals")
      .select("work_item_id, item_id, note, created_by, created_at")
      .eq("estimate_id", estimateId)
      .order("created_at")
      .range(from, to),
  );
  if (rows.length === 0) return [];

  const approverIds = [...new Set(rows.map((row) => row.created_by).filter((id) => id !== null))];
  const { data: approvers, error } = approverIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", approverIds)
    : { data: [], error: null };
  if (error) fail("the approvers' names", error);
  const nameById = new Map((approvers ?? []).map((profile) => [profile.id, profile.full_name]));

  return rows.map((row) => ({
    workItemId: row.work_item_id,
    itemId: row.item_id,
    note: row.note,
    approvedByName: (row.created_by ? nameById.get(row.created_by) : null) ?? "a colleague",
    approvedAt: row.created_at,
  }));
}

/* ------------------------------------------------------------------ *
 * Overruns on the welcome (Phase 2 Step I)
 *
 * How many villas have drawn past their official estimate — derived
 * fresh from the frozen takeoffs and the plots' movements, never
 * stored (the 0083 principle), so a revision that now covers the
 * material clears the count by itself. Batched: six reads for ALL
 * officials, not four per villa — the welcome renders on every visit.
 * ------------------------------------------------------------------ */

export async function countVillasOverEstimate(): Promise<number> {
  await requireTool(GRANT);
  const supabase = await createClient();

  const officials = await fetchAll<{ id: string; unit_id: string | null }>((from, to) =>
    supabase
      .from("estimator_estimates")
      .select("id, unit_id")
      .eq("status", "submitted")
      .order("id")
      .range(from, to),
  );
  const unitIds = officials.flatMap((estimate) => (estimate.unit_id ? [estimate.unit_id] : []));
  if (unitIds.length === 0) return 0;

  const [unitsResult, takeoff, links] = await Promise.all([
    supabase.from("units").select("id, plot_id").in("id", unitIds),
    fetchAll<{
      estimate_id: string;
      work_item_id: string;
      material_id: string | null;
      item_id: string | null;
      material_name: string;
      uom: string;
      quantity: number;
    }>((from, to) =>
      supabase
        .from("estimator_estimate_takeoff")
        .select("estimate_id, work_item_id, material_id, item_id, material_name, uom, quantity")
        .in(
          "estimate_id",
          officials.map((estimate) => estimate.id),
        )
        .order("id")
        .range(from, to),
    ),
    materialLinks(supabase),
  ]);
  // An item-keyed row (0086) is its own link: the frozen quantity is
  // already in the item's unit, so the identity link converts 1:1.
  const identityLinks = [
    ...new Map(
      takeoff
        .filter((row) => row.item_id !== null)
        .map((row) => [
          row.item_id as string,
          {
            materialId: row.item_id as string,
            itemId: row.item_id as string,
            itemUom: row.uom,
            factor: null,
          },
        ]),
    ).values(),
  ];
  const allLinks = [...links, ...identityLinks];
  if (unitsResult.error) fail("the villas", unitsResult.error);
  const plotByUnit = new Map(
    (unitsResult.data ?? []).map((unit) => [unit.id, unit.plot_id as string]),
  );
  const plotIds = [...plotByUnit.values()];

  const [issues, receipts] = await Promise.all([
    fetchAll<{ id: string; plot_id: string | null; work_item_id: string | null }>((from, to) =>
      supabase
        .from("stock_issues")
        .select("id, plot_id, work_item_id")
        .in("plot_id", plotIds)
        .order("id")
        .range(from, to),
    ),
    fetchAll<{
      id: string;
      plot_id: string | null;
      unit_id: string | null;
      work_item_id: string | null;
    }>((from, to) =>
      supabase
        .from("goods_receipts")
        .select("id, plot_id, unit_id, work_item_id")
        .eq("to_site", true)
        .or(`plot_id.in.(${plotIds.join(",")}),unit_id.in.(${unitIds.join(",")})`)
        .order("id")
        .range(from, to),
    ),
  ]);

  const [issueLines, receiptLines] = await Promise.all([
    issues.length
      ? fetchAll<{ issue_id: string; item_id: string; quantity: number }>((from, to) =>
          supabase
            .from("stock_issue_lines")
            .select("issue_id, item_id, quantity")
            .in(
              "issue_id",
              issues.map((issue) => issue.id),
            )
            .order("id")
            .range(from, to),
        )
      : Promise.resolve([]),
    receipts.length
      ? fetchAll<{ receipt_id: string; item_id: string; quantity: number }>((from, to) =>
          supabase
            .from("goods_receipt_lines")
            .select("receipt_id, item_id, quantity")
            .in(
              "receipt_id",
              receipts.map((receipt) => receipt.id),
            )
            .order("id")
            .range(from, to),
        )
      : Promise.resolve([]),
  ]);

  // Movements keyed to the estimate whose villa they landed on.
  const estimateByUnit = new Map(
    officials.flatMap((estimate) => (estimate.unit_id ? [[estimate.unit_id, estimate.id]] : [])),
  );
  const estimateByPlot = new Map(
    [...plotByUnit].flatMap(([unitId, plotId]) => {
      const estimateId = estimateByUnit.get(unitId);
      return estimateId ? [[plotId, estimateId] as const] : [];
    }),
  );
  const issueTarget = new Map(
    issues.flatMap((issue) => {
      const estimateId = issue.plot_id ? estimateByPlot.get(issue.plot_id) : undefined;
      return estimateId ? [[issue.id, { estimateId, work: issue.work_item_id }] as const] : [];
    }),
  );
  const receiptTarget = new Map(
    receipts.flatMap((receipt) => {
      const estimateId =
        (receipt.unit_id && estimateByUnit.get(receipt.unit_id)) ||
        (receipt.plot_id && estimateByPlot.get(receipt.plot_id)) ||
        undefined;
      return estimateId ? [[receipt.id, { estimateId, work: receipt.work_item_id }] as const] : [];
    }),
  );

  const linesByEstimate = new Map<
    string,
    { workItemId: string | null; itemId: string; quantity: number }[]
  >();
  const push = (
    target: { estimateId: string; work: string | null } | undefined,
    itemId: string,
    quantity: number,
  ) => {
    if (!target) return;
    const bucket = linesByEstimate.get(target.estimateId) ?? [];
    bucket.push({ workItemId: target.work, itemId, quantity });
    linesByEstimate.set(target.estimateId, bucket);
  };
  for (const line of issueLines) push(issueTarget.get(line.issue_id), line.item_id, line.quantity);
  for (const line of receiptLines) {
    push(receiptTarget.get(line.receipt_id), line.item_id, line.quantity);
  }

  let over = 0;
  for (const estimate of officials) {
    const issued = linesByEstimate.get(estimate.id) ?? [];
    if (issued.length === 0) continue;
    const rows = takeoff
      .filter((row) => row.estimate_id === estimate.id)
      .map((row) => ({
        workItemId: row.work_item_id,
        materialId: row.item_id ?? row.material_id ?? "",
        materialName: row.material_name,
        uom: row.uom,
        quantity: row.quantity,
      }));
    const comparison = compareIssuesToEstimate(rows, allLinks, issued);
    if (comparison.rows.some((row) => row.over)) over++;
  }
  return over;
}
