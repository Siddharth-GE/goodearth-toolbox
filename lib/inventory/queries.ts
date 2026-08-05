import "server-only";

import { fetchAll } from "@/lib/supabase/fetch-all";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Shared lookups for the Inventory read modules — receipts-queries.ts,
 * stock-queries.ts and issues-queries.ts. Everything exported here is
 * for those three files only, not part of any tool-facing surface.
 *
 * Two boundaries shape the whole tool's reads:
 *
 *  1. A store-keeper holds /inventory and usually NOT /purchase-orders,
 *     so purchase orders are read through the money-free po_facts /
 *     po_line_facts views (migration 0022) — never the gated tables.
 *     Item, store, plot and vendor names come from the masters tables,
 *     whose reads are open, read directly under this tool's own grant
 *     (the lib/indents/queries.ts rule) rather than through another
 *     tool's gated queries module.
 *  2. Inventory itself carries no money at all, so its own tables' reads
 *     are open to any signed-in staff member — a site engineer must be
 *     able to see whether their material arrived. The gate in every
 *     exported read is still called: what is open is the row-level
 *     read, not the screen.
 */

export const INVENTORY_LIST_LIMIT = 50;

export type Client = SupabaseClient<Database>;

export type ItemFacts = {
  id: string;
  name: string;
  code: string | null;
  thumb_url: string | null;
  brand: string | null;
  default_uom: string;
};

/** Item display facts for a set of ids, as a lookup map. */
export async function itemsById(supabase: Client, ids: string[]): Promise<Map<string, ItemFacts>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  // Completeness matters — an item missing from this map renders as a
  // dash on a line the store-keeper is about to count.
  const { data, error } = await fetchAll((from, to) =>
    supabase
      .from("items")
      .select("id, name, code, thumb_url, default_uom, brands(name)")
      .in("id", unique)
      .order("id")
      .range(from, to),
  );
  if (error) console.error("itemsById failed:", error);
  return new Map(
    (data ?? []).map((item) => [
      item.id,
      {
        id: item.id,
        name: item.name,
        code: item.code,
        thumb_url: item.thumb_url,
        brand: (item.brands as { name: string } | null)?.name ?? null,
        default_uom: item.default_uom,
      },
    ]),
  );
}

/** Actor names for a set of profile ids — the attribution rule. */
export async function namesById(
  supabase: Client,
  ids: (string | null | undefined)[],
): Promise<(id: string | null | undefined) => string | null> {
  const unique = [...new Set(ids.filter((id): id is string => id != null))];
  const { data } = unique.length
    ? await supabase.from("profiles").select("id, full_name").in("id", unique)
    : { data: [] };
  const names = new Map((data ?? []).map((profile) => [profile.id, profile.full_name]));
  return (id) => (id ? (names.get(id) ?? null) : null);
}

/** name-by-id for any master table with an `id` and a `name`. */
export async function labelsById(
  supabase: Client,
  table: "stores" | "plots" | "units" | "projects" | "vendors",
  ids: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => id != null))];
  if (unique.length === 0) return new Map();
  const { data, error } = await fetchAll((from, to) =>
    supabase.from(table).select("id, name").in("id", unique).order("id").range(from, to),
  );
  if (error) console.error("labelsById failed:", error);
  return new Map((data ?? []).map((row) => [row.id, row.name]));
}

/** The active stores, for destination pickers and filters. */
export async function listActiveStores(supabase: Client): Promise<{ id: string; name: string }[]> {
  const { data, error } = await fetchAll((from, to) =>
    supabase
      .from("stores")
      .select("id, name")
      .eq("is_active", true)
      .order("name")
      .order("id")
      .range(from, to),
  );
  if (error) console.error("listActiveStores failed:", error);
  return (data ?? []).map(({ id, name }) => ({ id, name }));
}

/** PO references for a set of po ids, via the money-free po_facts view. */
export async function poReferencesById(
  supabase: Client,
  ids: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const { data, error } = await fetchAll((from, to) =>
    supabase.from("po_facts").select("id, reference").in("id", unique).order("id").range(from, to),
  );
  if (error) console.error("poReferencesById failed:", error);
  return new Map((data ?? []).map((row) => [row.id ?? "", row.reference ?? "—"]));
}
