import "server-only";

import { cache } from "react";

import { requireTool } from "@/lib/auth/access";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

import { remainingToReceive } from "./stock";

/**
 * Reads for Inventory.
 *
 * Two boundaries shape almost everything here:
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
 *     able to see whether their material arrived. The gate below is
 *     still called on every function: what is open is the row-level
 *     read, not the screen.
 */

export const INVENTORY_LIST_LIMIT = 50;

type Client = SupabaseClient<Database>;

/* ------------------------------------------------------------------ *
 * Shared helpers — names for ids, since the fact views carry none
 * ------------------------------------------------------------------ */

export type ItemFacts = {
  id: string;
  name: string;
  code: string | null;
  thumb_url: string | null;
  brand: string | null;
  default_uom: string;
};

/** Item display facts for a set of ids, as a lookup map. */
async function itemsById(supabase: Client, ids: string[]): Promise<Map<string, ItemFacts>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  // Completeness matters — an item missing from this map renders as a
  // dash on a line the store-keeper is about to count.
  const { data } = await fetchAll((from, to) =>
    supabase
      .from("items")
      .select("id, name, code, thumb_url, default_uom, brands(name)")
      .in("id", unique)
      .order("id")
      .range(from, to),
  );
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
async function namesById(
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
async function labelsById(
  supabase: Client,
  table: "stores" | "plots" | "units" | "projects" | "vendors",
  ids: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => id != null))];
  if (unique.length === 0) return new Map();
  const { data } = await fetchAll((from, to) =>
    supabase.from(table).select("id, name").in("id", unique).order("id").range(from, to),
  );
  return new Map((data ?? []).map((row) => [row.id, row.name]));
}

/* ------------------------------------------------------------------ *
 * Receive — the purchase orders with goods still to come
 * ------------------------------------------------------------------ */

export type ReceivablePoRow = {
  id: string;
  reference: string;
  project_name: string;
  vendor_name: string;
  scope_label: string;
  expected_by: string | null;
  issued_at: string | null;
  line_count: number;
  /** Lines with nothing left to come, of line_count. */
  lines_complete: number;
};

