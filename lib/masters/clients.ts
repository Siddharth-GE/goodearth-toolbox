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
  updated_at: string | null;
  updated_by: string | null;
};

export async function listClients(): Promise<ClientRow[]> {
  const supabase = await createClient();
  const data = await fetchAll((from, to) =>
    supabase.from("clients").select("*").order("name").order("id").range(from, to),
  );
  return data as ClientRow[];
}

const CLIENTS_PAGE_SIZE = 50;

export type ClientFilters = {
  search?: string;
  status?: string;
  page?: number;
};

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
