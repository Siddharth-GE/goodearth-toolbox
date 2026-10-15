import "server-only";

import type { createClient } from "@/lib/supabase/server";
import { sheetTotal } from "./calc";

/**
 * Re-sum a line's measurement sheet (0096) and write the total onto the
 * line — the one place a sheet becomes a quantity, for a row typed on the
 * sheet (estimate-actions.ts) and for rows the model sent
 * (model-import-actions.ts) alike. The arithmetic is calc.ts's; SQL never
 * sums. With no rows left the line keeps its last quantity, typed from
 * then on (an import that empties a model-only line nulls it itself).
 *
 * Returns a message when the quantity could not be written, else
 * undefined. The caller has already checked the grant.
 */
export async function syncLineQty(
  supabase: Awaited<ReturnType<typeof createClient>>,
  lineId: string,
  userId: string,
): Promise<string | undefined> {
  const { data: rows, error: readError } = await supabase
    .from("estimator_estimate_line_measurements")
    .select("nos, length, breadth, depth")
    .eq("line_id", lineId);
  if (readError) {
    console.error("syncLineQty (read) failed:", readError);
    return "The row was saved, but the work's quantity could not be updated. Change any row to retry.";
  }
  if (!rows || rows.length === 0) return undefined;

  const total = sheetTotal(rows);
  if (!(total > 0)) {
    return "The measurements add up to nothing — check the rows.";
  }

  const { error } = await supabase
    .from("estimator_estimate_lines")
    .update({ qty: total, updated_by: userId })
    .eq("id", lineId);
  if (error) {
    if (error.code === "P0001") return error.message;
    console.error("syncLineQty (write) failed:", error);
    return "The row was saved, but the work's quantity could not be updated. Change any row to retry.";
  }
  return undefined;
}
