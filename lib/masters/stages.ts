import "server-only";

import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";

/**
 * The managed list of construction stages an indent or a construction
 * budget line is tagged with (migration 0053). Founder decision,
 * 2026-08-12: stages are picked, never typed — "Foundation" and
 * "foundation" living side by side in a report is what this list ended.
 * Deactivating a stage stops new picks without touching history, the
 * gst_rates principle; the database refuses deleting a stage in use.
 */
export type ConstructionStageRow = {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
};

// fetchAll for consistency with the other masters reads: every list
// here promises completeness, so none of them get to silently cap.
export async function listConstructionStages(): Promise<ConstructionStageRow[]> {
  const supabase = await createClient();
  const data = await fetchAll((from, to) =>
    supabase
      .from("construction_stages")
      .select("id, name, sort_order, is_active, created_at")
      .order("sort_order")
      .order("name")
      .order("id")
      .range(from, to),
  );
  return data as ConstructionStageRow[];
}

/** Only the stages a new indent or budget line may pick today. */
export async function listActiveStageNames(): Promise<string[]> {
  const stages = await listConstructionStages();
  return stages.filter((stage) => stage.is_active).map((stage) => stage.name);
}
