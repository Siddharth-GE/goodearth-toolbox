import "server-only";

import { requireTool } from "@/lib/auth/access";
import { listPlots } from "@/lib/masters/plots";
import { listProjects } from "@/lib/masters/projects";
import { listStores } from "@/lib/masters/stores";
import { fetchAll } from "@/lib/supabase/fetch-all";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Shared lookups for the Inventory read modules — receipts-queries.ts,
 * stock-queries.ts, issues-queries.ts and requests-queries.ts. Everything
 * exported here is for those files and the Inventory list pages' filter
 * bars, not part of any other tool's surface.
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
  const data = await fetchAll((from, to) =>
    supabase
      .from("items")
      .select("id, name, code, thumb_url, default_uom, brands(name)")
      .in("id", unique)
      .order("id")
      .range(from, to),
  );
  return new Map(
    data.map((item) => [
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

/** The active stores, for destination pickers and filters. */
export async function listActiveStores(supabase: Client): Promise<{ id: string; name: string }[]> {
  const data = await fetchAll((from, to) =>
    supabase
      .from("stores")
      .select("id, name")
      .eq("is_active", true)
      .order("name")
      .order("id")
      .range(from, to),
  );
  return data.map(({ id, name }) => ({ id, name }));
}

/** PO references for a set of po ids, via the money-free po_facts view. */
export async function poReferencesById(
  supabase: Client,
  ids: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const data = await fetchAll((from, to) =>
    supabase.from("po_facts").select("id, reference").in("id", unique).order("id").range(from, to),
  );
  return new Map(data.map((row) => [row.id ?? "", row.reference ?? "—"]));
}

/* ------------------------------------------------------------------ *
 * The list screens' search and filter bar (plan.md, A4)
 * ------------------------------------------------------------------ */

/** The filter dropdowns every Inventory list shares — projects, stores
 * (inactive ones too: old movements still name them) and plots. The
 * Masters reads are open; this wrapper is the gate. */
export async function getInventoryFilterOptions(): Promise<{
  projects: { id: string; name: string }[];
  stores: { id: string; name: string }[];
  plots: { id: string; name: string }[];
}> {
  await requireTool("/inventory");
  const [projects, stores, plots] = await Promise.all([listProjects(), listStores(), listPlots()]);
  const projectNames = new Map(projects.map((project) => [project.id, project.name]));
  return {
    projects: projects.map(({ id, name }) => ({ id, name })),
    stores: stores.map(({ id, name }) => ({ id, name })),
    plots: plots.map((plot) => ({
      id: plot.id,
      name: `${plot.name} · ${projectNames.get(plot.project_id) ?? "—"}`,
    })),
  };
}

/** How many matching item ids one search carries into a `.in()` filter —
 * each is a 36-character uuid in the request URL. */
const ITEM_SEARCH_CAP = 200;

/**
 * A search over item names (and codes) becomes a list of item ids — items
 * is an open Masters read — so a movement list can filter its rows by
 * `item_id`. `capped` is true when more items matched than the list
 * carries, so the screen can say "narrow the search" instead of quietly
 * showing part of the answer. `q` is already made safe by searchParam.
 */
export async function matchingItemIds(
  supabase: Client,
  q: string,
  fields: ("name" | "code")[],
): Promise<{ ids: string[]; capped: boolean }> {
  const { data, error } = await supabase
    .from("items")
    .select("id")
    .or(fields.map((field) => `${field}.ilike.*${q}*`).join(","))
    .order("name")
    .order("id")
    .limit(ITEM_SEARCH_CAP + 1);
  if (error) {
    console.error("inventory item search failed:", error);
    throw new Error("Could not search the items.", { cause: error });
  }
  const ids = (data ?? []).map((row) => row.id);
  return { ids: ids.slice(0, ITEM_SEARCH_CAP), capped: ids.length > ITEM_SEARCH_CAP };
}
