import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { VendorRow } from "./vendors";

// Money confinement: this module reads ONLY the money-free fact views
// (po_facts, bill_facts) — never purchase_orders/bills base tables,
// never po_billing_totals, never an amount column. A /masters-only
// viewer sees this whole page; what a PO or bill is worth stays behind
// the /purchase-orders and /bills grants.

export type VendorPoFact = {
  id: string;
  reference: string;
  status: string;
  project_id: string;
  scope_code: string | null;
  expected_by: string | null;
  issued_at: string | null;
  created_at: string;
};

export type VendorBillFact = {
  id: string;
  reference: string;
  kind: string;
  status: string;
  project_id: string;
  invoice_date: string | null;
  created_at: string;
  paid_at: string | null;
};

export type VendorDetail = {
  vendor: VendorRow;
  /** Who last edited the vendor, when updated_by is stamped. */
  updatedByName: string | null;
  pos: VendorPoFact[];
  poTotal: number;
  bills: VendorBillFact[];
  billTotal: number;
  /** project id → name, covering every row above. */
  projectNames: Map<string, string>;
};

const RELATED_LIMIT = 50;

export async function getVendorDetail(id: string): Promise<VendorDetail | null> {
  const supabase = await createClient();

  const { data: vendor } = await supabase.from("vendors").select("*").eq("id", id).maybeSingle();
  if (!vendor) return null;

  const [poRes, billRes, projectRes] = await Promise.all([
    supabase
      .from("po_facts")
      .select("id, reference, status, project_id, scope_code, expected_by, issued_at, created_at", {
        count: "exact",
      })
      .eq("vendor_id", id)
      .order("created_at", { ascending: false })
      .limit(RELATED_LIMIT),
    supabase
      .from("bill_facts")
      .select("id, reference, kind, status, project_id, invoice_date, created_at, paid_at", {
        count: "exact",
      })
      .eq("vendor_id", id)
      .order("created_at", { ascending: false })
      .limit(RELATED_LIMIT),
    supabase.from("projects").select("id, name"),
  ]);

  let updatedByName: string | null = null;
  if (vendor.updated_by) {
    const { data: editor } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", vendor.updated_by)
      .maybeSingle();
    updatedByName = editor?.full_name ?? null;
  }

  return {
    vendor: vendor as VendorRow,
    updatedByName,
    pos: (poRes.data ?? []) as VendorPoFact[],
    poTotal: poRes.count ?? 0,
    bills: (billRes.data ?? []) as VendorBillFact[],
    billTotal: billRes.count ?? 0,
    projectNames: new Map((projectRes.data ?? []).map((p) => [p.id, p.name])),
  };
}
