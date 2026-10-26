import "server-only";

import { cache } from "react";

import { requireTool } from "@/lib/auth/access";
import { listPlots } from "@/lib/masters/plots";
import { listProjects } from "@/lib/masters/projects";
import { listUnits } from "@/lib/masters/units";
import { listVendors } from "@/lib/masters/vendors";
import type { Filterable } from "@/lib/list-params";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { assertRead } from "@/lib/supabase/read-failed";
import { createClient } from "@/lib/supabase/server";

import type { BillKind, BillStatus } from "./workflow";

// Reads masters and the money-free PO views directly under the /bills grant, never another tool's queries. Bill money lives on the bills table, whose RLS needs this grant.

const BILL_LIST_LIMIT = 50;

export type BillListRow = {
  id: string;
  reference: string;
  status: BillStatus;
  kind: BillKind;
  invoice_no: string;
  invoice_date: string;
  total_amount: number;
  created_at: string;
  project_name: string;
  /** Null on a directly-paid NMR bill — there is no vendor. */
  vendor_name: string | null;
};

export type BillListPage = {
  bills: BillListRow[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  /** Over EVERY bill the filters match, not just this page. */
  sums: { taxable: number; gst: number; total: number };
};

export async function getWelcomeCounts() {
  await requireTool("/bills");
  const supabase = await createClient();

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const since = startOfMonth.toISOString();

  const [recorded, unpaid, paid] = await Promise.all([
    supabase.from("bills").select("id", { count: "exact", head: true }).eq("status", "recorded"),
    supabase.from("bills").select("id", { count: "exact", head: true }).neq("status", "paid"),
    supabase
      .from("bills")
      .select("id", { count: "exact", head: true })
      .eq("status", "paid")
      .gte("paid_at", since),
  ]);

  assertRead("bills", "the welcome counts", recorded.error ?? unpaid.error ?? paid.error);

  return {
    awaitingApproval: recorded.count ?? 0,
    unpaid: unpaid.count ?? 0,
    paidThisMonth: paid.count ?? 0,
  };
}

export type BillListFilters = {
  page?: number;
  status?: BillStatus;
  /** The Unpaid view: everything not yet paid (recorded + approved). */
  unpaid?: boolean;
  vendorId?: string;
  projectId?: string;
  q?: string;
  from?: string;
  to?: string;
};

export async function listBills({
  page = 1,
  status,
  unpaid,
  vendorId,
  projectId,
  q,
  from,
  to,
}: BillListFilters = {}): Promise<BillListPage> {
  await requireTool("/bills");
  const supabase = await createClient();

  const pageSize = BILL_LIST_LIMIT;
  const currentPage = Math.max(1, page);

  // A vendor-name search becomes vendor ids, so one or() covers number, invoice and vendor.
  let vendorIdsForSearch: string[] = [];
  if (q) {
    const { data: matched, error: vendorError } = await supabase
      .from("vendors")
      .select("id")
      .ilike("name", `%${q}%`)
      .limit(200);
    if (vendorError) {
      console.error("listBills vendor search failed:", vendorError);
      throw new Error("Could not search bills.", { cause: vendorError });
    }
    vendorIdsForSearch = (matched ?? []).map((row) => row.id);
  }

  const filtered = <T extends Filterable<T>>(query: T): T => {
    let next = query;
    if (status) next = next.eq("status", status);
    if (unpaid) next = next.neq("status", "paid");
    if (vendorId) next = next.eq("vendor_id", vendorId);
    if (projectId) next = next.eq("project_id", projectId);
    if (from) next = next.gte("invoice_date", from);
    if (to) next = next.lte("invoice_date", to);
    if (q) {
      const clauses = [`reference.ilike.*${q}*`, `invoice_no.ilike.*${q}*`];
      if (vendorIdsForSearch.length) clauses.push(`vendor_id.in.(${vendorIdsForSearch.join(",")})`);
      next = next.or(clauses.join(","));
    }
    return next;
  };

  const [{ data, count, error }, sumRows] = await Promise.all([
    filtered(
      supabase
        .from("bills")
        .select(
          "id, reference, status, kind, invoice_no, invoice_date, total_amount, created_at, projects(name), vendors(name)",
          { count: "exact" },
        ),
    )
      .order("created_at", { ascending: false })
      .order("id")
      .range((currentPage - 1) * pageSize, currentPage * pageSize - 1),
    fetchAll<{ taxable_amount: number; gst_amount: number; total_amount: number }>(
      (rangeFrom, rangeTo) =>
        filtered(supabase.from("bills").select("taxable_amount, gst_amount, total_amount"))
          .order("id")
          .range(rangeFrom, rangeTo),
    ),
  ]);
  // A failed read is an error screen, never an empty list.
  if (error) {
    console.error("listBills failed:", error);
    throw new Error("Could not read the bills.", { cause: error });
  }

  const sums = sumRows.reduce(
    (acc, row) => ({
      taxable: acc.taxable + Number(row.taxable_amount ?? 0),
      gst: acc.gst + Number(row.gst_amount ?? 0),
      total: acc.total + Number(row.total_amount ?? 0),
    }),
    { taxable: 0, gst: 0, total: 0 },
  );

  const total = count ?? 0;
  return {
    bills: data.map((row) => ({
      id: row.id,
      reference: row.reference ?? "—",
      status: row.status as BillStatus,
      kind: row.kind as BillKind,
      invoice_no: row.invoice_no ?? "—",
      invoice_date: row.invoice_date,
      total_amount: row.total_amount ?? 0,
      created_at: row.created_at,
      project_name: (row.projects as { name: string } | null)?.name ?? "—",
      vendor_name: (row.vendors as { name: string } | null)?.name ?? null,
    })),
    total,
    page: currentPage,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    pageSize,
    sums,
  };
}

export async function getBillFilterOptions(): Promise<{
  vendors: { id: string; name: string }[];
  projects: { id: string; name: string }[];
}> {
  await requireTool("/bills");
  const [vendors, projects] = await Promise.all([listVendors(), listProjects()]);
  return {
    vendors: vendors.map(({ id, name }) => ({ id, name })),
    projects: projects.map(({ id, name }) => ({ id, name })),
  };
}

export type BillDetail = {
  id: string;
  reference: string;
  status: BillStatus;
  /** The villa the bill is for, as a unit, for Budget against actual (0136); null for a general bill. */
  villa_unit_id: string | null;
  kind: BillKind;
  project_id: string;
  project_name: string;
  scope_name: string | null;
  scope_code: string;
  vendor_id: string | null;
  vendor_name: string | null;
  /** CON/012 for a contractor (0156). */
  vendor_contractor_no: string | null;
  /** This bill's place in its vendor's own run of bills: their 4th is 4 (0156). */
  vendor_seq: number | null;
  po_id: string | null;
  po_reference: string | null;
  labour_contract_id: string | null;
  contract_description: string | null;
  contract_reference: string | null;
  invoice_no: string;
  invoice_date: string;
  taxable_amount: number;
  gst_amount: number;
  total_amount: number;
  /** 0106: an NMR bill's total differs from its lines, and why. */
  total_override_note: string | null;
  /** 0133: freight, loading and the like, at their own GST %. */
  charges_amount: number | null;
  charges_gst_pct: number | null;
  charges_note: string | null;
  note: string | null;
  rejection_note: string | null;
  payment_ref: string | null;
  created_by: string | null;
  created_at: string;
  approved_at: string | null;
  paid_at: string | null;
  created_by_name: string | null;
  approved_by_name: string | null;
  paid_by_name: string | null;
};

export const getBill = cache(async (billId: string): Promise<BillDetail | null> => {
  await requireTool("/bills");
  const supabase = await createClient();

  const { data: bill, error: billError } = await supabase
    .from("bills")
    .select(
      "id, reference, status, kind, project_id, plot_id, unit_id, vendor_id, scope_code, po_id, labour_contract_id, invoice_no, invoice_date, taxable_amount, gst_amount, total_amount, total_override_note, charges_amount, charges_gst_pct, charges_note, note, rejection_note, payment_ref, created_by, created_at, approved_by, approved_at, paid_by, paid_at, vendor_seq, projects(name), plots(name), units(name), vendors(name, contractor_no), labour_contracts(description, reference)",
    )
    .eq("id", billId)
    .maybeSingle();
  if (billError) {
    console.error("getBill failed:", billError);
    throw new Error("Could not read the bill.", { cause: billError });
  }
  if (!bill) return null;

  // PO reference from the money-free po_facts view, NOT an embed: a /bills-only user has no SELECT on the PO tables, so it would come back null.
  const [{ data: poFact }, { data: profiles }] = await Promise.all([
    bill.po_id
      ? supabase.from("po_facts").select("reference").eq("id", bill.po_id).maybeSingle()
      : Promise.resolve({ data: null }),
    // One profiles read, not embeds (several FKs to profiles).
    (async () => {
      const actorIds = [
        ...new Set(
          [bill.created_by, bill.approved_by, bill.paid_by].filter(
            (id): id is string => id != null,
          ),
        ),
      ];
      if (actorIds.length === 0) return { data: [] };
      return supabase.from("profiles").select("id, full_name").in("id", actorIds);
    })(),
  ]);
  const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name]));
  const nameOf = (id: string | null | undefined) => (id ? (names.get(id) ?? null) : null);

  // A plot's villa is its unit (1:1 since 0029): the budget page is per unit.
  let villaUnitId = bill.unit_id;
  if (!villaUnitId && bill.plot_id) {
    const { data: unit, error: unitError } = await supabase
      .from("units")
      .select("id")
      .eq("plot_id", bill.plot_id)
      .limit(1)
      .maybeSingle();
    if (unitError) console.error("getBill villa lookup failed:", unitError);
    villaUnitId = unit?.id ?? null;
  }

  return {
    id: bill.id,
    reference: bill.reference ?? "—",
    status: bill.status as BillStatus,
    villa_unit_id: villaUnitId,
    kind: bill.kind as BillKind,
    project_id: bill.project_id,
    project_name: (bill.projects as { name: string } | null)?.name ?? "—",
    scope_name:
      (bill.units as { name: string } | null)?.name ??
      (bill.plots as { name: string } | null)?.name ??
      null,
    scope_code: bill.scope_code ?? "—",
    vendor_id: bill.vendor_id,
    vendor_name: (bill.vendors as { name: string } | null)?.name ?? null,
    vendor_contractor_no:
      (bill.vendors as { contractor_no: string | null } | null)?.contractor_no ?? null,
    vendor_seq: bill.vendor_seq,
    po_id: bill.po_id,
    po_reference: poFact?.reference ?? null,
    labour_contract_id: bill.labour_contract_id,
    contract_description:
      (bill.labour_contracts as { description: string } | null)?.description ?? null,
    contract_reference:
      (bill.labour_contracts as { reference: string | null } | null)?.reference ?? null,
    invoice_no: bill.invoice_no ?? "—",
    invoice_date: bill.invoice_date,
    taxable_amount: bill.taxable_amount ?? 0,
    gst_amount: bill.gst_amount ?? 0,
    total_amount: bill.total_amount ?? 0,
    total_override_note: bill.total_override_note,
    charges_amount: bill.charges_amount,
    charges_gst_pct: bill.charges_gst_pct,
    charges_note: bill.charges_note,
    note: bill.note,
    rejection_note: bill.rejection_note,
    payment_ref: bill.payment_ref,
    created_by: bill.created_by,
    created_at: bill.created_at,
    approved_at: bill.approved_at,
    paid_at: bill.paid_at,
    created_by_name: nameOf(bill.created_by),
    approved_by_name: nameOf(bill.approved_by),
    paid_by_name: nameOf(bill.paid_by),
  };
});

