import "server-only";

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

export async function listPlots(projectId?: string): Promise<PlotRow[]> {
  const supabase = await createClient();
  let query = supabase.from("plots").select("*").order("name");
  if (projectId) query = query.eq("project_id", projectId);
  const { data } = await query;
  return (data ?? []) as PlotRow[];
}
