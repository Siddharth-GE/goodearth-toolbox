import "server-only";

import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import { cleanSearch, pagedList } from "./paged";

export type UnitType = "apartment" | "villa" | "duplex_row_house";
export type UnitStatus = "available" | "reserved" | "sold";

export type UnitRow = {
  id: string;
  project_id: string;
  plot_id: string;
  name: string;
  code: string | null;
  unit_type: UnitType;
  client_id: string | null;
  status: UnitStatus;
  created_at: string;
};

// fetchAll: seven callers depend on completeness; the table screen pages via listUnitsPage.
export async function listUnits(projectId?: string): Promise<UnitRow[]> {
  const supabase = await createClient();
  const data = await fetchAll((from, to) => {
    let query = supabase.from("units").select("*").order("name").order("id").range(from, to);
    if (projectId) query = query.eq("project_id", projectId);
    return query;
  });
  return data as UnitRow[];
}

const UNITS_LIST_LIMIT = 50;

export type UnitPage = {
  units: UnitRow[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
};

export type UnitPageFilters = {
  projectId?: string;
  search?: string;
  page?: number;
};

export async function listUnitsPage(filters: UnitPageFilters = {}): Promise<UnitPage> {
  const supabase = await createClient();
  const pageSize = UNITS_LIST_LIMIT;
  const search = cleanSearch(filters.search);

  const result = await pagedList<UnitRow>(
    (page) => {
      let query = supabase
        .from("units")
        .select("*", { count: "exact" })
        .order("name")
        .order("id")
        .range((page - 1) * pageSize, page * pageSize - 1);
      if (filters.projectId) query = query.eq("project_id", filters.projectId);
      if (search) query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%`);
      return query;
    },
    filters.page ?? 1,
    pageSize,
  );

  return {
    units: result.rows,
    total: result.total,
    page: result.page,
    pageCount: result.pageCount,
    pageSize: result.pageSize,
  };
}
