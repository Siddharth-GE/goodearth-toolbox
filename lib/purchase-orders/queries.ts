import "server-only";

import { cache } from "react";

import { requireTool } from "@/lib/auth/access";
import { listPlots } from "@/lib/masters/plots";
import { listProjects } from "@/lib/masters/projects";
import { listUnits } from "@/lib/masters/units";
import { listVendors } from "@/lib/masters/vendors";
import { listStores } from "@/lib/masters/stores";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { PoStatus } from "./workflow";

// Purchase Orders reads the indents/masters tables DIRECTLY, under its
// own /purchase-orders grant — never another tool's gated queries module
// (the lib/indents/queries.ts rule). Money lives on the PO tables and
// their RLS requires this tool's grant to SELECT, so nothing here can be
// read by a user who only holds /indents.

export const PO_LIST_LIMIT = 50;

export type PoListRow = {
  id: string;
  reference: string;
  status: PoStatus;
  scope_code: string;
  expected_by: string | null;
  created_at: string;
  project_name: string;
  vendor_name: string;
  line_count: number;
};

export type PoListPage = {
  orders: PoListRow[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
};

export async function listPurchaseOrders({
  page = 1,
  status,
}: {
  page?: number;
  status?: PoStatus;
} = {}): Promise<PoListPage> {
  await requireTool("/purchase-orders");
  const supabase = await createClient();

  const pageSize = PO_LIST_LIMIT;
  const currentPage = Math.max(1, page);

  // A stated limit with an exact database count — the total is never
  // derived from the rows that happened to arrive.
  let query = supabase
    .from("purchase_orders")
    .select(
      "id, reference, status, scope_code, expected_by, created_at, projects(name), vendors(name), purchase_order_lines(count)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .order("id")
    .range((currentPage - 1) * pageSize, currentPage * pageSize - 1);
  if (status) query = query.eq("status", status);

  const { data, count, error } = await query;
  if (error) {
    console.error("listPurchaseOrders failed:", error);
    return { orders: [], total: 0, page: currentPage, pageCount: 1, pageSize };
  }

  const total = count ?? 0;
  return {
    orders: (data ?? []).map((row) => ({
      id: row.id,
      reference: row.reference ?? "—",
      status: row.status as PoStatus,
      scope_code: row.scope_code ?? "—",
      expected_by: row.expected_by,
      created_at: row.created_at,
      project_name: (row.projects as { name: string } | null)?.name ?? "—",
      vendor_name: (row.vendors as { name: string } | null)?.name ?? "—",
      line_count: (row.purchase_order_lines as { count: number }[] | null)?.[0]?.count ?? 0,
    })),
    total,
    page: currentPage,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    pageSize,
  };
}

/* ------------------------------------------------------------------ *
 * The new-PO form
 * ------------------------------------------------------------------ */

export type PoProjectOption = { id: string; name: string; code: string | null };
export type PoScopedOption = { id: string; project_id: string; name: string; code: string | null };
export type PoVendorOption = { id: string; name: string };
export type PoStoreOption = { id: string; name: string };

export type PoFormOptions = {
  projects: PoProjectOption[];
  plots: PoScopedOption[];
  units: (PoScopedOption & { plot_id: string | null })[];
  vendors: PoVendorOption[];
  stores: PoStoreOption[];
};

/** Everything the new-PO form needs, in one gated call. The masters
 * reads themselves are ungated by design — this wrapper is the gate. */
export async function getPoFormOptions(): Promise<PoFormOptions> {
  await requireTool("/purchase-orders");
  const [projects, plots, units, vendors, stores] = await Promise.all([
    listProjects(),
    listPlots(),
    listUnits(),
    listVendors(true),
    listStores(),
  ]);
  return {
    projects: projects.map(({ id, name, code }) => ({ id, name, code })),
    plots: plots.map(({ id, project_id, name, code }) => ({ id, project_id, name, code })),
    units: units.map(({ id, project_id, plot_id, name, code }) => ({
      id,
      project_id,
      plot_id,
      name,
      code,
    })),
    vendors: vendors.map(({ id, name }) => ({ id, name })),
    stores: stores.filter((store) => store.is_active).map(({ id, name }) => ({ id, name })),
  };
}

/* ------------------------------------------------------------------ *
 * One purchase order, in full
 * ------------------------------------------------------------------ */

export type PoLineRow = {
  id: string;
  item_id: string;
  item_name: string;
  item_code: string | null;
  item_brand: string | null;
  item_thumb_url: string | null;
  quantity: number;
  uom: string;
  rate: number | null;
  gst_pct: number | null;
  note: string | null;
  indent_line_id: string;
  indent_reference: string;
  /** Who last touched the line — the attribution rule. */
  updated_by_name: string | null;
};

export type PoDetail = {
  id: string;
  reference: string;
  status: PoStatus;
  project_id: string;
  project_name: string;
  plot_id: string | null;
  unit_id: string | null;
  scope_code: string;
  scope_name: string | null;
  vendor_id: string;
  vendor_name: string;
  deliver_store_id: string | null;
  deliver_note: string | null;
  expected_by: string | null;
  terms: string | null;
  note: string | null;
  deletion_note: string | null;
  created_by: string | null;
  created_at: string;
  issued_at: string | null;
  deletion_requested_by: string | null;
  deletion_requested_at: string | null;
  cancelled_at: string | null;
  created_by_name: string | null;
  issued_by_name: string | null;
  deletion_requested_by_name: string | null;
  cancelled_by_name: string | null;
  lines: PoLineRow[];
  line_count: number;
};

export const getPurchaseOrder = cache(async (poId: string): Promise<PoDetail | null> => {
  await requireTool("/purchase-orders");
  const supabase = await createClient();

  const [{ data: po }, { data: lines }] = await Promise.all([
    supabase
      .from("purchase_orders")
      .select(
        "id, reference, status, project_id, plot_id, unit_id, scope_code, vendor_id, deliver_store_id, deliver_note, expected_by, terms, note, deletion_note, created_by, created_at, issued_by, issued_at, deletion_requested_by, deletion_requested_at, cancelled_by, cancelled_at, projects(name), plots(name), units(name), vendors(name)",
      )
      .eq("id", poId)
      .maybeSingle(),
    fetchAll((from, to) =>
      supabase
        .from("purchase_order_lines")
        .select(
          "id, item_id, quantity, uom, rate, gst_pct, note, indent_line_id, created_by, updated_by, created_at, items(name, code, thumb_url, brands(name)), indent_lines(indents(reference))",
        )
        .eq("po_id", poId)
        .order("sort_order")
        .order("created_at")
        .order("id")
        .range(from, to),
    ),
  ]);

  if (!po) return null;

  // One profiles read resolves every actor on the document — simpler
  // and safer than four embedded joins on a table with several FKs to
  // profiles (Supabase would need each constraint named explicitly).
  const actorIds = [
    ...new Set(
      [
        po.created_by,
        po.issued_by,
        po.deletion_requested_by,
        po.cancelled_by,
        ...(lines ?? []).map((line) => line.updated_by ?? line.created_by),
      ].filter((id): id is string => id != null),
    ),
  ];
  const { data: profiles } = actorIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", actorIds)
    : { data: [] };
  const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name]));
  const nameOf = (id: string | null | undefined) => (id ? (names.get(id) ?? null) : null);

  const mapped: PoLineRow[] = (lines ?? []).map((line) => {
    const item = line.items as {
      name: string;
      code: string | null;
      thumb_url: string | null;
      brands: { name: string } | null;
    } | null;
    const indent = line.indent_lines as { indents: { reference: string } | null } | null;
    return {
      id: line.id,
      item_id: line.item_id,
      item_name: item?.name ?? "—",
      item_code: item?.code ?? null,
      item_brand: item?.brands?.name ?? null,
      item_thumb_url: item?.thumb_url ?? null,
      quantity: line.quantity,
      uom: line.uom,
      rate: line.rate,
      gst_pct: line.gst_pct,
      note: line.note,
      indent_line_id: line.indent_line_id,
      indent_reference: indent?.indents?.reference ?? "—",
      updated_by_name: nameOf(line.updated_by ?? line.created_by),
    };
  });

  return {
    id: po.id,
    reference: po.reference ?? "—",
    status: po.status as PoStatus,
    project_id: po.project_id,
    project_name: (po.projects as { name: string } | null)?.name ?? "—",
    plot_id: po.plot_id,
    unit_id: po.unit_id,
    scope_code: po.scope_code ?? "—",
    scope_name:
      (po.units as { name: string } | null)?.name ??
      (po.plots as { name: string } | null)?.name ??
      null,
    vendor_id: po.vendor_id,
    vendor_name: (po.vendors as { name: string } | null)?.name ?? "—",
    deliver_store_id: po.deliver_store_id,
    deliver_note: po.deliver_note,
    expected_by: po.expected_by,
    terms: po.terms,
    note: po.note,
    deletion_note: po.deletion_note,
    created_by: po.created_by,
    created_at: po.created_at,
    issued_at: po.issued_at,
    deletion_requested_by: po.deletion_requested_by,
    deletion_requested_at: po.deletion_requested_at,
    cancelled_at: po.cancelled_at,
    created_by_name: nameOf(po.created_by),
    issued_by_name: nameOf(po.issued_by),
    deletion_requested_by_name: nameOf(po.deletion_requested_by),
    cancelled_by_name: nameOf(po.cancelled_by),
    lines: mapped,
    line_count: mapped.length,
  };
});

