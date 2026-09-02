import "server-only";

import { requireTool } from "@/lib/auth/access";
import { listWorkCategories, listWorkGroups, listWorkItems } from "@/lib/masters/works";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import { listMixes } from "./mixes-queries";
import { fail, GRANT, itemDefsByIds, listMaterialsRaw } from "./shared";

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
