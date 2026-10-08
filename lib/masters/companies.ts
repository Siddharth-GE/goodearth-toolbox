import "server-only";

import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";

/**
 * The companies documents are printed under (0101). Nobody picks one on a
 * document: a project belongs to a company, and every indent, PO, work
 * order and bill takes its project's. Reads are open to every signed-in
 * person — a company's name, address and GSTIN go out on paper anyway.
 */
export type CompanyRow = {
  id: string;
  name: string;
  legal_name: string | null;
  address: string | null;
  gstin: string | null;
  /** Compared with each vendor's GST state: same → CGST + SGST, else IGST. */
  state: string;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  created_at: string;
};

const COMPANY_COLUMNS =
  "id, name, legal_name, address, gstin, state, phone, email, is_active, created_at";

export async function listCompanies(): Promise<CompanyRow[]> {
  const supabase = await createClient();
  const data = await fetchAll((from, to) =>
    supabase.from("companies").select(COMPANY_COLUMNS).order("name").order("id").range(from, to),
  );
  return data as CompanyRow[];
}

/**
 * The company a project's documents carry, or null while the project has
 * none — the document then prints the placeholder letterhead. A switched-
 * off company still prints: the documents already made name it.
 */
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
