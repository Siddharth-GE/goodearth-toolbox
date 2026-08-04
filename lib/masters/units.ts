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

// fetchAll because this promises the complete list: units are the first
// master that will realistically outgrow PostgREST's silent 1,000-row cap,
// and a capped read here would make real units simply vanish from the
// table. If the page itself ever gets unwieldy, paginate it like the
// items list — a stated limit, never the transport's.
export async function listUnits(projectId?: string): Promise<UnitRow[]> {
  const supabase = await createClient();
  const { data } = await fetchAll((from, to) => {
    let query = supabase.from("units").select("*").order("name").order("id").range(from, to);
    if (projectId) query = query.eq("project_id", projectId);
    return query;
  });
  return (data ?? []) as UnitRow[];
}