export type PoBilledTotals = {
  ordered_total: number;
  billed_total: number;
  bill_count: number;
};

/**
 * The ordered-vs-billed picture for one PO, from the po_billing_totals
 * window (migration 0025) — the one sanctioned money view between
 * Purchase Orders and Bills. Its WHERE qual admits /purchase-orders and
 * /bills holders; this caller is already behind requireTool, and a row
 * filtered away by the qual comes back as null, rendered as "nothing
 * billed yet".
 */
export async function getPoBilledTotals(poId: string): Promise<PoBilledTotals> {
  await requireTool("/purchase-orders");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("po_billing_totals")
    .select("ordered_total, billed_total, bill_count")
    .eq("po_id", poId)
    .maybeSingle();
  if (error) console.error("getPoBilledTotals failed:", error);

  // Every view column is typed nullable by the generator — normalise
  // once at the boundary.
  return {
    ordered_total: data?.ordered_total ?? 0,
    billed_total: data?.billed_total ?? 0,
    bill_count: data?.bill_count ?? 0,
  };
}

export type PoPdfData = {
  po: PoDetail;
  vendor: {
    name: string;
    contact_name: string | null;
    mobile: string | null;
    gst_no: string | null;
    address: string | null;
  };
  deliver_store_name: string | null;
};

