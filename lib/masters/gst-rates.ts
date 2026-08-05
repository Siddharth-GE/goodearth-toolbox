import "server-only";

import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";

/**
 * The managed list of GST slabs a PO line's percentage is picked from
 * (migration 0021). The rate itself is the primary key; deactivating a
 * rate stops new picks without touching lines that snapshotted it.
 */
export type GstRateRow = {
  rate: number;
  is_active: boolean;
  created_at: string;
};

// fetchAll for consistency with the other masters reads: every list
// here promises completeness, so none of them get to silently cap.
// (rate is the primary key, so it is its own unique tiebreaker.)
export async function listGstRates(): Promise<GstRateRow[]> {
  const supabase = await createClient();
  const { data, error } = await fetchAll((from, to) =>
    supabase.from("gst_rates").select("*").order("rate").range(from, to),
  );
  if (error) console.error("listGstRates failed:", error);
  return (data ?? []) as GstRateRow[];
}

/** Only the rates a PO line may pick today. */
export async function listActiveGstRates(): Promise<GstRateRow[]> {
  const supabase = await createClient();
  const { data, error } = await fetchAll((from, to) =>
    supabase.from("gst_rates").select("*").eq("is_active", true).order("rate").range(from, to),
  );
  if (error) console.error("listActiveGstRates failed:", error);
  return (data ?? []) as GstRateRow[];
}
