import "server-only";

import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";

export type VendorRow = {
  id: string;
  name: string;
  contact_name: string | null;
  mobile: string | null;
  gst_no: string | null;
  address: string | null;
  is_active: boolean;
  created_at: string;
};

// fetchAll for the same reason as listUnits: this promises the complete
// vendor list, and vendors will matter even more once POs and Bills key
// off them — a capped read would silently hide real vendors.
export async function listVendors(activeOnly = false): Promise<VendorRow[]> {
  const supabase = await createClient();
  const { data } = await fetchAll((from, to) => {
    let query = supabase.from("vendors").select("*").order("name").order("id").range(from, to);
    if (activeOnly) query = query.eq("is_active", true);
    return query;
  });
  return (data ?? []) as VendorRow[];
}
