import "server-only";

import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";

/**
 * Build progress (0119): how far a villa's build has got — Agreement,
 * Excavation & levelling … Final handover. Client Relations points each
 * plot at one of these (founder, 2026-10-16: "construction stage lets
 * make a masters table that lists it and then link it here").
 *
 * Not construction_stages (lib/masters/stages.ts): those are the cost
 * packages indents and budget lines are tagged with — what money is for,
 * not how far a villa has got.
 *
 * Order is the meaning: the FIRST stage is the paperwork before ground is
 * broken, the LAST active stage is the handover (lib/client-relations/
 * next-steps.ts). Reads carry no grant check, like every Masters read.
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
