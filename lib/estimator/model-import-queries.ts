import "server-only";

import { requireTool } from "@/lib/auth/access";
import { listWorkCategories, listWorkGroups, listWorkItems } from "@/lib/masters/works";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import { isModelMeasure, type EstimateForModel, type WorkForModel } from "./model-takeoff";
import { fail, GRANT } from "./shared";

/** Reads for importing a SketchUp takeoff (0118) and for the works list SketchUp tags by. */

/** A work as the import and works list see it, in the works list's order: category, then work. */
export type WorkForModelRow = WorkForModel & {
  categoryCode: string;
  categoryName: string;
  groupCode: string | null;
  groupName: string | null;
};

export async function listWorksForModel(): Promise<WorkForModelRow[]> {
  await requireTool(GRANT);
  const supabase = await createClient();

  const [categories, groups, items, info] = await Promise.all([
    listWorkCategories(),
    listWorkGroups(),
    listWorkItems(),
    fetchAll<{ work_item_id: string; uom: string; model_measure: string | null }>((from, to) =>
      supabase
        .from("estimator_work_info")
        .select("work_item_id, uom, model_measure")
        .order("work_item_id")
        .range(from, to),
    ),
  ]);

  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const categoryRank = new Map(categories.map((category, index) => [category.id, index]));
  const groupById = new Map(groups.map((group) => [group.id, group]));
  const infoByWork = new Map(info.map((row) => [row.work_item_id, row]));
  const itemRank = new Map(items.map((item, index) => [item.id, index]));

  return [...items]
    .sort(
      (a, b) =>
        (categoryRank.get(a.category_id) ?? 0) - (categoryRank.get(b.category_id) ?? 0) ||
        (itemRank.get(a.id) ?? 0) - (itemRank.get(b.id) ?? 0),
    )
    .map((item) => {
      const category = categoryById.get(item.category_id);
      const group = item.group_id ? groupById.get(item.group_id) : undefined;
      const setup = infoByWork.get(item.id);
      const measure = setup?.model_measure;
      return {
        workItemId: item.id,
        code: item.code,
        name: item.name,
        isActive: item.is_active,
        uom: setup?.uom ?? null,
        modelMeasure: isModelMeasure(measure) ? measure : null,
        categoryCode: category?.code ?? "",
        categoryName: category?.name ?? "",
        groupCode: group?.code ?? null,
        groupName: group?.name ?? null,
      };
    });
}

export async function getVillaForModel(
  unitId: string,
): Promise<{ unitId: string; name: string } | null> {
  await requireTool(GRANT);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("units")
    .select("id, name")
    .eq("id", unitId)
    .maybeSingle();
  if (error) fail("the villa", error);
  return data ? { unitId: data.id, name: data.name } : null;
}

/** The villa's working estimate (0098) as the import sees it: the model it was last measured from, and each line's rows counted by source. */
export async function getWorkingEstimateForModel(unitId: string): Promise<EstimateForModel | null> {
  await requireTool(GRANT);
  const supabase = await createClient();

  const { data: header, error } = await supabase
    .from("estimator_estimates")
    .select("id, model_file, model_guid")
    .eq("unit_id", unitId)
    .eq("is_working", true)
    .maybeSingle();
  if (error) fail("the villa's working estimate", error);
  if (!header) return null;

  const read = await fetchAll<{
    id: string;
    work_item_id: string;
    label: string | null;
    created_at: string;
    qty: number | null;
  }>((from, to) =>
    supabase
      .from("estimator_estimate_lines")
      .select("id, work_item_id, label, created_at, qty")
      .eq("estimate_id", header.id)
      .order("id")
      .range(from, to),
  );
  // The model measures a work's first unlabelled row, else its first (import_model_rows, 0157): that row comes first.
  const lines = [...read].sort(
    (a, b) =>
      Number(a.label !== null) - Number(b.label !== null) ||
      a.created_at.localeCompare(b.created_at) ||
      a.id.localeCompare(b.id),
  );
  const rows =
    lines.length === 0
      ? []
      : await fetchAll<{ line_id: string; from_model: boolean }>((from, to) =>
          supabase
            .from("estimator_estimate_line_measurements")
            .select("line_id, from_model")
            .in(
              "line_id",
              lines.map((line) => line.id),
            )
            .order("id")
            .range(from, to),
        );

  const counts = new Map<string, { hand: number; model: number }>();
  for (const row of rows) {
    const count = counts.get(row.line_id) ?? { hand: 0, model: 0 };
    if (row.from_model) count.model += 1;
    else count.hand += 1;
    counts.set(row.line_id, count);
  }

  return {
    estimateId: header.id,
    modelFile: header.model_file,
    modelGuid: header.model_guid,
    lines: lines.map((line) => ({
      lineId: line.id,
      workItemId: line.work_item_id,
      qty: line.qty,
      handRows: counts.get(line.id)?.hand ?? 0,
      modelRows: counts.get(line.id)?.model ?? 0,
    })),
  };
}
