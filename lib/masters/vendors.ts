import "server-only";

import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import { cleanSearch, pagedList, type PagedResult } from "./paged";

export type VendorRow = {
  id: string;
  name: string;
  contact_name: string | null;
  mobile: string | null;
  gst_no: string | null;
  address: string | null;
  email: string | null;
  contact_designation: string | null;
  gst_state: string | null;
  payment_term_days: number | null;
  is_active: boolean;
  /** 0073: contractors are vendors; the flag only filters. */
  is_contractor: boolean;
  /** CON/012, given by the database once a vendor is a contractor and kept for good (0156). */
  contractor_no: string | null;
  created_at: string;
  updated_at: string | null;
  updated_by: string | null;
};

// fetchAll: a capped read would silently hide real vendors.
export async function listVendors(activeOnly = false): Promise<VendorRow[]> {
  const supabase = await createClient();
  const data = await fetchAll((from, to) => {
    let query = supabase.from("vendors").select("*").order("name").order("id").range(from, to);
    if (activeOnly) query = query.eq("is_active", true);
    return query;
  });
  return data as VendorRow[];
}

const VENDORS_PAGE_SIZE = 50;

export type VendorFilters = {
  search?: string;
  status?: string;
  type?: string;
  page?: number;
};

export async function listVendorsPage(
  filters: VendorFilters = {},
): Promise<PagedResult<VendorRow>> {
  const supabase = await createClient();
  const search = cleanSearch(filters.search);

  return pagedList<VendorRow>(
    (page) => {
      let query = supabase
        .from("vendors")
        .select("*", { count: "exact" })
        .order("name")
        .order("id")
        .range((page - 1) * VENDORS_PAGE_SIZE, page * VENDORS_PAGE_SIZE - 1);
      if (filters.status === "active") query = query.eq("is_active", true);
      if (filters.status === "inactive") query = query.eq("is_active", false);
      if (filters.type === "contractor") query = query.eq("is_contractor", true);
      if (filters.type === "supplier") query = query.eq("is_contractor", false);
      if (search) {
        query = query.or(
          `name.ilike.%${search}%,contact_name.ilike.%${search}%,gst_no.ilike.%${search}%,contractor_no.ilike.%${search}%`,
        );
      }
      return query;
    },
    filters.page ?? 1,
    VENDORS_PAGE_SIZE,
  );
}
