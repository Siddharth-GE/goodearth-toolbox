import "server-only";

import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";

/**
 * Categories hold optional groups, which hold items; items without a group hang off the category.
 * Not construction_stages (0053), which indents and budgets pick from.
 */
export type WorkCategoryRow = {
  id: string;
  code: string;
  name: string;
  /** Site Mobilisation, Infrastructure - Civil / MEP, Buildings or Maintenance (0131). */
  family: string;
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

/** A category as pickers show it: two families both have a Landscape. */
export const workCategoryLabel = (category: { family: string; name: string }) =>
  `${category.family} · ${category.name}`;

export async function listWorkCategories(): Promise<WorkCategoryRow[]> {
  const supabase = await createClient();
  const data = await fetchAll((from, to) =>
    supabase
      .from("work_categories")
      .select("id, code, name, family, sort_order, is_active")
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
