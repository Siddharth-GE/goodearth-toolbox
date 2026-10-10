"use server";

// Type-only import, never re-exported from a "use server" file — the
// 2026-08-03 outage rule, enforced by npm run check:actions.
import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { dbErrorMessage } from "@/lib/db-error";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { DayRates } from "./lines";
import { pieceRatesPayload } from "./labour-billing";

/**
 * Send to Bill (0106, plan.md B7): the ticked labour entries become one
 * bill — its lines, its total, and every entry stamped with it — inside
 * send_labour_logs_to_bill(), all or nothing. The function is SECURITY
 * DEFINER because it stamps labour_logs, which the billing team cannot
 * write; it checks /bills first, takes the quantities from the entries,
 * and from here takes only rates, the reference, date and note.
 */

export type SendToBillInput = {
  logIds: string[];
  kind: "nmr" | "pw";
  /** Piece-work: the contractor's approved work order. */
  labourContractId: string | null;
  billReference: string;
  billDate: string;
  /** Daily wages: the day rate per trade. */
  dayRates: DayRates | null;
  /** Piece-work: the rate per entry (a lump sum: its amount). */
  pieceRates: Record<string, number | null> | null;
  gstPct: number;
  /** Daily wages only: a total that differs from heads × rates, and why. */
  totalOverride: number | null;
  overrideNote: string | null;
  note: string | null;
};

export async function sendLabourToBill(input: SendToBillInput): Promise<ActionState> {
  await requireTool("/bills");
  if (input.logIds.length === 0) return { error: "Tick the labour entries to bill." };
  if (!input.billReference.trim()) return { error: "Type the muster roll or bill reference." };
  if (!input.billDate) return { error: "Pick the bill date." };
  if (!Number.isFinite(input.gstPct) || input.gstPct < 0 || input.gstPct > 100) {
    return { error: "GST must be between 0% and 100%." };
  }

  const rates =
    input.kind === "nmr"
      ? {
          ...(input.dayRates?.mason != null ? { mason: input.dayRates.mason } : {}),
          ...(input.dayRates?.helper != null ? { helper: input.dayRates.helper } : {}),
          ...(input.dayRates?.other != null ? { other: input.dayRates.other } : {}),
          gst_pct: input.gstPct,
        }
      : pieceRatesPayload(input.pieceRates ?? {}, input.gstPct);

  const supabase = await createClient();
  // The casts paper over the typegen limitation createBill notes: these
  // arguments are genuinely optional and PostgREST passes JSON null on.
  const { data: billId, error } = await supabase.rpc("send_labour_logs_to_bill", {
    p_log_ids: input.logIds,
    p_labour_contract_id: (input.kind === "pw"
      ? input.labourContractId
      : null) as unknown as string,
    p_bill_reference: input.billReference.trim(),
    p_bill_date: input.billDate,
    p_rates: rates,
    p_total_override: (input.kind === "nmr" ? input.totalOverride : null) as unknown as number,
    p_override_note: (input.kind === "nmr" && input.totalOverride !== null
      ? input.overrideNote?.trim() || null
      : null) as unknown as string,
    p_note: (input.note?.trim() || null) as unknown as string,
  });
  if (error || !billId) {
    console.error("sendLabourToBill failed:", error);
    // The function's refusals are written for a person to read.
    return {
      error: dbErrorMessage(error ?? { message: "" }, "Could not make the bill. Try again."),
    };
  }

  revalidatePath("/bills", "layout");
  revalidatePath("/supervisors", "layout");
  redirect(`/bills/${billId}`);
}
