import "server-only";

import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";

/**
 * The works vocabulary the coming Estimator tool will price and schedule
 * (migration 0073): categories (FD — Foundation) hold optional groups
 * (FD.3 — Dry rubble footing) which hold work items (FD.4 — Excavation
 * for rubble foundation). Items without a group hang off the category
 * directly. This is a different vocabulary from construction_stages
 * (0053), which is what indents and construction budgets pick from —
 * the two coexist deliberately.
 */
export type WorkCategoryRow = {
  id: string;
  code: string;
  name: string;
  sort_order: number;
  is_active: boolean;
};

export type WorkGroupRow = {
  id: string;
  category_id: string;
  code: string;
  name: string;
  sort_order: number;
  is_active: boolean;
};

export type WorkItemRow = {
  id: string;
  category_id: string;
  group_id: string | null;
  code: string;
  name: string;
  sort_order: number;
  is_active: boolean;
};

// fetchAll for consistency with the other masters reads: every list
// here promises completeness, so none of them get to silently cap.
export async function listWorkCategories(): Promise<WorkCategoryRow[]> {
  const supabase = await createClient();
  const data = await fetchAll((from, to) =>
    supabase
      .from("work_categories")
      .select("id, code, name, sort_order, is_active")
      .order("sort_order")
      .order("code")
      .order("id")
      .range(from, to),
  );
  return data as WorkCategoryRow[];
}

export async function listWorkGroups(): Promise<WorkGroupRow[]> {
  const supabase = await createClient();
  const data = await fetchAll((from, to) =>
    supabase
      .from("work_groups")
      .select("id, category_id, code, name, sort_order, is_active")
      .order("sort_order")
      .order("code")
      .order("id")
      .range(from, to),
  );
  return data as WorkGroupRow[];
}

export async function listWorkItems(): Promise<WorkItemRow[]> {
  const supabase = await createClient();
  const data = await fetchAll((from, to) =>
    supabase
      .from("work_items")
      .select("id, category_id, group_id, code, name, sort_order, is_active")
      .order("sort_order")
      .order("code")
      .order("id")
      .range(from, to),
  );
  return data as WorkItemRow[];
}

export type WorksTreeGroup = {
  group: WorkGroupRow;
  items: WorkItemRow[];
};

export type WorksTreeCategory = {
  category: WorkCategoryRow;
  /** Items with no group — on the sheet these always precede the groups. */
  directItems: WorkItemRow[];
  groups: WorksTreeGroup[];
};

/** The whole vocabulary, shaped for the one Masters screen. */
export async function getWorksTree(): Promise<WorksTreeCategory[]> {
  const [categories, groups, items] = await Promise.all([
    listWorkCategories(),
    listWorkGroups(),
    listWorkItems(),
  ]);

  return categories.map((category) => {
    const categoryGroups = groups.filter((g) => g.category_id === category.id);
    const categoryItems = items.filter((i) => i.category_id === category.id);
    return {
      category,
      directItems: categoryItems.filter((i) => i.group_id === null),
      groups: categoryGroups.map((group) => ({
        group,
        items: categoryItems.filter((i) => i.group_id === group.id),
      })),
    };
  });
}
