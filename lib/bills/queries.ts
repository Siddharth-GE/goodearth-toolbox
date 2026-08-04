import "server-only";

import { cache } from "react";

import { requireTool } from "@/lib/auth/access";
import { listLabourContracts } from "@/lib/masters/labour-contracts";
import { listPlots } from "@/lib/masters/plots";
import { listProjects } from "@/lib/masters/projects";
import { listUnits } from "@/lib/masters/units";
import { listVendors } from "@/lib/masters/vendors";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";

import type { BillStatus } from "./workflow";

// Bills reads the masters tables and the money-free PO views DIRECTLY,
// under its own /bills grant — never another tool's gated queries
// module (the lib/purchase-orders/queries.ts rule). Bill money lives on
// the bills table and its RLS requires this tool's grant to SELECT.

export const BILL_LIST_LIMIT = 50;

export type BillListRow = {
  id: string;
  reference: string;
  status: BillStatus;
  invoice_no: string;
  invoice_date: string;
  total_amount: number;
  created_at: string;
  project_name: string;
  vendor_name: string;
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
      "id, reference, status, invoice_no, invoice_date, total_amount, created_at, projects(name), vendors(name)",
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
    bills: (data ?? []).map((row) => ({
      id: row.id,
      reference: row.reference ?? "—",
      status: row.status as BillStatus,
      invoice_no: row.invoice_no ?? "—",
      invoice_date: row.invoice_date,
      total_amount: row.total_amount ?? 0,
      created_at: row.created_at,
      project_name: (row.projects as { name: string } | null)?.name ?? "—",
      vendor_name: (row.vendors as { name: string } | null)?.name ?? "—",
    })),
    total,
    page: currentPage,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    pageSize,
  };
}

/* ------------------------------------------------------------------ *
 * One bill, in full
 * ------------------------------------------------------------------ */

export type BillDetail = {
  id: string;
  reference: string;
  status: BillStatus;
  project_name: string;
  /** The plot/unit the bill's anchor is for, or null for General. */
  scope_name: string | null;
  scope_code: string;
  vendor_name: string;
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
      "id, reference, status, scope_code, po_id, labour_contract_id, invoice_no, invoice_date, taxable_amount, gst_amount, total_amount, note, rejection_note, payment_ref, created_by, created_at, approved_by, approved_at, paid_by, paid_at, projects(name), plots(name), units(name), vendors(name), labour_contracts(description)",
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
    project_name: (bill.projects as { name: string } | null)?.name ?? "—",
    scope_name:
      (bill.units as { name: string } | null)?.name ??
      (bill.plots as { name: string } | null)?.name ??
      null,
    scope_code: bill.scope_code ?? "—",
    vendor_name: (bill.vendors as { name: string } | null)?.name ?? "—",
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

/** Whether the current user may decide bills, plus their id for the
 * recorder-ownership delete rule. Admins short-circuit — has_app() and
 * the guard both treat them as approvers. */
export async function getCurrentBillActor(): Promise<{
  isAdmin: boolean;
  isApprover: boolean;
  userId: string;
}> {
  const user = await requireTool("/bills");
  const isAdmin = user.profile?.role === "admin";
  if (isAdmin) return { isAdmin: true, isApprover: true, userId: user.id };

  const supabase = await createClient();
  const { data } = await supabase
    .from("bill_approvers")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  return { isAdmin: false, isApprover: data != null, userId: user.id };
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

export type BillFormOptions = {
  vendors: BillVendorOption[];
  pos: BillAnchorPo[];
  contracts: BillAnchorContract[];
};

/**
 * Everything the record form needs, in one gated call: every vendor,
 * their billable POs (issued or completed — from the money-free
 * po_facts, with totals from the po_billing_totals window) and their
 * active labour contracts, each carrying what's already been billed so
 * the over-billing warning can be derived client-side.
 */
export async function getBillFormOptions(): Promise<BillFormOptions> {
  await requireTool("/bills");
  const supabase = await createClient();

  const [vendors, projects, plots, units, contracts, posResult, totalsResult, contractBills] =
    await Promise.all([
      listVendors(),
      listProjects(),
      listPlots(),
      listUnits(),
      listLabourContracts(true),
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
      fetchAll((from, to) =>
        supabase
          .from("bills")
          .select("labour_contract_id, total_amount")
          .not("labour_contract_id", "is", null)
          .order("id")
          .range(from, to),
      ),
    ]);

  const projectName = (id: string | null) =>
    id ? (projects.find((p) => p.id === id)?.name ?? "—") : "—";

  // Every view column comes back nullable from the type generator, so
  // the shapes are normalised once here (the inventory queries rule).
  const totalsByPo = new Map(
    (totalsResult.data ?? []).map((row) => [
      row.po_id ?? "",
      { ordered: row.ordered_total ?? 0, billed: row.billed_total ?? 0 },
    ]),
  );

  const billedByContract = new Map<string, number>();
  for (const row of contractBills.data ?? []) {
    if (!row.labour_contract_id) continue;
    billedByContract.set(
      row.labour_contract_id,
      (billedByContract.get(row.labour_contract_id) ?? 0) + (row.total_amount ?? 0),
    );
  }

  return {
    vendors: vendors.map(({ id, name }) => ({ id, name })),
    pos: (posResult.data ?? []).map((row) => ({
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
        ? (units.find((u) => u.id === contract.unit_id)?.name ?? "—")
        : contract.plot_id
          ? (plots.find((p) => p.id === contract.plot_id)?.name ?? "—")
          : "General",
      contract_value: contract.contract_value,
      billed_total: billedByContract.get(contract.id) ?? 0,
    })),
  };
}
