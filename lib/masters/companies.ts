import "server-only";

import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";

/** Documents take their project's company; nobody picks one on a document. Reads are open: name, address and GSTIN go out on paper anyway. */
export type CompanyRow = {
  id: string;
  name: string;
  legal_name: string | null;
  address: string | null;
  gstin: string | null;
  pan: string | null;
  /** Udyam registration, e.g. UDYAM-KR-03-0539542. */
  msme_number: string | null;
  /** Compared with each vendor's GST state: same means CGST + SGST, else IGST. */
  state: string;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  created_at: string;
};

const COMPANY_COLUMNS =
  "id, name, legal_name, address, gstin, pan, msme_number, state, phone, email, is_active, created_at";

export async function listCompanies(): Promise<CompanyRow[]> {
  const supabase = await createClient();
  const data = await fetchAll((from, to) =>
    supabase.from("companies").select(COMPANY_COLUMNS).order("name").order("id").range(from, to),
  );
  return data as CompanyRow[];
}

/** Null while the project has none (placeholder letterhead). A switched-off company still prints. */
export async function getProjectCompany(projectId: string): Promise<CompanyRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .select(`company_id, companies(${COMPANY_COLUMNS})`)
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw error;
  return (data?.companies as CompanyRow | null | undefined) ?? null;
}