/** Admins short-circuit (no limit applies, 0033). Approval can come from bill_approvers OR the role (0034), so this asks the database's own helpers, the ones bills_guard() calls, and button and trigger cannot drift. */
export async function getCurrentBillActor(): Promise<{
  isAdmin: boolean;
  isApprover: boolean;
  /** Null means unlimited — see exceedsApprovalLimit in workflow.ts. */
  approvalLimit: number | null;
  userId: string;
}> {
  const user = await requireTool("/bills");
  const isAdmin = user.profile?.role === "admin";
  if (isAdmin) {
    return { isAdmin: true, isApprover: true, approvalLimit: null, userId: user.id };
  }

  const supabase = await createClient();
  // bill_approval_cap returns null for both "unlimited" and "not an approver"; can_approve_bills tells them apart.
  const [approver, cap] = await Promise.all([
    supabase.rpc("can_approve_bills", { uid: user.id }),
    supabase.rpc("bill_approval_cap", { uid: user.id }),
  ]);

  // Fail closed: a missing button is recoverable (an admin approves),
  // a button that dies on click is not.
  if (approver.error) {
    console.error("getCurrentBillActor can_approve_bills failed:", approver.error);
    return { isAdmin: false, isApprover: false, approvalLimit: null, userId: user.id };
  }
  if (cap.error) {
    console.error("getCurrentBillActor bill_approval_cap failed:", cap.error);
    return { isAdmin: false, isApprover: false, approvalLimit: null, userId: user.id };
  }

  return {
    isAdmin: false,
    isApprover: approver.data === true,
    approvalLimit: cap.data ?? null,
    userId: user.id,
  };
}

