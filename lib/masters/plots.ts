import "server-only";

import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import { cleanSearch, pagedList, type PagedResult } from "./paged";

export type PlotStatus = "available" | "reserved" | "sold";

export type PlotRow = {
  id: string;
  project_id: string;
  name: string;
  /** Short code for PO numbers (PO/SAA/<code>/001) — null until set. */
  code: string | null;
  area: number | null;
  status: PlotStatus;
  created_at: string;
};

// fetchAll like listUnits/listVendors: this promises the complete plot
// list, and it feeds the PO, Bill and Indent forms — the first master
// likely to cross PostgREST's silent 1,000-row cap as real data lands.
export async function listPlots(projectId?: string): Promise<PlotRow[]> {
  const supabase = await createClient();
  const { data, error } = await fetchAll((from, to) => {
    let query = supabase.from("plots").select("*").order("name").order("id").range(from, to);
    if (projectId) query = query.eq("project_id", projectId);
    return query;
  });
  if (error) console.error("listPlots failed:", error);
  return (data ?? []) as PlotRow[];
}

export const PLOTS_PAGE_SIZE = 50;

export type PlotFilters = {
  projectId?: string;
  search?: string;
  page?: number;
};

/** One page for the masters table screen; listPlots stays the complete read. */
export async function listPlotsPage(filters: PlotFilters = {}): Promise<PagedResult<PlotRow>> {
  const supabase = await createClient();
  const search = cleanSearch(filters.search);

  return pagedList<PlotRow>(
    (page) => {
      let query = supabase
        .from("plots")
        .select("*", { count: "exact" })
        .order("name")
        .order("id")
        .range((page - 1) * PLOTS_PAGE_SIZE, page * PLOTS_PAGE_SIZE - 1);
      if (filters.projectId) query = query.eq("project_id", filters.projectId);
      if (search) query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%`);
      return query;
    },
    filters.page ?? 1,
    PLOTS_PAGE_SIZE,
  );
}
