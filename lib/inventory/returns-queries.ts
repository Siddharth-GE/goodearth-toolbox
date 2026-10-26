import "server-only";

import { requireTool } from "@/lib/auth/access";
import { labelsById, profileNames } from "@/lib/masters/names";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";

import { INVENTORY_LIST_LIMIT, itemsById, listActiveStores, type ItemFacts } from "./queries";

/** Material back from a villa to a store (0159): what a villa holds to send back, and the returns made. */

export type VillaHolding = ItemFacts & { quantity: number };

/** What has reached a villa and is still there, by item: what can come back. */
export async function listVillaHoldings(plotId: string): Promise<VillaHolding[]> {
  await requireTool("/inventory");
  const supabase = await createClient();
  const rows = await fetchAll<{ item_id: string | null; quantity: number | null }>((from, to) =>
    supabase
      .from("stock_by_location")
      .select("item_id, quantity")
      .eq("location_kind", "plot")
      .eq("location_id", plotId)
      .gt("quantity", 0)
      .order("item_id")
      .range(from, to),
  );
  const held = rows.filter(
    (row): row is { item_id: string; quantity: number } =>
      row.item_id !== null && row.quantity !== null,
  );
  const items = await itemsById(
    supabase,
    held.map((row) => row.item_id),
  );
  return held
    .flatMap((row) => {
      const item = items.get(row.item_id);
      return item ? [{ ...item, quantity: row.quantity }] : [];
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export type SiteReturnRow = {
  id: string;
  returned_on: string;
  villa_name: string;
  store_name: string;
  reason: string;
  lines: { item_name: string; quantity: number; uom: string }[];
  returned_by_name: string | null;
};

export type SiteReturnPage = {
  returns: SiteReturnRow[];
  stores: { id: string; name: string }[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
};

export async function listSiteReturns({
  page = 1,
}: { page?: number } = {}): Promise<SiteReturnPage> {
  await requireTool("/inventory");
  const supabase = await createClient();
  const pageSize = INVENTORY_LIST_LIMIT;
  const currentPage = Math.max(1, page);

  const [{ data, count, error }, stores] = await Promise.all([
    supabase
      .from("site_returns")
      .select("id, plot_id, store_id, returned_on, reason, created_by", { count: "exact" })
      .order("returned_on", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id")
      .range((currentPage - 1) * pageSize, currentPage * pageSize - 1),
    listActiveStores(supabase),
  ]);
  if (error) {
    console.error("listSiteReturns failed:", error);
    throw new Error("Could not read the returns.", { cause: error });
  }
  const rows = data ?? [];
  const lines = rows.length
    ? await fetchAll<{ return_id: string; item_id: string; quantity: number; uom: string }>(
        (from, to) =>
          supabase
            .from("site_return_lines")
            .select("return_id, item_id, quantity, uom")
            .in(
              "return_id",
              rows.map((row) => row.id),
            )
            .order("id")
            .range(from, to),
      )
    : [];
  const [items, plots, storeNames, names] = await Promise.all([
    itemsById(
      supabase,
      lines.map((line) => line.item_id),
    ),
    labelsById(
      supabase,
      "plots",
      rows.map((row) => row.plot_id),
    ),
    labelsById(
      supabase,
      "stores",
      rows.map((row) => row.store_id),
    ),
    profileNames(
      supabase,
      rows.map((row) => row.created_by),
    ),
  ]);

  const total = count ?? 0;
  return {
    returns: rows.map((row) => ({
      id: row.id,
      returned_on: row.returned_on,
      villa_name: plots.get(row.plot_id) ?? "—",
      store_name: storeNames.get(row.store_id) ?? "—",
      reason: row.reason,
      lines: lines
        .filter((line) => line.return_id === row.id)
        .map((line) => ({
          item_name: items.get(line.item_id)?.name ?? "An item",
          quantity: line.quantity,
          uom: line.uom,
        })),
      returned_by_name: row.created_by ? (names.get(row.created_by) ?? null) : null,
    })),
    stores,
    total,
    page: currentPage,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    pageSize,
  };
}
