import "server-only";

import { cache } from "react";

import { requireTool } from "@/lib/auth/access";
import { listPlots } from "@/lib/masters/plots";
import { listProjects } from "@/lib/masters/projects";
import { listUnits } from "@/lib/masters/units";
import { listVendors } from "@/lib/masters/vendors";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";

import type { BillKind, BillStatus, ContractStatus } from "./workflow";

// Bills reads the masters tables and the money-free PO views DIRECTLY,
// under its own /bills grant — never another tool's gated queries
// module (the lib/purchase-orders/queries.ts rule). Bill money lives on
// the bills table and its RLS requires this tool's grant to SELECT.

export const BILL_LIST_LIMIT = 50;

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
};

export async function listBills({
  page = 1,
  status,
  unpaid,
  vendorId,
  projectId,
}: {
  page?: number;
  status?: BillStatus;
  /** The Unpaid view: everything not yet paid (recorded + approved). */
  unpaid?: boolean;
  vendorId?: string;
  projectId?: string;
} = {}): Promise<BillListPage> {
  await requireTool("/bills");
  const supabase = await createClient();

  const pageSize = BILL_LIST_LIMIT;
  const currentPage = Math.max(1, page);

  // A stated limit with an exact database count — the total is never
  // derived from the rows that happened to arrive.
  let query = supabase
    .from("bills")
    .select(
      "id, reference, status, kind, invoice_no, invoice_date, total_amount, created_at, projects(name), vendors(name)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .order("id")
    .range((currentPage - 1) * pageSize, currentPage * pageSize - 1);
  if (status) query = query.eq("status", status);
  if (unpaid) query = query.neq("status", "paid");
  if (vendorId) query = query.eq("vendor_id", vendorId);
  if (projectId) query = query.eq("project_id", projectId);

  const { data, count, error } = await query;
  if (error) {
    console.error("listBills failed:", error);
    return { bills: [], total: 0, page: currentPage, pageCount: 1, pageSize };
  }

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
  };
}

/** The list page's filter dropdowns — every vendor and project by
 * name. Light on purpose; the record form's options bag is the heavy
 * one. */
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

/* ------------------------------------------------------------------ *
 * One bill, in full
 * ------------------------------------------------------------------ */

