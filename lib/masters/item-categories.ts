import "server-only";

import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import type { ItemKind } from "./items";

export type ItemCategoryRow = {
  id: string;
  name: string;
  kind: ItemKind;
  is_active: boolean;
  created_at: string;
};

// fetchAll for consistency with the other masters reads: every list
// here promises completeness, so none of them get to silently cap.
export async function listItemCategories(kind?: ItemKind): Promise<ItemCategoryRow[]> {
  const supabase = await createClient();
  const data = await fetchAll((from, to) => {
    let query = supabase
      .from("item_categories")
      .select("*")
      .order("name")
      .order("id")
      .range(from, to);
    if (kind) query = query.eq("kind", kind);
    return query;
  });
  return data as ItemCategoryRow[];
}
