import "server-only";

import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";

export type UnitType = "apartment" | "villa" | "duplex_row_house";
export type UnitStatus = "available" | "reserved" | "sold";

export type UnitRow = {
  id: string;
  project_id: string;
  /** The unit's plot — required and unique since 0029 (plot ↔ unit is 1:1). */
  plot_id: string;
  name: string;
  /** Short code for PO numbers (PO/SAA/<code>/001) — null until set. */
  code: string | null;
  unit_type: UnitType;
  client_id: string | null;
  status: UnitStatus;
  created_at: string;
};

// fetchAll because this promises the complete list — seven callers
// across the tools (forms, lookups, the unit dialog's plot-uniqueness
// check) depend on completeness, and a capped read here would make real
// units simply vanish. The units *table screen* pages via listUnitsPage
// below instead.
export async function listUnits(projectId?: string): Promise<UnitRow[]> {
  const supabase = await createClient();
  const { data } = await fetchAll((from, to) => {
    let query = supabase.from("units").select("*").order("name").order("id").range(from, to);
    if (projectId) query = query.eq("project_id", projectId);
    return query;
  });
  return (data ?? []) as UnitRow[];
}

export const UNITS_LIST_LIMIT = 50;

export type UnitPage = {
  units: UnitRow[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
};

/** One page of units for the masters table, with a real database count. */
export async function listUnitsPage({ page = 1 }: { page?: number } = {}): Promise<UnitPage> {
  const supabase = await createClient();

  const pageSize = UNITS_LIST_LIMIT;
  const currentPage = Math.max(1, page);

  const { data, count, error } = await supabase
    .from("units")
    .select("*", { count: "exact" })
    .order("name")
    .order("id")
    .range((currentPage - 1) * pageSize, currentPage * pageSize - 1);

  if (error) {
    console.error("listUnitsPage failed:", error);
    return { units: [], total: 0, page: currentPage, pageCount: 1, pageSize };
  }

  const total = count ?? 0;
  return {
    units: (data ?? []) as UnitRow[],
    total,
    page: currentPage,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    pageSize,
  };
}
