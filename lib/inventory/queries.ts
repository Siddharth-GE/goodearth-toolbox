import "server-only";

import { requireTool } from "@/lib/auth/access";
import { listPlots } from "@/lib/masters/plots";
import { listProjects } from "@/lib/masters/projects";
import { listStores } from "@/lib/masters/stores";
import { fetchAll } from "@/lib/supabase/fetch-all";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

import { batchLabel, placesOnReceipts, type LineRate } from "./batches";

// POs are read via money-free po_facts/po_line_facts (0022): store-keepers may lack /purchase-orders.
// Stock reads are open to staff, but a batch's rate (0108) is gated; every read still calls the gate.

export const INVENTORY_LIST_LIMIT = 50;

export type Client = SupabaseClient<Database>;

/** Ids per `.in()` filter: each uuid adds 36 characters to the request URL. */
const IDS_PER_REQUEST = 100;

function inGroups<T>(values: T[]): T[][] {
  const groups: T[][] = [];
  for (let at = 0; at < values.length; at += IDS_PER_REQUEST) {
    groups.push(values.slice(at, at + IDS_PER_REQUEST));
  }
  return groups;
}

export type ReceiptLineRate = LineRate & { note: string | null };

/** The rate on each receipt line (0108). A failed read is an error, never "no rates". */
export async function receiptLineRates(
  supabase: Client,
  ids: string[],
): Promise<Map<string, ReceiptLineRate>> {
  const rates = new Map<string, ReceiptLineRate>();
  for (const group of inGroups([...new Set(ids)])) {
    const data = await fetchAll((from, to) =>
      supabase
        .from("goods_receipt_line_rates")
        .select("receipt_line_id, rate, gst_pct, po_rate, po_gst_pct, note")
        .in("receipt_line_id", group)
        .order("receipt_line_id")
        .range(from, to),
    );
    for (const row of data) {
      rates.set(row.receipt_line_id, {
        rate: row.rate,
        gstPct: row.gst_pct,
        poRate: row.po_rate,
        poGstPct: row.po_gst_pct,
        note: row.note,
      });
    }
  }
  return rates;
}

export type BatchFacts = {
  receiptLineId: string;
  receiptId: string;
  label: string;
  receivedAt: string;
  rate: number | null;
};

/** A batch's name, date and rate. The name is derived, so every line of each receipt is read to count places. */
export async function batchFactsById(
  supabase: Client,
  ids: string[],
): Promise<Map<string, BatchFacts>> {
  const unique = [...new Set(ids)];
  const facts = new Map<string, BatchFacts>();
  if (unique.length === 0) return facts;

  const receiptIds = new Set<string>();
  for (const group of inGroups(unique)) {
    const owners = await fetchAll((from, to) =>
      supabase
        .from("goods_receipt_lines")
        .select("id, receipt_id")
        .in("id", group)
        .order("id")
        .range(from, to),
    );
    for (const line of owners) receiptIds.add(line.receipt_id);
  }

  const wanted = new Set(unique);
  const rates = await receiptLineRates(supabase, unique);
  for (const group of inGroups([...receiptIds])) {
    const lines = await fetchAll((from, to) =>
      supabase
        .from("goods_receipt_lines")
        .select("id, receipt_id, goods_receipts(reference, received_at)")
        .in("receipt_id", group)
        .order("receipt_id")
        .order("created_at")
        .order("id")
        .range(from, to),
    );
    const places = placesOnReceipts(
      lines.map((line) => ({ id: line.id, receiptId: line.receipt_id })),
    );
    for (const line of lines) {
      if (!wanted.has(line.id)) continue;
      const receipt = line.goods_receipts as { reference: string; received_at: string } | null;
      facts.set(line.id, {
        receiptLineId: line.id,
        receiptId: line.receipt_id,
        label: batchLabel(receipt?.reference ?? "GRN", places.get(line.id) ?? 0),
        receivedAt: receipt?.received_at ?? "",
        rate: rates.get(line.id)?.rate ?? null,
      });
    }
  }
  return facts;
}

export type ItemFacts = {
  id: string;
  name: string;
  code: string | null;
  thumb_url: string | null;
  brand: string | null;
  default_uom: string;
};

export async function itemsById(supabase: Client, ids: string[]): Promise<Map<string, ItemFacts>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  // Completeness: a missing item would render as a dash on a line being counted.
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

/** Inactive stores are included: old movements still name them. */
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

const ITEM_SEARCH_CAP = 200;

/** Item search to ids, for filtering movements by item_id. `capped` means more matched than
 * carried, so the screen says "narrow the search". */
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
