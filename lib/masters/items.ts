import "server-only";

import { createClient } from "@/lib/supabase/server";

export type ItemKind = "catalogue" | "material";
export type Placement = "fixed" | "loose" | "soft_furnishing";
export type Uom = "each" | "rft" | "sqft" | "lumpsum" | "bag" | "kg" | "litre" | "cft";

export const ITEM_KINDS: ItemKind[] = ["catalogue", "material"];

export type ItemRow = {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  kind: ItemKind;
  category_id: string;
  brand_id: string | null;
  placement: Placement | null;
  default_uom: Uom;
  indicative_price: number | null;
  image_url: string | null;
  thumb_url: string | null;
  source_url: string | null;
  is_active: boolean;
  created_at: string;
};

export type ItemFilters = { kind?: ItemKind; categoryId?: string; search?: string };

export async function listItems(filters: ItemFilters = {}): Promise<ItemRow[]> {
  const supabase = await createClient();
  let query = supabase.from("items").select("*").order("name");
  if (filters.kind) query = query.eq("kind", filters.kind);
  if (filters.categoryId) query = query.eq("category_id", filters.categoryId);
  if (filters.search) {
    // `,` `(` `)` are PostgREST's or-filter delimiters — a stray comma in the
    // search box would otherwise build a malformed filter, so strip them.
    const search = filters.search.replace(/[,()]/g, " ").trim();
    if (search) query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%`);
  }
  const { data } = await query;
  return (data ?? []) as ItemRow[];
}
