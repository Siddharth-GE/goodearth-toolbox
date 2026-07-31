import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { ItemKind } from "./items";

export type ItemCategoryRow = {
  id: string;
  name: string;
  kind: ItemKind;
  created_at: string;
};

export async function listItemCategories(kind?: ItemKind): Promise<ItemCategoryRow[]> {
  const supabase = await createClient();
  let query = supabase.from("item_categories").select("*").order("name");
  if (kind) query = query.eq("kind", kind);
  const { data } = await query;
  return (data ?? []) as ItemCategoryRow[];
}