export type ReceivablePoPage = {
  orders: ReceivablePoRow[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
};

/**
 * Issued purchase orders — the ones goods can still arrive against. A
 * PO leaves this list by completing itself (every line fully received,
 * migration 0023 §9), so an empty list genuinely means nothing is
 * outstanding.
 */
export async function listReceivablePos({
  page = 1,
}: { page?: number } = {}): Promise<ReceivablePoPage> {
  await requireTool("/inventory");
  const supabase = await createClient();

  const pageSize = INVENTORY_LIST_LIMIT;
  const currentPage = Math.max(1, page);

  const { data, count, error } = await supabase
    .from("po_facts")
    .select("id, project_id, plot_id, unit_id, vendor_id, reference, expected_by, issued_at", {
      count: "exact",
    })
    .eq("status", "issued")
    .order("issued_at", { ascending: false })
    .order("id")
    .range((currentPage - 1) * pageSize, currentPage * pageSize - 1);

  if (error) {
    console.error("listReceivablePos failed:", error);
    return { orders: [], total: 0, page: currentPage, pageCount: 1, pageSize };
  }

  // Every column of a view is typed nullable by the generator (a view
  // carries no NOT NULL metadata), so the row shape is normalised once
  // here rather than defended against at every use below.
  const rows = (data ?? []).map((row) => ({
    id: row.id ?? "",
    project_id: row.project_id ?? "",
    vendor_id: row.vendor_id ?? "",
    plot_id: row.plot_id,
    unit_id: row.unit_id,
    reference: row.reference ?? "—",
    expected_by: row.expected_by,
    issued_at: row.issued_at,
  }));
  const poIds = rows.map((row) => row.id);

  const [projects, vendors, plots, units, progress] = await Promise.all([
    labelsById(
      supabase,
      "projects",
      rows.map((r) => r.project_id),
    ),
    labelsById(
      supabase,
      "vendors",
      rows.map((r) => r.vendor_id),
    ),
    labelsById(
      supabase,
      "plots",
      rows.map((r) => r.plot_id),
    ),
    labelsById(
      supabase,
      "units",
      rows.map((r) => r.unit_id),
    ),
    receivedProgressForPos(supabase, poIds),
  ]);

  const total = count ?? 0;
  return {
    orders: rows.map((row) => {
      const lines = progress.get(row.id) ?? [];
      return {
        id: row.id,
        reference: row.reference,
        project_name: projects.get(row.project_id) ?? "—",
        vendor_name: vendors.get(row.vendor_id) ?? "—",
        scope_label:
          (row.unit_id ? units.get(row.unit_id) : null) ??
          (row.plot_id ? plots.get(row.plot_id) : null) ??
          "General",
        expected_by: row.expected_by,
        issued_at: row.issued_at,
        line_count: lines.length,
        lines_complete: lines.filter((l) => l.received >= l.ordered).length,
      };
    }),
    total,
    page: currentPage,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    pageSize,
  };
}

/** ordered/received per line, for a set of POs — the list's progress column. */
async function receivedProgressForPos(
  supabase: Client,
  poIds: string[],
): Promise<Map<string, { ordered: number; received: number }[]>> {
  const byPo = new Map<string, { ordered: number; received: number }[]>();
  if (poIds.length === 0) return byPo;

  // Completeness-critical: a missing line reads as "fully received".
  const { data } = await fetchAll((from, to) =>
    supabase
      .from("po_line_facts")
      .select("id, po_id, quantity")
      .in("po_id", poIds)
      .order("id")
      .range(from, to),
  );
  // View columns are all typed nullable — normalise once (see above).
  const lines = (data ?? []).map((line) => ({
    id: line.id ?? "",
    po_id: line.po_id ?? "",
    quantity: line.quantity ?? 0,
  }));

  const received = await receivedByPoLine(
    supabase,
    lines.map((line) => line.id),
  );

  for (const line of lines) {
    const group = byPo.get(line.po_id) ?? [];
    group.push({ ordered: line.quantity, received: received.get(line.id) ?? 0 });
    byPo.set(line.po_id, group);
  }
  return byPo;
}

/** How much has been received against each of these PO lines, ever. */
async function receivedByPoLine(
  supabase: Client,
  poLineIds: string[],
): Promise<Map<string, number>> {
  const totals = new Map<string, number>();
  if (poLineIds.length === 0) return totals;

  const { data } = await fetchAll((from, to) =>
    supabase
      .from("goods_receipt_lines")
      .select("po_line_id, quantity")
      .in("po_line_id", poLineIds)
      .order("id")
      .range(from, to),
  );
  for (const line of data ?? []) {
    totals.set(line.po_line_id, (totals.get(line.po_line_id) ?? 0) + line.quantity);
  }
  return totals;
}

export type ReceiveLine = {
  /** purchase_order_lines.id — the anchor a receipt line carries. */
  po_line_id: string;
  item_id: string;
  item_name: string;
  item_code: string | null;
  item_brand: string | null;
  item_thumb_url: string | null;
  uom: string;
  ordered: number;
  received: number;
  remaining: number;
};

export type ReceivePool = {
  po_id: string;
  reference: string;
  status: string;
  project_name: string;
  vendor_name: string;
  /** Where the PO says the goods should go, if a store was named. */
  deliver_store_name: string | null;
  /** The plot/unit the PO is scoped to — the "directly at site" option. */
  site_label: string | null;
  lines: ReceiveLine[];
  stores: { id: string; name: string }[];
};

/**
 * Everything the receive screen needs for one PO: what was ordered,
 * what has already arrived, what is still to come, and where it can
 * be put. The pool-screen pattern from the PO tool's pull screen —
 * fully-received lines stay visible, disabled and labelled.
 */
export async function getReceivePool(poId: string): Promise<ReceivePool | null> {
  await requireTool("/inventory");
  const supabase = await createClient();

  const { data: po } = await supabase
    .from("po_facts")
    .select("id, project_id, plot_id, unit_id, vendor_id, reference, status")
    .eq("id", poId)
    .maybeSingle();
  if (!po) return null;

  // Completeness-critical: a truncated line list would read as a
  // shorter order and let the rest of the delivery go unrecorded.
  const { data } = await fetchAll((from, to) =>
    supabase
      .from("po_line_facts")
      .select("id, item_id, quantity, uom")
      .eq("po_id", poId)
      .order("id")
      .range(from, to),
  );
  // View columns are all typed nullable — normalise once (see above).
  const lines = (data ?? []).map((line) => ({
    id: line.id ?? "",
    item_id: line.item_id ?? "",
    quantity: line.quantity ?? 0,
    uom: line.uom ?? "each",
  }));

  const [items, received, projects, vendors, plots, units, storeRows] = await Promise.all([
    itemsById(
      supabase,
      lines.map((line) => line.item_id),
    ),
    receivedByPoLine(
      supabase,
      lines.map((line) => line.id),
    ),
    labelsById(supabase, "projects", [po.project_id]),
    labelsById(supabase, "vendors", [po.vendor_id]),
    labelsById(supabase, "plots", [po.plot_id]),
    labelsById(supabase, "units", [po.unit_id]),
    listActiveStores(supabase),
  ]);

  return {
    po_id: po.id ?? poId,
    reference: po.reference ?? "—",
    status: po.status ?? "",
    project_name: projects.get(po.project_id ?? "") ?? "—",
    vendor_name: vendors.get(po.vendor_id ?? "") ?? "—",
    // po_facts carries no deliver_store_id (it is not a fact the site
    // needs and the view's column list is the boundary) — the PO's
    // delivery instruction stays on the PO screen.
    deliver_store_name: null,
    site_label:
      (po.unit_id ? (units.get(po.unit_id) ?? null) : null) ??
      (po.plot_id ? (plots.get(po.plot_id) ?? null) : null),
    lines: lines.map((line) => {
      const item = items.get(line.item_id);
      const alreadyReceived = received.get(line.id) ?? 0;
      return {
        po_line_id: line.id,
        item_id: line.item_id,
        item_name: item?.name ?? "—",
        item_code: item?.code ?? null,
        item_brand: item?.brand ?? null,
        item_thumb_url: item?.thumb_url ?? null,
        uom: line.uom,
        ordered: line.quantity,
        received: alreadyReceived,
        remaining: remainingToReceive(line.quantity, alreadyReceived),
      };
    }),
    stores: storeRows,
  };
}

async function listActiveStores(supabase: Client): Promise<{ id: string; name: string }[]> {
  const { data } = await fetchAll((from, to) =>
    supabase
      .from("stores")
      .select("id, name")
      .eq("is_active", true)
      .order("name")
      .order("id")
      .range(from, to),
  );
  return (data ?? []).map(({ id, name }) => ({ id, name }));
}

/* ------------------------------------------------------------------ *
 * Goods receipts — the record of what arrived
 * ------------------------------------------------------------------ */

export type ReceiptSummary = {
  id: string;
  reference: string;
  po_reference: string;
  destination: string;
  challan_no: string | null;
  received_at: string;
  line_count: number;
  received_by_name: string | null;
};

export type ReceiptPage = {
  receipts: ReceiptSummary[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
};

export async function listGoodsReceipts({
  page = 1,
}: { page?: number } = {}): Promise<ReceiptPage> {
  await requireTool("/inventory");
  const supabase = await createClient();

  const pageSize = INVENTORY_LIST_LIMIT;
  const currentPage = Math.max(1, page);

  const { data, count, error } = await supabase
    .from("goods_receipts")
    .select(
      "id, reference, po_id, store_id, to_site, plot_id, unit_id, challan_no, received_at, created_by, goods_receipt_lines(count)",
      { count: "exact" },
    )
    .order("received_at", { ascending: false })
    .order("id")
    .range((currentPage - 1) * pageSize, currentPage * pageSize - 1);

  if (error) {
    console.error("listGoodsReceipts failed:", error);
    return { receipts: [], total: 0, page: currentPage, pageCount: 1, pageSize };
  }

  const rows = data ?? [];
  const [poRefs, stores, plots, units, nameOf] = await Promise.all([
    poReferencesById(
      supabase,
      rows.map((r) => r.po_id),
    ),
    labelsById(
      supabase,
      "stores",
      rows.map((r) => r.store_id),
    ),
    labelsById(
      supabase,
      "plots",
      rows.map((r) => r.plot_id),
    ),
    labelsById(
      supabase,
      "units",
      rows.map((r) => r.unit_id),
    ),
    namesById(
      supabase,
      rows.map((r) => r.created_by),
    ),
  ]);

  const total = count ?? 0;
  return {
    receipts: rows.map((row) => ({
      id: row.id,
      reference: row.reference ?? "—",
      po_reference: poRefs.get(row.po_id) ?? "—",
      destination: describeDestination(row, stores, plots, units),
      challan_no: row.challan_no,
      received_at: row.received_at,
      line_count: (row.goods_receipt_lines as { count: number }[] | null)?.[0]?.count ?? 0,
      received_by_name: nameOf(row.created_by),
    })),
    total,
    page: currentPage,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    pageSize,
  };
}

function describeDestination(
  row: {
    store_id: string | null;
    to_site: boolean;
    plot_id: string | null;
    unit_id: string | null;
  },
  stores: Map<string, string>,
  plots: Map<string, string>,
  units: Map<string, string>,
): string {
  if (row.store_id) return stores.get(row.store_id) ?? "A store";
  const site =
    (row.unit_id ? units.get(row.unit_id) : null) ?? (row.plot_id ? plots.get(row.plot_id) : null);
  return site ? `Site — ${site}` : "Site";
}

async function poReferencesById(supabase: Client, ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const { data } = await fetchAll((from, to) =>
    supabase.from("po_facts").select("id, reference").in("id", unique).order("id").range(from, to),
  );
  return new Map((data ?? []).map((row) => [row.id ?? "", row.reference ?? "—"]));
}

export type ReceiptLineRow = {
  id: string;
  item_name: string;
  item_code: string | null;
  item_brand: string | null;
  item_thumb_url: string | null;
  quantity: number;
  uom: string;
  note: string | null;
  recorded_by_name: string | null;
};

export type ReceiptDetail = {
  id: string;
  reference: string;
  po_id: string;
  po_reference: string;
  project_name: string;
  destination: string;
  to_site: boolean;
  challan_no: string | null;
  received_at: string;
  note: string | null;
  created_at: string;
  received_by_name: string | null;
  lines: ReceiptLineRow[];
};

export const getGoodsReceipt = cache(async (receiptId: string): Promise<ReceiptDetail | null> => {
  await requireTool("/inventory");
  const supabase = await createClient();

  const { data: receipt } = await supabase
    .from("goods_receipts")
    .select(
      "id, reference, po_id, project_id, store_id, to_site, plot_id, unit_id, challan_no, received_at, note, created_at, created_by",
    )
    .eq("id", receiptId)
    .maybeSingle();
  if (!receipt) return null;

  const { data: lines } = await fetchAll((from, to) =>
    supabase
      .from("goods_receipt_lines")
      .select("id, item_id, quantity, uom, note, created_by, updated_by")
      .eq("receipt_id", receiptId)
      .order("created_at")
      .order("id")
      .range(from, to),
  );

  const [items, poRefs, projects, stores, plots, units, nameOf] = await Promise.all([
    itemsById(
      supabase,
      (lines ?? []).map((line) => line.item_id),
    ),
    poReferencesById(supabase, [receipt.po_id]),
    labelsById(supabase, "projects", [receipt.project_id]),
    labelsById(supabase, "stores", [receipt.store_id]),
    labelsById(supabase, "plots", [receipt.plot_id]),
    labelsById(supabase, "units", [receipt.unit_id]),
    namesById(supabase, [
      receipt.created_by,
      ...(lines ?? []).map((line) => line.updated_by ?? line.created_by),
    ]),
  ]);

  return {
    id: receipt.id,
    reference: receipt.reference ?? "—",
    po_id: receipt.po_id,
    po_reference: poRefs.get(receipt.po_id) ?? "—",
    project_name: projects.get(receipt.project_id) ?? "—",
    destination: describeDestination(receipt, stores, plots, units),
    to_site: receipt.to_site,
    challan_no: receipt.challan_no,
    received_at: receipt.received_at,
    note: receipt.note,
    created_at: receipt.created_at,
    received_by_name: nameOf(receipt.created_by),
    lines: (lines ?? []).map((line) => {
      const item = items.get(line.item_id);
      return {
        id: line.id,
        item_name: item?.name ?? "—",
        item_code: item?.code ?? null,
        item_brand: item?.brand ?? null,
        item_thumb_url: item?.thumb_url ?? null,
        quantity: line.quantity,
        uom: line.uom,
        note: line.note,
        recorded_by_name: nameOf(line.updated_by ?? line.created_by),
      };
    }),
  };
});

export type PoReceiptRow = {
  id: string;
  reference: string;
  destination: string;
  challan_no: string | null;
  received_at: string;
  received_by_name: string | null;
  lines: { item_name: string; quantity: number; uom: string }[];
};

/**
 * The receipts against one PO, for the purchase-order detail page —
 * which is why this one is gated on /purchase-orders rather than
 * /inventory. Nothing here is money; it is the PO holder's own screen
 * asking "did it arrive?".
 */
export async function getPoReceipts(poId: string): Promise<PoReceiptRow[]> {
  await requireTool("/purchase-orders");
  const supabase = await createClient();
  return receiptsForPo(supabase, poId);
}

async function receiptsForPo(supabase: Client, poId: string): Promise<PoReceiptRow[]> {
  const { data: receipts } = await fetchAll((from, to) =>
    supabase
      .from("goods_receipts")
      .select(
        "id, reference, store_id, to_site, plot_id, unit_id, challan_no, received_at, created_by",
      )
      .eq("po_id", poId)
      .order("received_at")
      .order("id")
      .range(from, to),
  );
  if ((receipts ?? []).length === 0) return [];

  const receiptIds = (receipts ?? []).map((receipt) => receipt.id);
  const { data: lines } = await fetchAll((from, to) =>
    supabase
      .from("goods_receipt_lines")
      .select("receipt_id, item_id, quantity, uom")
      .in("receipt_id", receiptIds)
      .order("id")
      .range(from, to),
  );

  const [items, stores, plots, units, nameOf] = await Promise.all([
    itemsById(
      supabase,
      (lines ?? []).map((line) => line.item_id),
    ),
    labelsById(
      supabase,
      "stores",
      (receipts ?? []).map((r) => r.store_id),
    ),
    labelsById(
      supabase,
      "plots",
      (receipts ?? []).map((r) => r.plot_id),
    ),
    labelsById(
      supabase,
      "units",
      (receipts ?? []).map((r) => r.unit_id),
    ),
    namesById(
      supabase,
      (receipts ?? []).map((r) => r.created_by),
    ),
  ]);

  const linesByReceipt = new Map<string, { item_name: string; quantity: number; uom: string }[]>();
  for (const line of lines ?? []) {
    const group = linesByReceipt.get(line.receipt_id) ?? [];
    group.push({
      item_name: items.get(line.item_id)?.name ?? "—",
      quantity: line.quantity,
      uom: line.uom,
    });
    linesByReceipt.set(line.receipt_id, group);
  }

  return (receipts ?? []).map((receipt) => ({
    id: receipt.id,
    reference: receipt.reference ?? "—",
    destination: describeDestination(receipt, stores, plots, units),
    challan_no: receipt.challan_no,
    received_at: receipt.received_at,
    received_by_name: nameOf(receipt.created_by),
    lines: linesByReceipt.get(receipt.id) ?? [],
  }));
}

/* ------------------------------------------------------------------ *
 * Stock — the balance, and how it got there
 * ------------------------------------------------------------------ */

export type StockRow = {
  store_id: string;
  store_name: string;
  item_id: string;
  item_name: string;
  item_code: string | null;
  item_brand: string | null;
  item_thumb_url: string | null;
  uom: string;
  quantity: number;
};

export type StockPage = {
  rows: StockRow[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  stores: { id: string; name: string }[];
};

/**
 * Stock on hand, optionally for one store. Zero-quantity rows are kept
 * — "this store had some and has none left" is a different answer from
 * "this store never held it", and the movement history behind it is
 * still worth reaching.
 */
export async function listStockOnHand({
  page = 1,
  storeId,
}: { page?: number; storeId?: string } = {}): Promise<StockPage> {
  await requireTool("/inventory");
  const supabase = await createClient();

  const pageSize = INVENTORY_LIST_LIMIT;
  const currentPage = Math.max(1, page);

  let query = supabase
    .from("stock_on_hand")
    .select("store_id, item_id, quantity", { count: "exact" })
    .order("store_id")
    .order("item_id")
    .range((currentPage - 1) * pageSize, currentPage * pageSize - 1);
  if (storeId) query = query.eq("store_id", storeId);

  const [{ data, count, error }, stores] = await Promise.all([query, listActiveStores(supabase)]);

  if (error) {
    console.error("listStockOnHand failed:", error);
    return { rows: [], total: 0, page: currentPage, pageCount: 1, pageSize, stores };
  }

  const rows = data ?? [];
  const [items, storeNames] = await Promise.all([
    itemsById(
      supabase,
      rows.map((row) => row.item_id ?? ""),
    ),
    labelsById(
      supabase,
      "stores",
      rows.map((row) => row.store_id),
    ),
  ]);

  const total = count ?? 0;
  return {
    rows: rows.map((row) => {
      const item = items.get(row.item_id ?? "");
      return {
        store_id: row.store_id ?? "",
        store_name: storeNames.get(row.store_id ?? "") ?? "—",
        item_id: row.item_id ?? "",
        item_name: item?.name ?? "—",
        item_code: item?.code ?? null,
        item_brand: item?.brand ?? null,
        item_thumb_url: item?.thumb_url ?? null,
        uom: item?.default_uom ?? "each",
        quantity: row.quantity ?? 0,
      };
    }),
    total,
    page: currentPage,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    pageSize,
    stores,
  };
}

export type MovementRow = {
  id: string;
  kind: "receipt" | "issue" | "transfer_in" | "adjustment";
  /** What it did to this store's holding: signed. */
  quantity: number;
  uom: string;
  at: string;
  reference: string;
  /** Where it came from or went, in words. */
  counterparty: string;
  note: string | null;
  actor_name: string | null;
  /** Where the row lives, for the "open it" link. */
  href: string | null;
};

export type ItemMovements = {
  store_id: string;
  store_name: string;
  item_id: string;
  item_name: string;
  item_code: string | null;
  item_thumb_url: string | null;
  balance: number;
  movements: MovementRow[];
};

/**
 * Every movement of one item in one store, newest first — the answer
 * to "why does it say 40?". The four sources are read separately and
 * merged here rather than in SQL, because each carries a different
 * counterparty (a PO, a destination, a reason).
 */
export async function getItemMovements(
  storeId: string,
  itemId: string,
): Promise<ItemMovements | null> {
  await requireTool("/inventory");
  const supabase = await createClient();

  const [storeNames, items] = await Promise.all([
    labelsById(supabase, "stores", [storeId]),
    itemsById(supabase, [itemId]),
  ]);
  if (!storeNames.get(storeId)) return null;
  const item = items.get(itemId);

  // Each source read to completion — a movement list that silently
  // stops short would not add up to the balance shown above it.
  const [{ data: receiptLines }, { data: issueLines }, { data: adjustments }] = await Promise.all([
    fetchAll((from, to) =>
      supabase
        .from("goods_receipt_lines")
        .select(
          "id, quantity, uom, note, created_at, created_by, receipt_id, goods_receipts(id, reference, store_id, received_at, po_id)",
        )
        .eq("item_id", itemId)
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("stock_issue_lines")
        .select(
          "id, quantity, uom, note, created_at, created_by, issue_id, stock_issues(id, reference, store_id, to_store_id, plot_id, issued_at)",
        )
        .eq("item_id", itemId)
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("stock_adjustments")
        .select("id, quantity, uom, reason, adjusted_at, created_at, created_by")
        .eq("item_id", itemId)
        .eq("store_id", storeId)
        .order("id")
        .range(from, to),
    ),
  ]);

  type ReceiptParent = {
    id: string;
    reference: string;
    store_id: string | null;
    received_at: string;
    po_id: string;
  };
  type IssueParent = {
    id: string;
    reference: string;
    store_id: string;
    to_store_id: string | null;
    plot_id: string | null;
    issued_at: string;
  };

  const receipts = (receiptLines ?? []).filter(
    (line) => (line.goods_receipts as ReceiptParent | null)?.store_id === storeId,
  );
  const issuesOut = (issueLines ?? []).filter(
    (line) => (line.stock_issues as IssueParent | null)?.store_id === storeId,
  );
  const transfersIn = (issueLines ?? []).filter(
    (line) => (line.stock_issues as IssueParent | null)?.to_store_id === storeId,
  );

  const [poRefs, otherStores, plots, nameOf] = await Promise.all([
    poReferencesById(
      supabase,
      receipts.map((line) => (line.goods_receipts as ReceiptParent).po_id),
    ),
    labelsById(supabase, "stores", [
      ...issuesOut.map((line) => (line.stock_issues as IssueParent).to_store_id),
      ...transfersIn.map((line) => (line.stock_issues as IssueParent).store_id),
    ]),
    labelsById(supabase, "plots", [
      ...issuesOut.map((line) => (line.stock_issues as IssueParent).plot_id),
    ]),
    namesById(supabase, [
      ...receipts.map((l) => l.created_by),
      ...issuesOut.map((l) => l.created_by),
      ...transfersIn.map((l) => l.created_by),
      ...(adjustments ?? []).map((a) => a.created_by),
    ]),
  ]);

  const movements: MovementRow[] = [
    ...receipts.map((line): MovementRow => {
      const parent = line.goods_receipts as ReceiptParent;
      return {
        id: line.id,
        kind: "receipt",
        quantity: line.quantity,
        uom: line.uom,
        at: parent.received_at,
        reference: parent.reference,
        counterparty: poRefs.get(parent.po_id) ?? "a purchase order",
        note: line.note,
        actor_name: nameOf(line.created_by),
        href: `/inventory/receipts/${parent.id}`,
      };
    }),
    ...issuesOut.map((line): MovementRow => {
      const parent = line.stock_issues as IssueParent;
      return {
        id: line.id,
        kind: "issue",
        quantity: -line.quantity,
        uom: line.uom,
        at: parent.issued_at,
        reference: parent.reference,
        counterparty: parent.to_store_id
          ? `${otherStores.get(parent.to_store_id) ?? "another store"} (transfer)`
          : (plots.get(parent.plot_id ?? "") ?? "site"),
        note: line.note,
        actor_name: nameOf(line.created_by),
        href: `/inventory/issues/${parent.id}`,
      };
    }),
    ...transfersIn.map((line): MovementRow => {
      const parent = line.stock_issues as IssueParent;
      return {
        id: line.id,
        kind: "transfer_in",
        quantity: line.quantity,
        uom: line.uom,
        at: parent.issued_at,
        reference: parent.reference,
        counterparty: `${otherStores.get(parent.store_id) ?? "another store"} (transfer)`,
        note: line.note,
        actor_name: nameOf(line.created_by),
        href: `/inventory/issues/${parent.id}`,
      };
    }),
    ...(adjustments ?? []).map((row): MovementRow => {
      return {
        id: row.id,
        kind: "adjustment",
        quantity: row.quantity,
        uom: row.uom,
        at: row.adjusted_at,
        reference: "Adjustment",
        counterparty: row.reason,
        note: null,
        actor_name: nameOf(row.created_by),
        href: null,
      };
    }),
  ].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

  return {
    store_id: storeId,
    store_name: storeNames.get(storeId) ?? "—",
    item_id: itemId,
    item_name: item?.name ?? "—",
    item_code: item?.code ?? null,
    item_thumb_url: item?.thumb_url ?? null,
    balance: movements.reduce((total, movement) => total + movement.quantity, 0),
    movements,
  };
}

/** On-hand for one (store, item) — what the issue form checks against
 * before the database does. */
export async function getStockQty(storeId: string, itemId: string): Promise<number> {
  await requireTool("/inventory");
  const supabase = await createClient();
  const { data } = await supabase
    .from("stock_on_hand")
    .select("quantity")
    .eq("store_id", storeId)
    .eq("item_id", itemId)
    .maybeSingle();
  return data?.quantity ?? 0;
}

/** Every item a store currently holds, for the issue form's picker. */
export async function listStoreHoldings(storeId: string): Promise<StockRow[]> {
  await requireTool("/inventory");
  const supabase = await createClient();

  // Completeness-critical: an item missing here cannot be issued.
  const { data } = await fetchAll((from, to) =>
    supabase
      .from("stock_on_hand")
      .select("store_id, item_id, quantity")
      .eq("store_id", storeId)
      .order("item_id")
      .range(from, to),
  );

  const rows = (data ?? []).filter((row) => (row.quantity ?? 0) > 0);
  const [items, storeNames] = await Promise.all([
    itemsById(
      supabase,
      rows.map((row) => row.item_id ?? ""),
    ),
    labelsById(supabase, "stores", [storeId]),
  ]);

  return rows
    .map((row) => {
      const item = items.get(row.item_id ?? "");
      return {
        store_id: storeId,
        store_name: storeNames.get(storeId) ?? "—",
        item_id: row.item_id ?? "",
        item_name: item?.name ?? "—",
        item_code: item?.code ?? null,
        item_brand: item?.brand ?? null,
        item_thumb_url: item?.thumb_url ?? null,
        uom: item?.default_uom ?? "each",
        quantity: row.quantity ?? 0,
      };
    })
    .sort((a, b) => a.item_name.localeCompare(b.item_name));
}

/* ------------------------------------------------------------------ *
 * Issues and adjustments
 * ------------------------------------------------------------------ */

export type IssueSummary = {
  id: string;
  reference: string;
  store_name: string;
  destination: string;
  issued_at: string;
  line_count: number;
  issued_by_name: string | null;
};

export type IssuePage = {
  issues: IssueSummary[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
};

export async function listStockIssues({ page = 1 }: { page?: number } = {}): Promise<IssuePage> {
  await requireTool("/inventory");
  const supabase = await createClient();

  const pageSize = INVENTORY_LIST_LIMIT;
  const currentPage = Math.max(1, page);

  const { data, count, error } = await supabase
    .from("stock_issues")
    .select(
      "id, reference, store_id, to_store_id, plot_id, issued_at, created_by, stock_issue_lines(count)",
      { count: "exact" },
    )
    .order("issued_at", { ascending: false })
    .order("id")
    .range((currentPage - 1) * pageSize, currentPage * pageSize - 1);

  if (error) {
    console.error("listStockIssues failed:", error);
    return { issues: [], total: 0, page: currentPage, pageCount: 1, pageSize };
  }

  const rows = data ?? [];
  const [stores, plots, nameOf] = await Promise.all([
    labelsById(supabase, "stores", [
      ...rows.map((r) => r.store_id),
      ...rows.map((r) => r.to_store_id),
    ]),
    labelsById(
      supabase,
      "plots",
      rows.map((r) => r.plot_id),
    ),
    namesById(
      supabase,
      rows.map((r) => r.created_by),
    ),
  ]);

  const total = count ?? 0;
  return {
    issues: rows.map((row) => ({
      id: row.id,
      reference: row.reference ?? "—",
      store_name: stores.get(row.store_id) ?? "—",
      destination: row.to_store_id
        ? `${stores.get(row.to_store_id) ?? "another store"} (transfer)`
        : (plots.get(row.plot_id ?? "") ?? "—"),
      issued_at: row.issued_at,
      line_count: (row.stock_issue_lines as { count: number }[] | null)?.[0]?.count ?? 0,
      issued_by_name: nameOf(row.created_by),
    })),
    total,
    page: currentPage,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    pageSize,
  };
}

export type IssueDetail = {
  id: string;
  reference: string;
  store_name: string;
  destination: string;
  is_transfer: boolean;
  issued_at: string;
  note: string | null;
  issued_by_name: string | null;
  lines: {
    id: string;
    item_name: string;
    item_code: string | null;
    item_brand: string | null;
    item_thumb_url: string | null;
    quantity: number;
    uom: string;
    note: string | null;
    recorded_by_name: string | null;
  }[];
};

export const getStockIssue = cache(async (issueId: string): Promise<IssueDetail | null> => {
  await requireTool("/inventory");
  const supabase = await createClient();

  const { data: issue } = await supabase
    .from("stock_issues")
    .select("id, reference, store_id, to_store_id, plot_id, issued_at, note, created_by")
    .eq("id", issueId)
    .maybeSingle();
  if (!issue) return null;

  const { data: lines } = await fetchAll((from, to) =>
    supabase
      .from("stock_issue_lines")
      .select("id, item_id, quantity, uom, note, created_by, updated_by")
      .eq("issue_id", issueId)
      .order("created_at")
      .order("id")
      .range(from, to),
  );

  const [items, stores, plots, nameOf] = await Promise.all([
    itemsById(
      supabase,
      (lines ?? []).map((line) => line.item_id),
    ),
    labelsById(supabase, "stores", [issue.store_id, issue.to_store_id]),
    labelsById(supabase, "plots", [issue.plot_id]),
    namesById(supabase, [
      issue.created_by,
      ...(lines ?? []).map((line) => line.updated_by ?? line.created_by),
    ]),
  ]);

  return {
    id: issue.id,
    reference: issue.reference ?? "—",
    store_name: stores.get(issue.store_id) ?? "—",
    destination: issue.to_store_id
      ? (stores.get(issue.to_store_id) ?? "another store")
      : (plots.get(issue.plot_id ?? "") ?? "—"),
    is_transfer: issue.to_store_id != null,
    issued_at: issue.issued_at,
    note: issue.note,
    issued_by_name: nameOf(issue.created_by),
    lines: (lines ?? []).map((line) => {
      const item = items.get(line.item_id);
      return {
        id: line.id,
        item_name: item?.name ?? "—",
        item_code: item?.code ?? null,
        item_brand: item?.brand ?? null,
        item_thumb_url: item?.thumb_url ?? null,
        quantity: line.quantity,
        uom: line.uom,
        note: line.note,
        recorded_by_name: nameOf(line.updated_by ?? line.created_by),
      };
    }),
  };
});

export type IssueFormOptions = {
  stores: { id: string; name: string; project_id: string | null }[];
  plots: { id: string; name: string; project_name: string }[];
  projects: { id: string; name: string }[];
};

/** Everything the issue form needs, in one gated call. */
export async function getIssueFormOptions(): Promise<IssueFormOptions> {
  await requireTool("/inventory");
  const supabase = await createClient();

  const [{ data: stores }, { data: plots }, { data: projects }] = await Promise.all([
    fetchAll((from, to) =>
      supabase
        .from("stores")
        .select("id, name, project_id")
        .eq("is_active", true)
        .order("name")
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("plots")
        .select("id, name, projects(name)")
        .order("name")
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase.from("projects").select("id, name").order("name").order("id").range(from, to),
    ),
  ]);

  return {
    stores: (stores ?? []).map(({ id, name, project_id }) => ({ id, name, project_id })),
    plots: (plots ?? []).map((plot) => ({
      id: plot.id,
      name: plot.name,
      project_name: (plot.projects as { name: string } | null)?.name ?? "—",
    })),
    projects: (projects ?? []).map(({ id, name }) => ({ id, name })),
  };
}

export type AdjustmentRow = {
  id: string;
  store_name: string;
  item_name: string;
  item_code: string | null;
  item_thumb_url: string | null;
  quantity: number;
  uom: string;
  reason: string;
  adjusted_at: string;
  adjusted_by_name: string | null;
};

export type AdjustmentPage = {
  adjustments: AdjustmentRow[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  stores: { id: string; name: string }[];
};

export async function listStockAdjustments({
  page = 1,
}: { page?: number } = {}): Promise<AdjustmentPage> {
  await requireTool("/inventory");
  const supabase = await createClient();

  const pageSize = INVENTORY_LIST_LIMIT;
  const currentPage = Math.max(1, page);

  const [{ data, count, error }, stores] = await Promise.all([
    supabase
      .from("stock_adjustments")
      .select("id, store_id, item_id, quantity, uom, reason, adjusted_at, created_by", {
        count: "exact",
      })
      .order("adjusted_at", { ascending: false })
      .order("id")
      .range((currentPage - 1) * pageSize, currentPage * pageSize - 1),
    listActiveStores(supabase),
  ]);

  if (error) {
    console.error("listStockAdjustments failed:", error);
    return { adjustments: [], total: 0, page: currentPage, pageCount: 1, pageSize, stores };
  }

  const rows = data ?? [];
  const [items, storeNames, nameOf] = await Promise.all([
    itemsById(
      supabase,
      rows.map((row) => row.item_id),
    ),
    labelsById(
      supabase,
      "stores",
      rows.map((row) => row.store_id),
    ),
    namesById(
      supabase,
      rows.map((row) => row.created_by),
    ),
  ]);

  const total = count ?? 0;
  return {
    adjustments: rows.map((row) => {
      const item = items.get(row.item_id);
      return {
        id: row.id,
        store_name: storeNames.get(row.store_id) ?? "—",
        item_name: item?.name ?? "—",
        item_code: item?.code ?? null,
        item_thumb_url: item?.thumb_url ?? null,
        quantity: row.quantity,
        uom: row.uom,
        reason: row.reason,
        adjusted_at: row.adjusted_at,
        adjusted_by_name: nameOf(row.created_by),
      };
    }),
    total,
    page: currentPage,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    pageSize,
    stores,
  };
}

/* ------------------------------------------------------------------ *
 * The Overview pipeline
 * ------------------------------------------------------------------ */

/**
 * Counts for the Overview pipeline's third stage.
 *
 * Deliberately NOT gated, exactly like countPosPipeline: the Overview
 * is the shell's home and every signed-in user sees it. Safe because
 * Inventory carries no money at all — a count of deliveries is
 * operational fact, and these tables' reads are open by design.
 */
export async function countReceiptsPipeline(): Promise<{
  receivedThisMonth: number;
  awaitingDelivery: number;
}> {
  const supabase = await createClient();

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const since = startOfMonth.toISOString().slice(0, 10);

  // Exact database counts, head-only — never rows.length.
  const [received, outstanding] = await Promise.all([
    supabase
      .from("goods_receipts")
      .select("id", { count: "exact", head: true })
      .gte("received_at", since),
    supabase.from("po_facts").select("id", { count: "exact", head: true }).eq("status", "issued"),
  ]);

  return {
    receivedThisMonth: received.count ?? 0,
    awaitingDelivery: outstanding.count ?? 0,
  };
}
