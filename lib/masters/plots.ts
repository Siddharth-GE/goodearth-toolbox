import "server-only";

import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";

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
  const { data } = await fetchAll((from, to) => {
    let query = supabase.from("plots").select("*").order("name").order("id").range(from, to);
    if (projectId) query = query.eq("project_id", projectId);
    return query;
  });
  return (data ?? []) as PlotRow[];
}
