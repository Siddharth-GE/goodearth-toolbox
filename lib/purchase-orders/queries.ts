import "server-only";

import { requireTool } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";

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
