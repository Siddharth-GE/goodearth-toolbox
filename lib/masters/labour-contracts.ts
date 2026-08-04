import "server-only";

import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";

export type LabourContractRow = {
  id: string;
  vendor_id: string;
  project_id: string;
  plot_id: string | null;
  unit_id: string | null;
  description: string;
  /** What the over-billing warning compares against — a counterparty fact, open by design. */
  contract_value: number;
  is_active: boolean;
  created_at: string;
};

// fetchAll for the same reason as listVendors: this promises the
// complete list — Bills' record form offers every active contract, and
// a capped read would silently hide real ones.
export async function listLabourContracts(activeOnly = false): Promise<LabourContractRow[]> {
  const supabase = await createClient();
  const { data } = await fetchAll((from, to) => {
    let query = supabase
      .from("labour_contracts")
      .select("*")
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to);
    if (activeOnly) query = query.eq("is_active", true);
    return query;
  });
  return (data ?? []) as LabourContractRow[];
}
