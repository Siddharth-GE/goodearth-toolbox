import "server-only";

import { requireTool } from "@/lib/auth/access";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { assertRead } from "@/lib/supabase/read-failed";
import { createClient } from "@/lib/supabase/server";
import { GRANT } from "./shared";

// Every function opens with requireTool: 0161's policies gate SELECT too. Reads nothing outside the tool.
const TOOL = "Saarang Collections";

/** Counts and dates only — the welcome screen never shows a rupee. */
export async function getWelcomeCounts(): Promise<{
  reportsLoaded: number;
  reportDate: string | null;
  excludedReceipts: number;
  corrections: number;
  extraUnits: number;
}> {
  await requireTool(GRANT);
  const supabase = await createClient();
  const head = { count: "exact", head: true } as const;
  const [slots, settings, excluded, corrections, extra] = await Promise.all([
    fetchAll((from, to) =>
      supabase.from("saarang_collection_uploads").select("slot, id").order("id").range(from, to),
    ),
    supabase.from("saarang_collection_settings").select("report_date").maybeSingle(),
    supabase.from("saarang_collection_excluded_receipts").select("id", head),
    supabase.from("saarang_collection_corrections").select("id", head),
    supabase.from("saarang_collection_extra_units").select("id", head),
  ]);
  assertRead(TOOL, "the report date", settings.error);
  assertRead(TOOL, "the excluded receipts", excluded.error);
  assertRead(TOOL, "the corrections", corrections.error);
  assertRead(TOOL, "the units added by hand", extra.error);

  return {
    reportsLoaded: new Set(slots.map((row) => row.slot)).size,
    reportDate: settings.data?.report_date ?? null,
    excludedReceipts: excluded.count ?? 0,
    corrections: corrections.count ?? 0,
    extraUnits: extra.count ?? 0,
  };
}
