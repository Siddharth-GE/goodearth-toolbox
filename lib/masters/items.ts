import "server-only";

import { createClient } from "@/lib/supabase/server";

// The value lists live in ./constants (import-free, so actions files can
// use them as values); the types are re-exported here because this module
// is where readers of item data already look for them.
export type { ItemKind, Placement } from "./constants";
import type { ItemKind, Placement } from "./constants";

export type ItemRow = {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  kind: ItemKind;
  category_id: string;
  brand_id: string | null;
  placement: Placement | null;
  default_uom: string;
  indicative_price: number | null;
  image_url: string | null;
  thumb_url: string | null;
  source_url: string | null;
  is_active: boolean;
  created_at: string;
};

const ITEMS_PAGE_SIZE = 50;

export type ItemFilters = {
  kind?: ItemKind;
  categoryId?: string;
  search?: string;
  /** 1-based. Out-of-range values are clamped, never error. */
  page?: number;
  pageSize?: number;
};

export type ItemPage = {
  items: ItemRow[];
  /** Total matching the filters, not the number returned on this page. */
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export async function listItems(filters: ItemFilters = {}): Promise<ItemPage> {
  const supabase = await createClient();
  const pageSize = Math.max(1, filters.pageSize ?? ITEMS_PAGE_SIZE);

  // Supabase caps any un-ranged query at 1,000 rows, so an unpaginated list
  // would silently hide the rest of the ~2,600-item catalogue. Always range.
  const build = (page: number) => {
    let query = supabase
      .from("items")
      .select("*", { count: "exact" })
      .order("name")
      // Names repeat heavily (hundreds of rows are literally "Hanging
      // Light"), and Postgres gives no stable order within a tie — without a
      // unique tiebreaker the same row can appear on two pages while another
      // never appears at all.
      .order("id")
      .range((page - 1) * pageSize, page * pageSize - 1);
    if (filters.kind) query = query.eq("kind", filters.kind);
    if (filters.categoryId) query = query.eq("category_id", filters.categoryId);
    if (filters.search) {
      // `,` `(` `)` are PostgREST's or-filter delimiters — a stray comma in the
      // search box would otherwise build a malformed filter, so strip them.
      const search = filters.search.replace(/[,()]/g, " ").trim();
      if (search) query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%`);
    }
    return query;
  };

  const requested = Math.max(1, Math.floor(filters.page ?? 1));
  const first = await build(requested);
  let data = first.data;
  const total = first.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  // Asking for page 40 of a 3-page result (stale link, filter just changed)
  // returns an empty range rather than an error — re-fetch the last real page
  // so the screen shows rows instead of a bare "no items found".
  let page = requested;
  if (requested > pageCount && total > 0) {
    page = pageCount;
    ({ data } = await build(page));
  }

  return { items: (data ?? []) as ItemRow[], total, page, pageSize, pageCount };
}