export type BillVendorOption = { id: string; name: string };

export type BillAnchorPo = {
  id: string;
  vendor_id: string;
  reference: string;
  project_name: string;
  ordered_total: number;
  billed_total: number;
};

export type BillAnchorContract = {
  id: string;
  vendor_id: string;
  reference: string | null;
  description: string;
  project_name: string;
  scope_name: string;
  contract_value: number;
  billed_total: number;
};

export type BillScopedOption = {
  id: string;
  project_id: string;
  name: string;
  code: string | null;
};

export type BillFormOptions = {
  vendors: BillVendorOption[];
  pos: BillAnchorPo[];
  contracts: BillAnchorContract[];
  projects: { id: string; name: string; code: string | null }[];
  plots: BillScopedOption[];
  units: (BillScopedOption & { plot_id: string | null })[];
};

// Summed per labour contract; cache()d so one request never pages the bills table twice.
export const billedByContractTotals = cache(async function billedByContractTotals() {
  const supabase = await createClient();
  const data = await fetchAll((from, to) =>
    supabase
      .from("bills")
      .select("labour_contract_id, total_amount")
      .not("labour_contract_id", "is", null)
      .order("id")
      .range(from, to),
  );

  const totals = new Map<string, number>();
  for (const row of data) {
    if (!row.labour_contract_id) continue;
    totals.set(
      row.labour_contract_id,
      (totals.get(row.labour_contract_id) ?? 0) + (row.total_amount ?? 0),
    );
  }
  return totals;
});

