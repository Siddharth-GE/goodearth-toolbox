import "server-only";

import { createClient } from "@/lib/supabase/server";
import { assertRead, readFailed } from "@/lib/supabase/read-failed";
import { listCompanies } from "./companies";
import type { VendorRow } from "./vendors";

// Money confinement: reads only the money-free po_facts and bill_facts, never base tables or an amount column.

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

export type VendorPaymentDetails = {
  bank_name: string | null;
  account_number: string | null;
  account_holder_name: string | null;
  ifsc: string | null;
};

/** One company's count of this contractor's bills (0164); lastNo 0 when nothing was typed. */
export type ContractorBillCount = {
  companyId: string;
  companyName: string;
  companyCode: string | null;
  lastNo: number;
  /** The toolbox has made a bill here, so only bills move the count now. */
  appNumbering: boolean;
};

export type VendorDetail = {
  vendor: VendorRow;
  updatedByName: string | null;
  /** RLS returns rows only to /masters, /purchase-orders and /bills; null otherwise looks like "no details entered", so decide visibility from the grant. */
  paymentDetails: VendorPaymentDetails | null;
  pos: VendorPoFact[];
  poTotal: number;
  bills: VendorBillFact[];
  billTotal: number;
  projectNames: Map<string, string>;
  /** Contractors only: every active company, and any other one a count was kept in. */
  billCounts: ContractorBillCount[];
};

const RELATED_LIMIT = 50;

export async function getVendorDetail(id: string): Promise<VendorDetail | null> {
  const supabase = await createClient();

  const { data: vendor, error: vendorError } = await supabase
    .from("vendors")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (vendorError) readFailed("Masters", "this vendor", vendorError);
  if (!vendor) return null;

  const [poRes, billRes, projectRes, paymentRes] = await Promise.all([
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
    supabase
      .from("vendor_payment_details")
      .select("bank_name, account_number, account_holder_name, ifsc")
      .eq("vendor_id", id)
      .maybeSingle(),
  ]);
  assertRead("Masters", "this vendor's purchase orders", poRes.error);
  assertRead("Masters", "this vendor's bills", billRes.error);
  assertRead("Masters", "the projects", projectRes.error);
  assertRead("Masters", "this vendor's payment details", paymentRes.error);

  const billCounts = vendor.is_contractor ? await contractorBillCounts(supabase, id) : [];

  let updatedByName: string | null = null;
  if (vendor.updated_by) {
    const { data: editor, error: editorError } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", vendor.updated_by)
      .maybeSingle();
    if (editorError) readFailed("Masters", "who last edited this vendor", editorError);
    updatedByName = editor?.full_name ?? null;
  }

  return {
    vendor: vendor as VendorRow,
    updatedByName,
    paymentDetails: (paymentRes.data as VendorPaymentDetails | null) ?? null,
    pos: (poRes.data ?? []) as VendorPoFact[],
    poTotal: poRes.count ?? 0,
    bills: (billRes.data ?? []) as VendorBillFact[],
    billTotal: billRes.count ?? 0,
    projectNames: new Map((projectRes.data ?? []).map((p) => [p.id, p.name])),
    billCounts,
  };
}

async function contractorBillCounts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  vendorId: string,
): Promise<ContractorBillCount[]> {
  const [companies, countRes] = await Promise.all([
    listCompanies(),
    supabase
      .from("contractor_bill_numbers")
      .select("company_id, last_no, app_numbering")
      .eq("vendor_id", vendorId),
  ]);
  assertRead("Masters", "this contractor's bill numbers", countRes.error);
  const counts = new Map((countRes.data ?? []).map((row) => [row.company_id, row]));
  return companies
    .filter((company) => company.is_active || counts.has(company.id))
    .map((company) => ({
      companyId: company.id,
      companyName: company.name,
      companyCode: company.code,
      lastNo: counts.get(company.id)?.last_no ?? 0,
      appNumbering: counts.get(company.id)?.app_numbering ?? false,
    }));
}
