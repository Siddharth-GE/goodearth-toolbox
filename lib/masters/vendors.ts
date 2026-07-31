import "server-only";

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

export async function listVendors(activeOnly = false): Promise<VendorRow[]> {
  const supabase = await createClient();
  let query = supabase.from("vendors").select("*").order("name");
  if (activeOnly) query = query.eq("is_active", true);
  const { data } = await query;
  return (data ?? []) as VendorRow[];
}
