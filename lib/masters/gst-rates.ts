import "server-only";

import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";

/** Deactivating a rate stops new picks without touching lines that snapshotted it. */
export type GstRateRow = {
  rate: number;
  is_active: boolean;
  created_at: string;
};

// (rate is the primary key, so it is its own unique tiebreaker.)
export async function listGstRates(): Promise<GstRateRow[]> {
  const supabase = await createClient();
  const data = await fetchAll((from, to) =>
    supabase.from("gst_rates").select("*").order("rate").range(from, to),
  );
  return data as GstRateRow[];
}

export async function listActiveGstRates(): Promise<GstRateRow[]> {
  const supabase = await createClient();
  const data = await fetchAll((from, to) =>
    supabase.from("gst_rates").select("*").eq("is_active", true).order("rate").range(from, to),
  );
  return data as GstRateRow[];
}