export type BillDetail = {
  id: string;
  reference: string;
  status: BillStatus;
  kind: BillKind;
  project_name: string;
  /** The plot/unit the bill's anchor is for, or null for General. */
  scope_name: string | null;
  scope_code: string;
  /** Null on a directly-paid NMR bill — there is no vendor. */
  vendor_name: string | null;
  po_id: string | null;
  po_reference: string | null;
  labour_contract_id: string | null;
  contract_description: string | null;
  invoice_no: string;
  invoice_date: string;
  taxable_amount: number;
  gst_amount: number;
  total_amount: number;
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

  const { data: bill } = await supabase
    .from("bills")
    .select(
      "id, reference, status, kind, scope_code, po_id, labour_contract_id, invoice_no, invoice_date, taxable_amount, gst_amount, total_amount, note, rejection_note, payment_ref, created_by, created_at, approved_by, approved_at, paid_by, paid_at, projects(name), plots(name), units(name), vendors(name), labour_contracts(description)",
    )
    .eq("id", billId)
    .maybeSingle();
  if (!bill) return null;

  // The PO reference comes from the money-free po_facts view, NOT an
  // embedded purchase_orders join: a /bills-only user has no SELECT on
  // the PO tables, so the embed would silently come back null for
  // exactly the people this tool is for.
  const [{ data: poFact }, { data: profiles }] = await Promise.all([
    bill.po_id
      ? supabase.from("po_facts").select("reference").eq("id", bill.po_id).maybeSingle()
      : Promise.resolve({ data: null }),
    // One profiles read resolves every actor on the document — simpler
    // and safer than three embedded joins on a table with several FKs
    // to profiles (Supabase would need each constraint named).
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

  return {
    id: bill.id,
    reference: bill.reference ?? "—",
    status: bill.status as BillStatus,
    kind: bill.kind as BillKind,
    project_name: (bill.projects as { name: string } | null)?.name ?? "—",
    scope_name:
      (bill.units as { name: string } | null)?.name ??
      (bill.plots as { name: string } | null)?.name ??
      null,
    scope_code: bill.scope_code ?? "—",
    vendor_name: (bill.vendors as { name: string } | null)?.name ?? null,
    po_id: bill.po_id,
    po_reference: poFact?.reference ?? null,
    labour_contract_id: bill.labour_contract_id,
    contract_description:
      (bill.labour_contracts as { description: string } | null)?.description ?? null,
    invoice_no: bill.invoice_no ?? "—",
    invoice_date: bill.invoice_date,
    taxable_amount: bill.taxable_amount ?? 0,
    gst_amount: bill.gst_amount ?? 0,
    total_amount: bill.total_amount ?? 0,
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

/**
 * Whether the current user may decide bills, plus their id for the
 * recorder-ownership delete rule. Admins short-circuit — has_app() and
 * the guard both treat them as approvers, and no limit applies to them
 * (0033).
 *
 * The right can come from being named on `bill_approvers` OR from the
 * person's role (0034), so this asks the database's own helpers rather
 * than reading either source directly — they are the same functions
 * `bills_guard()` calls, so the button and the trigger cannot drift
 * apart. Reading `bill_approvers` alone was the bug: a role that
 * granted bill approval was honoured by the database but never showed
 * anyone a button.
 */
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
  // Both are needed: bill_approval_cap returns null for "unlimited" AND
  // for "not an approver at all", so can_approve_bills is what tells
  // those two apart.
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

/* ------------------------------------------------------------------ *
 * The record-a-bill form
 * ------------------------------------------------------------------ */

export type BillVendorOption = { id: string; name: string };

export type BillAnchorPo = {
  id: string;
  vendor_id: string;
  reference: string;
  project_name: string;
  /** Full-precision PO value (lines × rate + GST) from po_billing_totals. */
  ordered_total: number;
  /** Sum of every bill already recorded against this PO, any status. */
  billed_total: number;
};

export type BillAnchorContract = {
  id: string;
  vendor_id: string;
  description: string;
  project_name: string;
  /** The plot/unit the contract is for, or "General". */
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
  /** For the NMR branch: the scope is picked directly, like a PO's. */
  projects: { id: string; name: string; code: string | null }[];
  plots: BillScopedOption[];
  units: (BillScopedOption & { plot_id: string | null })[];
};

// What's been billed against each labour contract, summed. Shared by
// the record form and the contracts list — cache()d so a page calling
// both never pages the bills table twice in one request.
const billedByContractTotals = cache(async function billedByContractTotals() {
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

/**
 * The masters lists the contract dialog's pickers need — and nothing
 * else. The contracts page used to load getBillFormOptions for these
 * four lists and paid for every PO and billing total in the database
 * along the way.
 */
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

/**
 * Everything the record form needs, in one gated call: every vendor,
 * their billable POs (issued or completed — from the money-free
 * po_facts, with totals from the po_billing_totals window), their
 * APPROVED active labour contracts (each carrying what's already been
 * billed so the over-billing warning can be derived client-side), and
 * the project/plot/unit lists the NMR branch picks its scope from.
 */
export async function getBillFormOptions(): Promise<BillFormOptions> {
  await requireTool("/bills");
  const supabase = await createClient();

  const [vendors, projects, plots, units, contracts, poRows, totalRows, billedByContract] =
    await Promise.all([
      listVendors(),
      listProjects(),
      listPlots(),
      listUnits(),
      // Only approved, active contracts take bills (guarded DB-side in
      // create_bill too — this filter is the courtesy).
      fetchAll((from, to) =>
        supabase
          .from("labour_contracts")
          .select("id, vendor_id, project_id, plot_id, unit_id, description, contract_value")
          .eq("status", "approved")
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .order("id")
          .range(from, to),
      ),
      // fetchAll throughout: these promise completeness — a capped read
      // would silently hide a real PO or under-count what's billed.
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

  // Map lookups, not per-row .find() — with every PO and contract in
  // the list, the linear scans were quadratic in practice.
  const projectNames = new Map(projects.map((p) => [p.id, p.name]));
  const unitNames = new Map(units.map((u) => [u.id, u.name]));
  const plotNames = new Map(plots.map((p) => [p.id, p.name]));
  const projectName = (id: string | null) => (id ? (projectNames.get(id) ?? "—") : "—");

  // Every view column comes back nullable from the type generator, so
  // the shapes are normalised once here (the inventory queries rule).
  const totalsByPo = new Map(
    totalRows.map((row) => [
      row.po_id ?? "",
      { ordered: row.ordered_total ?? 0, billed: row.billed_total ?? 0 },
    ]),
  );

  return {
    vendors: vendors.map(({ id, name }) => ({ id, name })),
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

/* ------------------------------------------------------------------ *
 * Labour contracts — the Bills tool's own list
 * ------------------------------------------------------------------ */

export type BillContractRow = {
  id: string;
  vendor_id: string;
  vendor_name: string;
  project_id: string;
  project_name: string;
  plot_id: string | null;
  unit_id: string | null;
  /** The plot/unit the contract is for, or "General". */
  scope_name: string;
  description: string;
  contract_value: number;
  status: ContractStatus;
  is_active: boolean;
  billed_total: number;
  approved_by_name: string | null;
  created_at: string;
};

/** Every labour contract, newest first, with what's been billed
 * against each — the /bills/contracts page. */
export async function listBillContracts(): Promise<BillContractRow[]> {
  await requireTool("/bills");
  const supabase = await createClient();

  const [contracts, billedByContract] = await Promise.all([
    fetchAll((from, to) =>
      supabase
        .from("labour_contracts")
        .select(
          "id, vendor_id, project_id, plot_id, unit_id, description, contract_value, status, is_active, approved_by, created_at, vendors(name), projects(name), plots(name), units(name)",
        )
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to),
    ),
    billedByContractTotals(),
  ]);

  const approverIds = [
    ...new Set(contracts.map((c) => c.approved_by).filter((id): id is string => id != null)),
  ];
  const { data: profiles } = approverIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", approverIds)
    : { data: [] };
  const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name]));

  return contracts.map((contract) => ({
    id: contract.id,
    vendor_id: contract.vendor_id,
    vendor_name: (contract.vendors as { name: string } | null)?.name ?? "—",
    project_id: contract.project_id,
    project_name: (contract.projects as { name: string } | null)?.name ?? "—",
    plot_id: contract.plot_id,
    unit_id: contract.unit_id,
    scope_name:
      (contract.units as { name: string } | null)?.name ??
      (contract.plots as { name: string } | null)?.name ??
      "General",
    description: contract.description,
    contract_value: contract.contract_value,
    status: contract.status as ContractStatus,
    is_active: contract.is_active,
    billed_total: billedByContract.get(contract.id) ?? 0,
    approved_by_name: contract.approved_by ? (names.get(contract.approved_by) ?? null) : null,
    created_at: contract.created_at,
  }));
}