/** Everything the PO document needs — the detail plus the vendor's
 * full counterparty block from Masters. Gated by getPurchaseOrder. */
export async function getPoPdfData(poId: string): Promise<PoPdfData | null> {
  const po = await getPurchaseOrder(poId);
  if (!po) return null;

  const supabase = await createClient();
  const [{ data: vendor }, store] = await Promise.all([
    supabase
      .from("vendors")
      .select("name, contact_name, mobile, gst_no, address")
      .eq("id", po.vendor_id)
      .maybeSingle(),
    po.deliver_store_id
      ? supabase.from("stores").select("name").eq("id", po.deliver_store_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return {
    po,
    vendor: {
      name: vendor?.name ?? po.vendor_name,
      contact_name: vendor?.contact_name ?? null,
      mobile: vendor?.mobile ?? null,
      gst_no: vendor?.gst_no ?? null,
      address: vendor?.address ?? null,
    },
    deliver_store_name: store?.data?.name ?? null,
  };
}

/** Who the signed-in user is to this tool — drives the creator-or-admin
 * delete rule and (from M3) the admin-only deletion approval. The
 * database enforces both again. */
export async function getCurrentPoActor(): Promise<{ isAdmin: boolean; userId: string }> {
  const user = await requireTool("/purchase-orders");
  return { isAdmin: user.profile?.role === "admin", userId: user.id };
}

/* ------------------------------------------------------------------ *
 * The pool — approved indent lines this PO can still order
 * ------------------------------------------------------------------ */

export type PoolLineRow = {
  /** indent_lines.id — the provenance anchor a PO line carries. */
  indent_line_id: string;
  item_id: string;
  item_name: string;
  item_code: string | null;
  item_brand: string | null;
  item_thumb_url: string | null;
  uom: string;
  /** What the approved indent asks for. */
  approved_quantity: number;
  /** Ordered across ALL non-cancelled POs, this one included. */
  already_ordered: number;
  /** approved − ordered; what this PO could still take. */
  remaining: number;
  /** Already a line on this PO — shown disabled, never hidden. */
  on_this_po: boolean;
  note: string | null;
};

export type PoolIndentGroup = {
  indent_id: string;
  reference: string;
  stage: string | null;
  lines: PoolLineRow[];
};

export type IndentPool = {
  /** How the pool was filtered, said on screen. */
  scope_label: string;
  groups: PoolIndentGroup[];
};

/**
 * The approved indent lines a PO may order from: same project, same
 * scope (the founder's one-PO-one-plot/unit rule — a unit PO pulls from
 * that unit's indents, a plot PO from that plot's, a general PO from
 * indents tagged to neither). Every line is annotated with what's
 * already ordered across all live POs, and fully-ordered lines render
 * disabled-and-labelled rather than vanishing.
 */
export async function getIndentPool(poId: string): Promise<IndentPool | null> {
  await requireTool("/purchase-orders");
  const supabase = await createClient();

  const { data: po } = await supabase
    .from("purchase_orders")
    .select("id, project_id, plot_id, unit_id, units(name), plots(name)")
    .eq("id", poId)
    .maybeSingle();
  if (!po) return null;

  // Read to completion — a truncated pool would silently hide approved
  // lines, which reads as "already ordered" and leaves material unbought.
  // The query is built fresh per callback: fetchAll pages by calling it
  // again, and a reused builder would stack duplicate clauses.
  const { data: indents } = await fetchAll((from, to) => {
    let query = supabase
      .from("indents")
      .select("id, reference, stage")
      .eq("project_id", po.project_id)
      .eq("status", "approved");
    if (po.unit_id) {
      query = query.eq("unit_id", po.unit_id);
    } else if (po.plot_id) {
      query = query.eq("plot_id", po.plot_id);
    } else {
      query = query.is("unit_id", null).is("plot_id", null);
    }
    return query.order("created_at").order("id").range(from, to);
  });

  const scope_label = po.unit_id
    ? `unit ${(po.units as { name: string } | null)?.name ?? ""}`.trim()
    : po.plot_id
      ? `plot ${(po.plots as { name: string } | null)?.name ?? ""}`.trim()
      : "general (no plot or unit)";

  if ((indents ?? []).length === 0) return { scope_label, groups: [] };

  const indentIds = (indents ?? []).map((indent) => indent.id);
  const { data: lines } = await fetchAll((from, to) =>
    supabase
      .from("indent_lines")
      .select(
        "id, indent_id, item_id, quantity, uom, note, items(name, code, thumb_url, brands(name))",
      )
      .in("indent_id", indentIds)
      .order("created_at")
      .order("id")
      .range(from, to),
  );

  const lineIds = (lines ?? []).map((line) => line.id);
  const { data: ordered } = lineIds.length
    ? await fetchAll((from, to) =>
        supabase
          .from("purchase_order_lines")
          .select("indent_line_id, quantity, po_id, purchase_orders(status)")
          .in("indent_line_id", lineIds)
          .order("id")
          .range(from, to),
      )
    : { data: [] };

  const orderedByLine = new Map<string, number>();
  const onThisPo = new Set<string>();
  for (const row of ordered ?? []) {
    const status = (row.purchase_orders as { status: string } | null)?.status;
    if (status === "cancelled") continue;
    orderedByLine.set(
      row.indent_line_id,
      (orderedByLine.get(row.indent_line_id) ?? 0) + row.quantity,
    );
    if (row.po_id === poId) onThisPo.add(row.indent_line_id);
  }

  const byIndent = new Map<string, PoolLineRow[]>();
  for (const line of lines ?? []) {
    const item = line.items as {
      name: string;
      code: string | null;
      thumb_url: string | null;
      brands: { name: string } | null;
    } | null;
    const already = orderedByLine.get(line.id) ?? 0;
    const group = byIndent.get(line.indent_id) ?? [];
    group.push({
      indent_line_id: line.id,
      item_id: line.item_id,
      item_name: item?.name ?? "—",
      item_code: item?.code ?? null,
      item_brand: item?.brands?.name ?? null,
      item_thumb_url: item?.thumb_url ?? null,
      uom: line.uom,
      approved_quantity: line.quantity,
      already_ordered: already,
      remaining: Math.max(0, line.quantity - already),
      on_this_po: onThisPo.has(line.id),
      note: line.note,
    });
    byIndent.set(line.indent_id, group);
  }

  return {
    scope_label,
    groups: (indents ?? [])
      .filter((indent) => byIndent.has(indent.id))
      .map((indent) => ({
        indent_id: indent.id,
        reference: indent.reference ?? "—",
        stage: indent.stage,
        lines: byIndent.get(indent.id) ?? [],
      })),
  };
}

/* ------------------------------------------------------------------ *
 * Receipts against this PO — the detail page's "did it arrive?"
 * ------------------------------------------------------------------ */

type Client = SupabaseClient<Database>;

/** name-by-id for any master table with an `id` and a `name`. */
async function labelsById(
  supabase: Client,
  table: "stores" | "plots" | "units",
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

/** Item names for a set of ids — only the name; the receipt rows on the
 * PO page show no thumbnails or codes. */
async function itemNamesById(supabase: Client, ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const { data, error } = await fetchAll((from, to) =>
    supabase.from("items").select("id, name").in("id", unique).order("id").range(from, to),
  );
  if (error) console.error("itemNamesById failed:", error);
  return new Map((data ?? []).map((row) => [row.id, row.name]));
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
 * gated on this tool's own /purchase-orders grant. Nothing here is
 * money; it is the PO holder's own screen asking "did it arrive?".
 * The goods tables' reads are open by design (Inventory carries no
 * money), read directly rather than through Inventory's queries module.
 */
export async function getPoReceipts(poId: string): Promise<PoReceiptRow[]> {
  await requireTool("/purchase-orders");
  const supabase = await createClient();

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
    itemNamesById(
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
      item_name: items.get(line.item_id) ?? "—",
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
