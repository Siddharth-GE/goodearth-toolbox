import "server-only";

import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import { cleanSearch, pagedList, type PagedResult } from "./paged";

export type ClientRow = {
  id: string;
  name: string;
  mobile: string | null;
  email: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
};

// fetchAll for consistency with the other masters reads: every list
// here promises completeness, so none of them get to silently cap.
export async function listClients(): Promise<ClientRow[]> {
  const supabase = await createClient();
  const { data } = await fetchAll((from, to) =>
    supabase.from("clients").select("*").order("name").order("id").range(from, to),
  );
  return (data ?? []) as ClientRow[];
}

export const CLIENTS_PAGE_SIZE = 50;

export type ClientFilters = {
  search?: string;
  /** "active" | "inactive" | undefined (all) */
  status?: string;
  page?: number;
};

/** One page for the masters table screen; listClients stays the complete read. */
export async function listClientsPage(
  filters: ClientFilters = {},
): Promise<PagedResult<ClientRow>> {
  const supabase = await createClient();
  const search = cleanSearch(filters.search);

  return pagedList<ClientRow>(
    (page) => {
      let query = supabase
        .from("clients")
        .select("*", { count: "exact" })
        .order("name")
        .order("id")
        .range((page - 1) * CLIENTS_PAGE_SIZE, page * CLIENTS_PAGE_SIZE - 1);
      if (filters.status === "active") query = query.eq("is_active", true);
      if (filters.status === "inactive") query = query.eq("is_active", false);
      if (search) query = query.or(`name.ilike.%${search}%,mobile.ilike.%${search}%`);
      return query;
    },
    filters.page ?? 1,
    CLIENTS_PAGE_SIZE,
  );
}
