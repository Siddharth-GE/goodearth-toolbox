import "server-only";

import { cache } from "react";

import { requireTool } from "@/lib/auth/access";
import type { Filterable } from "@/lib/list-params";
import { labelsById, profileNames } from "@/lib/masters/names";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";

import { batchLabel, lineAmount, sumAmounts, type Amount } from "./batches";
import {
  INVENTORY_LIST_LIMIT,
  itemsById,
  listActiveStores,
  poReferencesById,
  receiptLineRates,
  type Client,
  type ReceiptLineRate,
} from "./queries";
import { remainingToReceive } from "./stock";

/**
 * Receiving reads — the POs goods can still arrive against, the receive
 * screen's pool, and the goods-receipt record. The boundaries that
 * shape everything here are documented in ./queries.ts.
 */

/** Headline counts for the tool's welcome screen. A welcome screen never
 * shows rupees, so these are counts of movements, nothing else. */
export async function getWelcomeCounts() {
  await requireTool("/inventory");
  const supabase = await createClient();

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  // received_at and issued_at are dates, not timestamps.
  const since = startOfMonth.toISOString().slice(0, 10);

  // Exact database counts, head-only — never rows.length.
  const [awaiting, received, issued] = await Promise.all([
    supabase.from("po_facts").select("id", { count: "exact", head: true }).eq("status", "issued"),
    supabase
      .from("goods_receipts")
      .select("id", { count: "exact", head: true })
      .gte("received_at", since),
    supabase
      .from("stock_issues")
      .select("id", { count: "exact", head: true })
      .gte("issued_at", since),
  ]);

  return {
    awaitingDelivery: awaiting.count ?? 0,
    receivedThisMonth: received.count ?? 0,
    issuedThisMonth: issued.count ?? 0,
  };
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

  // A failed read is an error screen, never "Nothing is on its way".
  if (error) {
    console.error("listReceivablePos failed:", error);
    throw new Error("Could not read the purchase orders awaiting delivery.", { cause: error });
  }

  // Every column of a view is typed nullable by the generator (a view
  // carries no NOT NULL metadata), so the row shape is normalised once
  // here rather than defended against at every use below.
  const rows = data.map((row) => ({
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
  const data = await fetchAll((from, to) =>
    supabase
      .from("po_line_facts")
      .select("id, po_id, quantity")
      .in("po_id", poIds)
      .order("id")
      .range(from, to),
  );
  // View columns are all typed nullable — normalise once (see above).
  const lines = data.map((line) => ({
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

  const data = await fetchAll((from, to) =>
    supabase
      .from("goods_receipt_lines")
      .select("po_line_id, quantity")
      .in("po_line_id", poLineIds)
      .order("id")
      .range(from, to),
  );
  for (const line of data) {
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
  /** The plot/unit the PO is scoped to — the "directly at site" option.
   * Null for a general-scope PO, which the receive screen reads as
   * "there is no site; this must go into a store." */
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
  const data = await fetchAll((from, to) =>
    supabase
      .from("po_line_facts")
      .select("id, item_id, quantity, uom")
      .eq("po_id", poId)
      .order("id")
      .range(from, to),
  );
  // View columns are all typed nullable — normalise once (see above).
  const lines = data.map((line) => ({
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

export type ReceiptListFilters = {
  page?: number;
  projectId?: string;
  storeId?: string;
  /** Delivery-note reference or challan number — already made safe by searchParam. */
  q?: string;
  /** Received-on date range, YYYY-MM-DD, already checked by dateParam. */
  from?: string;
  to?: string;
};

export async function listGoodsReceipts({
  page = 1,
  projectId,
  storeId,
  q,
  from,
  to,
}: ReceiptListFilters = {}): Promise<ReceiptPage> {
  await requireTool("/inventory");
  const supabase = await createClient();

  const pageSize = INVENTORY_LIST_LIMIT;
  const currentPage = Math.max(1, page);

  // Every filter in one place. received_at is a date, so `to` is plain lte.
  const filtered = <T extends Filterable<T>>(query: T): T => {
    let next = query;
    if (projectId) next = next.eq("project_id", projectId);
    if (storeId) next = next.eq("store_id", storeId);
    if (from) next = next.gte("received_at", from);
    if (to) next = next.lte("received_at", to);
    if (q) next = next.or(`reference.ilike.*${q}*,challan_no.ilike.*${q}*`);
    return next;
  };

  const { data, count, error } = await filtered(
    supabase
      .from("goods_receipts")
      .select(
        "id, reference, po_id, store_id, to_site, plot_id, unit_id, challan_no, received_at, created_by, goods_receipt_lines(count)",
        { count: "exact" },
      ),
  )
    .order("received_at", { ascending: false })
    .order("id")
    .range((currentPage - 1) * pageSize, currentPage * pageSize - 1);

  // A failed read is an error screen, never an empty list.
  if (error) {
    console.error("listGoodsReceipts failed:", error);
    throw new Error("Could not read the deliveries.", { cause: error });
  }

  const rows = data ?? [];
  const [poRefs, stores, plots, units, names] = await Promise.all([
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
    profileNames(
      supabase,
      rows.map((r) => r.created_by),
    ),
  ]);
  const nameOf = (id: string | null | undefined) => (id ? (names.get(id) ?? null) : null);

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
  /** "GRN/SAA/012-1" for a delivery into a store; a site delivery is no batch. */
  batch_label: string | null;
  /** The indent and work the line was bought for, when it came from one. */
  bought_for: string | null;
  /** The rate this delivery carries (0108): the PO's, or the delivery bill's. */
  rate: ReceiptLineRate;
  amount: Amount;
};

export type ReceiptDetail = {
  id: string;
  reference: string;
  po_id: string;
  po_reference: string;
  project_name: string;
  destination: string;
  to_site: boolean;
  /** The work a to-site delivery serves (0081); null for stores and history. */
  work_name: string | null;
  work_category: string | null;
  challan_no: string | null;
  received_at: string;
  note: string | null;
  created_at: string;
  received_by_name: string | null;
  lines: ReceiptLineRow[];
  totals: Amount;
};

/**
 * What each PO line was bought for: its indent's number and work, through
 * the money-free po_line_facts and the indent tables (open reads). A PO
 * line made without an indent has no entry.
 */
async function boughtForByPoLine(
  supabase: Client,
  poLineIds: string[],
): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  const unique = [...new Set(poLineIds)];
  if (unique.length === 0) return found;

  const poLines = await fetchAll((from, to) =>
    supabase
      .from("po_line_facts")
      .select("id, indent_line_id")
      .in("id", unique)
      .order("id")
      .range(from, to),
  );
  const indentLineIds = [
    ...new Set(poLines.map((line) => line.indent_line_id).filter((id): id is string => !!id)),
  ];
  if (indentLineIds.length === 0) return found;

  const indentLines = await fetchAll((from, to) =>
    supabase
      .from("indent_lines")
      .select("id, indents(reference, work_items(code, name))")
      .in("id", indentLineIds)
      .order("id")
      .range(from, to),
  );
  const labelByIndentLine = new Map(
    indentLines.map((line) => {
      const indent = line.indents as {
        reference: string;
        work_items: { code: string; name: string } | null;
      } | null;
      const work = indent?.work_items
        ? `${indent.work_items.name} (${indent.work_items.code})`
        : null;
      return [line.id, [work, indent?.reference].filter(Boolean).join(" · ")];
    }),
  );
  for (const line of poLines) {
    const label = line.indent_line_id ? labelByIndentLine.get(line.indent_line_id) : null;
    if (line.id && label) found.set(line.id, label);
  }
  return found;
}

export const getGoodsReceipt = cache(async (receiptId: string): Promise<ReceiptDetail | null> => {
  await requireTool("/inventory");
  const supabase = await createClient();

  const { data: receipt } = await supabase
    .from("goods_receipts")
    .select(
      "id, reference, po_id, project_id, store_id, to_site, plot_id, unit_id, work_item_id, challan_no, received_at, note, created_at, created_by, work_items(name, work_categories(name))",
    )
    .eq("id", receiptId)
    .maybeSingle();
  if (!receipt) return null;

  // The order the batch names count in (batchFactsById) — keep the two alike.
  const lines = await fetchAll((from, to) =>
    supabase
      .from("goods_receipt_lines")
      .select("id, po_line_id, item_id, quantity, uom, note, created_by, updated_by")
      .eq("receipt_id", receiptId)
      .order("created_at")
      .order("id")
      .range(from, to),
  );

  const [items, rates, boughtFor, poRefs, projects, stores, plots, units, names] =
    await Promise.all([
      itemsById(
        supabase,
        lines.map((line) => line.item_id),
      ),
      receiptLineRates(
        supabase,
        lines.map((line) => line.id),
      ),
      boughtForByPoLine(
        supabase,
        lines.map((line) => line.po_line_id),
      ),
      poReferencesById(supabase, [receipt.po_id]),
      labelsById(supabase, "projects", [receipt.project_id]),
      labelsById(supabase, "stores", [receipt.store_id]),
      labelsById(supabase, "plots", [receipt.plot_id]),
      labelsById(supabase, "units", [receipt.unit_id]),
      profileNames(supabase, [
        receipt.created_by,
        ...lines.map((line) => line.updated_by ?? line.created_by),
      ]),
    ]);
  const nameOf = (id: string | null | undefined) => (id ? (names.get(id) ?? null) : null);
  const noRate: ReceiptLineRate = {
    rate: null,
    gstPct: null,
    poRate: null,
    poGstPct: null,
    note: null,
  };

  const rows = lines.map((line, place): ReceiptLineRow => {
    const item = items.get(line.item_id);
    const rate = rates.get(line.id) ?? noRate;
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
      batch_label: receipt.store_id ? batchLabel(receipt.reference ?? "GRN", place) : null,
      bought_for: boughtFor.get(line.po_line_id) ?? null,
      rate,
      amount: lineAmount(line.quantity, rate.rate, rate.gstPct),
    };
  });

  return {
    id: receipt.id,
    reference: receipt.reference ?? "—",
    po_id: receipt.po_id,
    po_reference: poRefs.get(receipt.po_id) ?? "—",
    project_name: projects.get(receipt.project_id) ?? "—",
    destination: describeDestination(receipt, stores, plots, units),
    to_site: receipt.to_site,
    work_name:
      (receipt.work_items as { name: string; work_categories: { name: string } | null } | null)
        ?.name ?? null,
    work_category:
      (receipt.work_items as { name: string; work_categories: { name: string } | null } | null)
        ?.work_categories?.name ?? null,
    challan_no: receipt.challan_no,
    received_at: receipt.received_at,
    note: receipt.note,
    created_at: receipt.created_at,
    received_by_name: nameOf(receipt.created_by),
    lines: rows,
    totals: sumAmounts(rows.map((row) => row.amount)),
  };
});
