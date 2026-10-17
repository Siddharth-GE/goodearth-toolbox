import "server-only";

import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";

/**
 * Build progress (0119): how far a villa has got, unlike the cost packages in construction_stages.
 * Order is the meaning: first stage is paperwork, last active stage is handover. Reads carry no grant check.
 */
export type ProgressStageRow = {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
};

export async function listProgressStages(): Promise<ProgressStageRow[]> {
  const supabase = await createClient();
  const data = await fetchAll((from, to) =>
    supabase
      .from("progress_stages")
      .select("id, name, sort_order, is_active")
      .order("sort_order")
      .order("name")
      .order("id")
      .range(from, to),
  );
  return data as ProgressStageRow[];
}
