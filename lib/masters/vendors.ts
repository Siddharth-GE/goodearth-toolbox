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

export const VENDORS_PAGE_SIZE = 50;

export type VendorFilters = {
  search?: string;
  /** "active" | "inactive" | undefined (all) */
  status?: string;
  page?: number;
};

/** One page for the masters table screen; listVendors stays the complete read. */
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
      if (search) {
        query = query.or(
          `name.ilike.%${search}%,contact_name.ilike.%${search}%,gst_no.ilike.%${search}%`,
        );
      }
      return query;
    },
    filters.page ?? 1,
    VENDORS_PAGE_SIZE,
  );
}
