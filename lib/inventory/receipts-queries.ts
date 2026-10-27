import "server-only";

import { cache } from "react";

import { requireTool } from "@/lib/auth/access";
import type { Filterable } from "@/lib/list-params";
import { labelsById, profileNames } from "@/lib/masters/names";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { assertRead } from "@/lib/supabase/read-failed";
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
import { todayInIndia } from "@/lib/format";

/** Counts of movements only: a welcome screen never shows rupees. */
export async function getWelcomeCounts() {
  await requireTool("/inventory");
  const supabase = await createClient();

  // received_at and issued_at are dates, not timestamps. This month starts on India's calendar.
  const since = `${todayInIndia().slice(0, 8)}01`;

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

  assertRead("inventory", "the welcome counts", awaiting.error ?? received.error ?? issued.error);

  return {
    awaitingDelivery: awaiting.count ?? 0,
    receivedThisMonth: received.count ?? 0,
    issuedThisMonth: issued.count ?? 0,
  };
}

export type ReceivablePoRow = {
  id: string;
  reference: string;
  project_name: string;
  vendor_name: string;
  scope_label: string;
  expected_by: string | null;
  issued_at: string | null;
  line_count: number;
  lines_complete: number;
};

export type ReceivablePoPage = {
  orders: ReceivablePoRow[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
};

/** Issued POs goods can still arrive against. A PO leaves by completing itself (0023), so empty means nothing outstanding. */
export async function listReceivablePos({
  page = 1,
  q,
  projectId,
  vendorId,
  plotId,
}: {
  page?: number;
  q?: string;
  projectId?: string;
  vendorId?: string;
  plotId?: string;
} = {}): Promise<ReceivablePoPage> {
  await requireTool("/inventory");
  const supabase = await createClient();

  const pageSize = INVENTORY_LIST_LIMIT;
  const currentPage = Math.max(1, page);

  // A vendor-name search becomes vendor ids, so one or() covers the PO number and the vendor.
  let vendorIds: string[] = [];
  if (q) {
    const { data: matched, error: vendorError } = await supabase
      .from("vendors")
      .select("id")
      .ilike("name", `%${q}%`)
      .limit(200);
    if (vendorError) {
      console.error("listReceivablePos vendor search failed:", vendorError);
      throw new Error("Could not search the purchase orders.", { cause: vendorError });
    }
    vendorIds = (matched ?? []).map((row) => row.id);
  }

  let query = supabase
    .from("po_facts")
    .select("id, project_id, plot_id, unit_id, vendor_id, reference, expected_by, issued_at", {
      count: "exact",
    })
    .eq("status", "issued");
  if (projectId) query = query.eq("project_id", projectId);
  if (vendorId) query = query.eq("vendor_id", vendorId);
  // One or() only: the villa's scopes and the search each become a group, joined by and().
  const groups: string[] = [];
  if (plotId) {
    // A PO is scoped to a plot or to one of its units, never both (0021).
    const { data: units, error: unitError } = await supabase
      .from("units")
      .select("id")
      .eq("plot_id", plotId);
    if (unitError) {
      console.error("listReceivablePos unit lookup failed:", unitError);
      throw new Error("Could not search the purchase orders.", { cause: unitError });
    }
    const unitIds = (units ?? []).map((row) => row.id);
    const scopes = [`plot_id.eq.${plotId}`];
    if (unitIds.length) scopes.push(`unit_id.in.(${unitIds.join(",")})`);
    groups.push(scopes.join(","));
  }
  if (q) {
    const clauses = [`reference.ilike.*${q}*`];
    if (vendorIds.length) clauses.push(`vendor_id.in.(${vendorIds.join(",")})`);
    groups.push(clauses.join(","));
  }
  if (groups.length === 1) query = query.or(groups[0]);
  if (groups.length === 2) query = query.or(`and(or(${groups[0]}),or(${groups[1]}))`);
  const { data, count, error } = await query
    .order("issued_at", { ascending: false })
    .order("id")
    .range((currentPage - 1) * pageSize, currentPage * pageSize - 1);

  if (error) {
    console.error("listReceivablePos failed:", error);
    throw new Error("Could not read the purchase orders awaiting delivery.", { cause: error });
  }

  // Views type every column nullable; normalise once here.
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

/** The vendors with a PO still awaiting delivery, A–Z: the Receive finder offers only these. */
export async function listReceivableVendors(): Promise<{ id: string; name: string }[]> {
  await requireTool("/inventory");
  const supabase = await createClient();
  const rows = await fetchAll<{ vendor_id: string | null }>((from, to) =>
    supabase
      .from("po_facts")
      .select("vendor_id")
      .eq("status", "issued")
      .order("id")
      .range(from, to),
  );
  const names = await labelsById(
    supabase,
    "vendors",
    rows.map((row) => row.vendor_id),
  );
  return [...names]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function receivedProgressForPos(
  supabase: Client,
  poIds: string[],
): Promise<Map<string, { ordered: number; received: number }[]>> {
  const byPo = new Map<string, { ordered: number; received: number }[]>();
  if (poIds.length === 0) return byPo;

  // Completeness: a missing line reads as "fully received".
  const data = await fetchAll((from, to) =>
    supabase
      .from("po_line_facts")
      .select("id, po_id, quantity")
      .in("po_id", poIds)
      .order("id")
      .range(from, to),
  );
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
  /** The plot/unit the PO is scoped to ("directly at site"); null for a general PO, which must go to a store. */
  site_label: string | null;
  lines: ReceiveLine[];
  stores: { id: string; name: string }[];
};

/** Everything the receive screen needs for one PO; fully-received lines stay visible, disabled and labelled. */
export async function getReceivePool(poId: string): Promise<ReceivePool | null> {
  await requireTool("/inventory");
  const supabase = await createClient();

  const { data: po, error: poError } = await supabase
    .from("po_facts")
    .select("id, project_id, plot_id, unit_id, vendor_id, reference, status")
    .eq("id", poId)
    .maybeSingle();
  assertRead("inventory", "this order", poError);
  if (!po) return null;

  // Completeness: a truncated line list would let the rest of the delivery go unrecorded.
  const data = await fetchAll((from, to) =>
    supabase
      .from("po_line_facts")
      .select("id, item_id, quantity, uom")
      .eq("po_id", poId)
      .order("id")
      .range(from, to),
  );
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
  q?: string;
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
  work_name: string | null;
  work_category: string | null;
  challan_no: string | null;
  invoice_no: string | null;
  invoice_date: string | null;
  received_at: string;
  note: string | null;
  created_at: string;
  received_by_name: string | null;
  lines: ReceiptLineRow[];
  totals: Amount;
};

/** What each PO line was bought for (its indent number and work), via money-free views. */
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
      .select("id, indents(reference, work_items(code, name), work_groups(code, name))")
      .in("id", indentLineIds)
      .order("id")
      .range(from, to),
  );
  const labelByIndentLine = new Map(
    indentLines.map((line) => {
      const indent = line.indents as {
        reference: string;
        work_items: { code: string; name: string } | null;
        work_groups: { code: string; name: string } | null;
      } | null;
      const named = indent?.work_items ?? indent?.work_groups;
      const work = named ? `${named.name} (${named.code})` : null;
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

  const { data: receipt, error: receiptError } = await supabase
    .from("goods_receipts")
    .select(
      "id, reference, po_id, project_id, store_id, to_site, plot_id, unit_id, work_item_id, challan_no, invoice_no, invoice_date, received_at, note, created_at, created_by, work_items(name, work_categories(name))",
    )
    .eq("id", receiptId)
    .maybeSingle();
  assertRead("inventory", "this receipt", receiptError);
  if (!receipt) return null;

  // Same order the batch names count in (batchFactsById).
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
    invoice_no: receipt.invoice_no,
    invoice_date: receipt.invoice_date,
    received_at: receipt.received_at,
    note: receipt.note,
    created_at: receipt.created_at,
    received_by_name: nameOf(receipt.created_by),
    lines: rows,
    totals: sumAmounts(rows.map((row) => row.amount)),
  };
});
