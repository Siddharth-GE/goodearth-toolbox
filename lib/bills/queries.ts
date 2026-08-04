import "server-only";

import { requireTool } from "@/lib/auth/access";
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
