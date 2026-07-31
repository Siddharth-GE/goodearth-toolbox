import "server-only";

import { createClient } from "@/lib/supabase/server";

export type UnitType = "apartment" | "villa" | "duplex_row_house";
export type UnitStatus = "available" | "reserved" | "sold";

export type UnitRow = {
  id: string;
  project_id: string;
  plot_id: string | null;
  name: string;
  unit_type: UnitType;
  client_id: string | null;
  status: UnitStatus;
  created_at: string;
};

export async function listUnits(projectId?: string): Promise<UnitRow[]> {
  const supabase = await createClient();
  let query = supabase.from("units").select("*").order("name");
  if (projectId) query = query.eq("project_id", projectId);
  const { data } = await query;
  return (data ?? []) as UnitRow[];
}
