import "server-only";

import { cache } from "react";

import { requireTool } from "@/lib/auth/access";
import { istDayEndExclusive, istDayStart, type Filterable } from "@/lib/list-params";
import { getProjectCompany, type CompanyRow } from "@/lib/masters/companies";
import { listActiveTerms, type TermsTemplate } from "@/lib/masters/terms";
import { labelsById, profileNames } from "@/lib/masters/names";
import { listPlots } from "@/lib/masters/plots";
import { listProjects } from "@/lib/masters/projects";
import { listUnits } from "@/lib/masters/units";
import { listVendors } from "@/lib/masters/vendors";
import { listStores } from "@/lib/masters/stores";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { assertRead } from "@/lib/supabase/read-failed";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { PoStatus } from "./workflow";

// Reads indents/masters tables directly under the /purchase-orders grant, never another tool's queries module. Money lives on the PO tables, whose RLS needs this grant.

const PO_LIST_LIMIT = 50;

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

export async function getWelcomeCounts() {
  await requireTool("/purchase-orders");
  const supabase = await createClient();

  const [drafts, issued, deletions] = await Promise.all([
    supabase
      .from("purchase_orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "draft"),
    supabase
      .from("purchase_orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "issued"),
    supabase
      .from("purchase_orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "deletion_requested"),
  ]);

  assertRead(
    "purchase-orders",
    "the welcome counts",
    drafts.error ?? issued.error ?? deletions.error,
  );

  return {
    drafts: drafts.count ?? 0,
    issuedOpen: issued.count ?? 0,
    deletionRequests: deletions.count ?? 0,
  };
}

export type PoListFilters = {
  page?: number;
  status?: PoStatus;
  vendorId?: string;
  projectId?: string;
  q?: string;
  from?: string;
  to?: string;
};

export async function listPurchaseOrders({
  page = 1,
  status,
  vendorId,
  projectId,
  q,
  from,
  to,
}: PoListFilters = {}): Promise<PoListPage> {
  await requireTool("/purchase-orders");
  const supabase = await createClient();

  const pageSize = PO_LIST_LIMIT;
  const currentPage = Math.max(1, page);

  // A vendor-name search becomes vendor ids, so one or() covers reference and vendor.
  let vendorIdsForSearch: string[] = [];
  if (q) {
    const { data: matched, error: vendorError } = await supabase
      .from("vendors")
      .select("id")
      .ilike("name", `%${q}%`)
      .limit(200);
    if (vendorError) {
      console.error("listPurchaseOrders vendor search failed:", vendorError);
      throw new Error("Could not search purchase orders.", { cause: vendorError });
    }
    vendorIdsForSearch = (matched ?? []).map((row) => row.id);
  }

  // created_at is a timestamp, so the "to" day runs up to the day after it.
  const filtered = <T extends Filterable<T>>(query: T): T => {
    let next = query;
    if (status) next = next.eq("status", status);
    if (vendorId) next = next.eq("vendor_id", vendorId);
    if (projectId) next = next.eq("project_id", projectId);
    if (from) next = next.gte("created_at", istDayStart(from));
    if (to) next = next.lt("created_at", istDayEndExclusive(to));
    if (q) {
      const clauses = [`reference.ilike.*${q}*`];
      if (vendorIdsForSearch.length) clauses.push(`vendor_id.in.(${vendorIdsForSearch.join(",")})`);
      next = next.or(clauses.join(","));
    }
    return next;
  };

  const { data, count, error } = await filtered(
    supabase
      .from("purchase_orders")
      .select(
        "id, reference, status, scope_code, expected_by, created_at, projects(name), vendors(name), purchase_order_lines(count)",
        { count: "exact" },
      ),
  )
    .order("created_at", { ascending: false })
    .order("id")
    .range((currentPage - 1) * pageSize, currentPage * pageSize - 1);
  // A failed read is an error screen, never an empty list.
  if (error) {
    console.error("listPurchaseOrders failed:", error);
    throw new Error("Could not read the purchase orders.", { cause: error });
  }

  const total = count ?? 0;
  return {
    orders: data.map((row) => ({
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

export async function getPoFilterOptions(): Promise<{
  vendors: { id: string; name: string }[];
  projects: { id: string; name: string }[];
}> {
  await requireTool("/purchase-orders");
  const [vendors, projects] = await Promise.all([listVendors(), listProjects()]);
  return {
    vendors: vendors.map(({ id, name }) => ({ id, name })),
    projects: projects.map(({ id, name }) => ({ id, name })),
  };
}

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

export type PoLineRow = {
  id: string;
  item_id: string;
  item_name: string;
  item_code: string | null;
  item_brand: string | null;
  item_thumb_url: string | null;
  item_description: string | null;
  item_category: string | null;
  quantity: number;
  uom: string;
  rate: number | null;
  gst_pct: number | null;
  /** 0102: a percentage OR a rupee discount, never both. */
  discount_pct: number | null;
  discount_amount: number | null;
  /** 0102: freight, loading and the like, added after GST. */
  other_charges: number | null;
  note: string | null;
  /** Null = a direct line (0079) — a bulk or urgent buy with no indent. */
  indent_line_id: string | null;
  indent_reference: string | null;
  work_label: string | null;
  /** Invoiced so far: the bill lines against this line (0106). */
  billed_quantity: number;
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
  /** Against the company's state: same → CGST + SGST, else IGST. */
  vendor_gst_state: string | null;
  deliver_store_id: string | null;
  deliver_store_name: string | null;
  deliver_note: string | null;
  expected_by: string | null;
  terms: string | null;
  note: string | null;
  /** 0133: freight, loading and the like, at their own GST %. */
  charges_amount: number | null;
  charges_gst_pct: number | null;
  charges_note: string | null;
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

  const [{ data: po, error: poError }, lines, billed] = await Promise.all([
    supabase
      .from("purchase_orders")
      .select(
        "id, reference, status, project_id, plot_id, unit_id, scope_code, vendor_id, deliver_store_id, deliver_note, expected_by, terms, note, charges_amount, charges_gst_pct, charges_note, deletion_note, created_by, created_at, issued_by, issued_at, deletion_requested_by, deletion_requested_at, cancelled_by, cancelled_at, projects(name), plots(name), units(name), vendors(name, gst_state), stores(name)",
      )
      .eq("id", poId)
      .maybeSingle(),
    fetchAll((from, to) =>
      supabase
        .from("purchase_order_lines")
        .select(
          "id, item_id, quantity, uom, rate, gst_pct, discount_pct, discount_amount, other_charges, note, indent_line_id, created_by, updated_by, created_at, items(name, code, description, thumb_url, brands(name), item_categories(name)), indent_lines(indents(reference, work_items(code, name), work_groups(code, name)))",
        )
        .eq("po_id", poId)
        .order("sort_order")
        .order("created_at")
        .order("id")
        .range(from, to),
    ),
    // po_line_billing_facts (0106): the PO-Bills window, gated to /purchase-orders or /bills.
    fetchAll((from, to) =>
      supabase
        .from("po_line_billing_facts")
        .select("po_line_id, billed_quantity")
        .eq("po_id", poId)
        .order("po_line_id")
        .range(from, to),
    ),
  ]);

  if (poError) {
    console.error("getPurchaseOrder failed:", poError);
    throw new Error("Could not read the purchase order.", { cause: poError });
  }
  if (!po) return null;

  const billedByLine = new Map(
    billed.map((row) => [row.po_line_id ?? "", row.billed_quantity ?? 0]),
  );

  // One profiles read, not embeds (several FKs to profiles).
  const actorIds = [
    ...new Set(
      [
        po.created_by,
        po.issued_by,
        po.deletion_requested_by,
        po.cancelled_by,
        ...lines.map((line) => line.updated_by ?? line.created_by),
      ].filter((id): id is string => id != null),
    ),
  ];
  const { data: profiles } = actorIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", actorIds)
    : { data: [] };
  const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name]));
  const nameOf = (id: string | null | undefined) => (id ? (names.get(id) ?? null) : null);

  const mapped: PoLineRow[] = lines.map((line) => {
    const item = line.items as {
      name: string;
      code: string | null;
      description: string | null;
      thumb_url: string | null;
      brands: { name: string } | null;
      item_categories: { name: string } | null;
    } | null;
    const indent = line.indent_lines as {
      indents: {
        reference: string;
        work_items: { code: string; name: string } | null;
        work_groups: { code: string; name: string } | null;
      } | null;
    } | null;
    // A stage indent (0158) names its stage where an older one names its work.
    const work = indent?.indents?.work_items ?? indent?.indents?.work_groups;
    return {
      id: line.id,
      item_id: line.item_id,
      item_name: item?.name ?? "—",
      item_code: item?.code ?? null,
      item_brand: item?.brands?.name ?? null,
      item_thumb_url: item?.thumb_url ?? null,
      item_description: item?.description?.trim() || null,
      item_category: item?.item_categories?.name ?? null,
      quantity: line.quantity,
      uom: line.uom,
      rate: line.rate,
      gst_pct: line.gst_pct,
      discount_pct: line.discount_pct,
      discount_amount: line.discount_amount,
      other_charges: line.other_charges,
      note: line.note,
      indent_line_id: line.indent_line_id,
      indent_reference: indent?.indents?.reference ?? null,
      work_label: work ? `${work.name} — ${work.code}` : null,
      billed_quantity: billedByLine.get(line.id) ?? 0,
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
    vendor_gst_state: (po.vendors as { gst_state: string | null } | null)?.gst_state ?? null,
    deliver_store_id: po.deliver_store_id,
    deliver_store_name: (po.stores as { name: string } | null)?.name ?? null,
    deliver_note: po.deliver_note,
    expected_by: po.expected_by,
    terms: po.terms,
    note: po.note,
    charges_amount: po.charges_amount,
    charges_gst_pct: po.charges_gst_pct,
    charges_note: po.charges_note,
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

/** From po_billing_totals (0025), the one money view between POs and Bills; its qual admits /purchase-orders and /bills, and a filtered row reads as "nothing billed yet". */
export async function getPoBilledTotals(poId: string): Promise<PoBilledTotals> {
  await requireTool("/purchase-orders");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("po_billing_totals")
    .select("ordered_total, billed_total, bill_count")
    .eq("po_id", poId)
    .maybeSingle();
  if (error) console.error("getPoBilledTotals failed:", error);

  // View columns are typed nullable: normalise once here.
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
  company: CompanyRow | null;
};

export async function getPoPdfData(poId: string): Promise<PoPdfData | null> {
  const po = await getPurchaseOrder(poId);
  if (!po) return null;

  const supabase = await createClient();
  const [{ data: vendor, error: vendorError }, company] = await Promise.all([
    supabase
      .from("vendors")
      .select("name, contact_name, mobile, gst_no, address")
      .eq("id", po.vendor_id)
      .maybeSingle(),
    getProjectCompany(po.project_id),
  ]);
  if (vendorError) {
    console.error("getPoPdfData vendor read failed:", vendorError);
    throw new Error("Could not read the vendor for this purchase order.", { cause: vendorError });
  }

  return {
    po,
    vendor: {
      name: vendor?.name ?? po.vendor_name,
      contact_name: vendor?.contact_name ?? null,
      mobile: vendor?.mobile ?? null,
      gst_no: vendor?.gst_no ?? null,
      address: vendor?.address ?? null,
    },
    company,
  };
}

/** Default first, which a new PO starts from. */
export async function getPoTermsTemplates(): Promise<TermsTemplate[]> {
  await requireTool("/purchase-orders");
  return listActiveTerms("po");
}

/** Drives the creator-or-admin delete and the admin-only approval; the database enforces both again. */
export async function getCurrentPoActor(): Promise<{ isAdmin: boolean; userId: string }> {
  const user = await requireTool("/purchase-orders");
  return { isAdmin: user.profile?.role === "admin", userId: user.id };
}

type Client = SupabaseClient<Database>;

async function itemNamesById(supabase: Client, ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const data = await fetchAll((from, to) =>
    supabase.from("items").select("id, name").in("id", unique).order("id").range(from, to),
  );
  return new Map(data.map((row) => [row.id, row.name]));
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

// Gated on the PO tool's own grant; the goods tables are read directly (open by design, no money), not through Inventory's queries.
export async function getPoReceipts(poId: string): Promise<PoReceiptRow[]> {
  await requireTool("/purchase-orders");
  const supabase = await createClient();

  const receipts = await fetchAll((from, to) =>
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
  if (receipts.length === 0) return [];

  const receiptIds = receipts.map((receipt) => receipt.id);
  const lines = await fetchAll((from, to) =>
    supabase
      .from("goods_receipt_lines")
      .select("receipt_id, item_id, quantity, uom")
      .in("receipt_id", receiptIds)
      .order("id")
      .range(from, to),
  );

  const [items, stores, plots, units, names] = await Promise.all([
    itemNamesById(
      supabase,
      lines.map((line) => line.item_id),
    ),
    labelsById(
      supabase,
      "stores",
      receipts.map((r) => r.store_id),
    ),
    labelsById(
      supabase,
      "plots",
      receipts.map((r) => r.plot_id),
    ),
    labelsById(
      supabase,
      "units",
      receipts.map((r) => r.unit_id),
    ),
    profileNames(
      supabase,
      receipts.map((r) => r.created_by),
    ),
  ]);

  const linesByReceipt = new Map<string, { item_name: string; quantity: number; uom: string }[]>();
  for (const line of lines) {
    const group = linesByReceipt.get(line.receipt_id) ?? [];
    group.push({
      item_name: items.get(line.item_id) ?? "—",
      quantity: line.quantity,
      uom: line.uom,
    });
    linesByReceipt.set(line.receipt_id, group);
  }

  return receipts.map((receipt) => ({
    id: receipt.id,
    reference: receipt.reference ?? "—",
    destination: describeDestination(receipt, stores, plots, units),
    challan_no: receipt.challan_no,
    received_at: receipt.received_at,
    received_by_name: receipt.created_by ? (names.get(receipt.created_by) ?? null) : null,
    lines: linesByReceipt.get(receipt.id) ?? [],
  }));
}

export async function getPoSummaries(
  ids: string[],
): Promise<{ id: string; reference: string; vendor_name: string }[]> {
  await requireTool("/purchase-orders");
  if (ids.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("purchase_orders")
    .select("id, reference, vendors(name)")
    .in("id", ids);
  if (error) {
    console.error("getPoSummaries failed:", error);
    throw new Error("Could not read the purchase orders.", { cause: error });
  }
  const byId = new Map(
    data.map((row) => [
      row.id,
      {
        id: row.id,
        reference: row.reference ?? "—",
        vendor_name: (row.vendors as { name: string } | null)?.name ?? "—",
      },
    ]),
  );
  return ids.flatMap((id) => byId.get(id) ?? []);
}
