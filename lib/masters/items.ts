import "server-only";

import { createClient } from "@/lib/supabase/server";
import { readFailed } from "@/lib/supabase/read-failed";

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
  /** Entered by hand; a PO line offers it first (0131). Null: nobody has entered it. */
  gst_pct: number | null;
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
  page?: number;
  pageSize?: number;
};

export type ItemPage = {
  items: ItemRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export async function listItems(filters: ItemFilters = {}): Promise<ItemPage> {
  const supabase = await createClient();
  const pageSize = Math.max(1, filters.pageSize ?? ITEMS_PAGE_SIZE);

  // Supabase caps an un-ranged query at 1,000 rows, so always range.
  const build = (page: number) => {
    let query = supabase
      .from("items")
      .select("*", { count: "exact" })
      .order("name")
      // Names repeat, so add a unique tiebreaker or a row can show on two pages.
      .order("id")
      .range((page - 1) * pageSize, page * pageSize - 1);
    if (filters.kind) query = query.eq("kind", filters.kind);
    if (filters.categoryId) query = query.eq("category_id", filters.categoryId);
    if (filters.search) {
      // `,` `(` `)` are or-filter delimiters; strip them from the search.
      const search = filters.search.replace(/[,()]/g, " ").trim();
      if (search) query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%`);
    }
    return query;
  };

  const requested = Math.max(1, Math.floor(filters.page ?? 1));
  const first = await build(requested);
  if (first.error) readFailed("Masters", "the items list", first.error);
  let data = first.data;
  const total = first.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  // A page past the end returns an empty range: re-fetch the last real page.
  let page = requested;
  if (requested > pageCount && total > 0) {
    page = pageCount;
    const last = await build(page);
    if (last.error) readFailed("Masters", "the items list", last.error);
    data = last.data;
  }

  return { items: (data ?? []) as ItemRow[], total, page, pageSize, pageCount };
}
