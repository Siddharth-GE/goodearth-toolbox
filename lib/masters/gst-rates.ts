import "server-only";

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

export async function listGstRates(): Promise<GstRateRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("gst_rates").select("*").order("rate");
  return (data ?? []) as GstRateRow[];
}

/** Only the rates a PO line may pick today. */
export async function listActiveGstRates(): Promise<GstRateRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("gst_rates").select("*").eq("is_active", true).order("rate");
  return (data ?? []) as GstRateRow[];
}