/** Just the four masters lists the contract dialog needs, not the PO totals getBillFormOptions loads. */
export async function getContractFormOptions() {
  await requireTool("/bills");
  const [vendors, projects, plots, units] = await Promise.all([
    listVendors(),
    listProjects(),
    listPlots(),
    listUnits(),
  ]);
  return {
    vendors: vendors.map(({ id, name }) => ({ id, name })),
    projects: projects.map(({ id, name, code }) => ({ id, name, code })),
    plots: plots.map(({ id, project_id, name, code }) => ({ id, project_id, name, code })),
    units: units.map(({ id, project_id, plot_id, name, code }) => ({
      id,
      project_id,
      plot_id,
      name,
      code,
    })),
  };
}

/** Billable POs (issued or completed) from the money-free po_facts with totals from po_billing_totals; APPROVED active contracts carry what is billed, so the over-billing warning works client-side. */
export async function getBillFormOptions(): Promise<BillFormOptions> {
  await requireTool("/bills");
  const supabase = await createClient();

  const [vendors, projects, plots, units, contracts, poRows, totalRows, billedByContract] =
    await Promise.all([
      listVendors(),
      listProjects(),
      listPlots(),
      listUnits(),
      // Only approved, active contracts take bills (create_bill guards it too).
      fetchAll((from, to) =>
        supabase
          .from("labour_contracts")
          .select(
            "id, reference, vendor_id, project_id, plot_id, unit_id, description, contract_value",
          )
          .eq("status", "approved")
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .order("id")
          .range(from, to),
      ),
      // fetchAll: a capped read would hide a real PO or under-count what is billed.
      fetchAll((from, to) =>
        supabase
          .from("po_facts")
          .select("id, vendor_id, project_id, reference, status")
          .in("status", ["issued", "completed"])
          .order("created_at", { ascending: false })
          .order("id")
          .range(from, to),
      ),
      fetchAll((from, to) =>
        supabase
          .from("po_billing_totals")
          .select("po_id, ordered_total, billed_total")
          .order("po_id")
          .range(from, to),
      ),
      billedByContractTotals(),
    ]);

  const projectNames = new Map(projects.map((p) => [p.id, p.name]));
  const unitNames = new Map(units.map((u) => [u.id, u.name]));
  const plotNames = new Map(plots.map((p) => [p.id, p.name]));
  const projectName = (id: string | null) => (id ? (projectNames.get(id) ?? "—") : "—");

  // View columns are all nullable: normalise once here.
  const totalsByPo = new Map(
    totalRows.map((row) => [
      row.po_id ?? "",
      { ordered: row.ordered_total ?? 0, billed: row.billed_total ?? 0 },
    ]),
  );

  return {
    // A retired vendor still takes bills on its open POs and contracts; it is only left out of new choices.
    vendors: vendors
      .filter(
        (vendor) =>
          vendor.is_active ||
          poRows.some((row) => row.vendor_id === vendor.id) ||
          contracts.some((contract) => contract.vendor_id === vendor.id),
      )
      .map(({ id, name }) => ({ id, name })),
    pos: poRows.map((row) => ({
      id: row.id ?? "",
      vendor_id: row.vendor_id ?? "",
      reference: row.reference ?? "—",
      project_name: projectName(row.project_id),
      ordered_total: totalsByPo.get(row.id ?? "")?.ordered ?? 0,
      billed_total: totalsByPo.get(row.id ?? "")?.billed ?? 0,
    })),
    contracts: contracts.map((contract) => ({
      id: contract.id,
      vendor_id: contract.vendor_id,
      reference: contract.reference,
      description: contract.description,
      project_name: projectName(contract.project_id),
      scope_name: contract.unit_id
        ? (unitNames.get(contract.unit_id) ?? "—")
        : contract.plot_id
          ? (plotNames.get(contract.plot_id) ?? "—")
          : "General",
      contract_value: contract.contract_value,
      billed_total: billedByContract.get(contract.id) ?? 0,
    })),
    projects: projects.map(({ id, name, code }) => ({ id, name, code })),
    plots: plots.map(({ id, project_id, name, code }) => ({ id, project_id, name, code })),
    units: units.map(({ id, project_id, plot_id, name, code }) => ({
      id,
      project_id,
      plot_id,
      name,
      code,
    })),
  };
}
