"use server";

// Type-only, never re-exported from a "use server" file (npm run check:actions).
import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { dbErrorMessage } from "@/lib/db-error";
import { roundPaise } from "@/lib/line-money";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

import { readConsolidateResult, type ConsolidateState } from "./sheets";

// Every rule is in 0170's functions, and each refusal is written for a person, so it is passed on as is.

const done = (): ActionState => {
  revalidatePath("/bills", "layout");
  return undefined;
};

const refused = (where: string, error: { message: string } | null): ActionState => {
  console.error(`${where} failed:`, error);
  return { error: dbErrorMessage(error ?? { message: "" }, "Could not save. Try again.") };
};

/** Sorts the ticked bills onto sheets and says what it left out and why; nothing is refused whole. */
export async function consolidateBills(billIds: string[]): Promise<ConsolidateState> {
  await requireTool("/bills");
  if (billIds.length === 0) return { error: "Tick the bills to consolidate." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("consolidate_bills", { p_bill_ids: billIds });
  if (error) return refused("consolidateBills", error) ?? {};
  const result = readConsolidateResult(data);
  if (!result) {
    console.error("consolidateBills: an answer of the wrong shape", data);
    return {
      error: "The bills were consolidated, but the answer could not be read. Open Consolidated.",
    };
  }
  revalidatePath("/bills", "layout");
  return { result };
}

export async function approveSheet(sheetId: string): Promise<ActionState> {
  await requireTool("/bills");
  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_bill_sheet", { p_sheet_id: sheetId });
  if (error) return refused("approveSheet", error);
  return done();
}

export async function sendBackSheet(sheetId: string, note: string): Promise<ActionState> {
  await requireTool("/bills");
  if (!note.trim()) return { error: "Say what needs changing — a send-back needs a note." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("send_back_bill_sheet", {
    p_sheet_id: sheetId,
    p_note: note.trim(),
  });
  if (error) return refused("sendBackSheet", error);
  return done();
}

export async function undoSheet(sheetId: string): Promise<ActionState> {
  await requireTool("/bills");
  const supabase = await createClient();
  const { error } = await supabase.rpc("undo_bill_sheet", { p_sheet_id: sheetId });
  if (error) return refused("undoSheet", error);
  return done();
}

export async function takeBillOffSheet(billId: string): Promise<ActionState> {
  await requireTool("/bills");
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_bill_from_sheet", { p_bill_id: billId });
  if (error) return refused("takeBillOffSheet", error);
  return done();
}

/** One payment, spread over the sheet's bills oldest first by pay_bill_sheet. */
export async function paySheet(
  sheetId: string,
  input: {
    amount: number;
    paidOn: string;
    reference: string;
    note: string | null;
    cashRequestItemId?: string | null;
  },
): Promise<ActionState> {
  await requireTool("/bills");
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { error: "The amount must be more than zero." };
  }
  if (!input.reference.trim()) return { error: "Type the UTR, cheque number or UPI reference." };
  if (!input.paidOn) return { error: "Pick the day it was paid." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("pay_bill_sheet", {
    p_sheet_id: sheetId,
    p_amount: roundPaise(input.amount),
    p_paid_on: input.paidOn,
    p_reference: input.reference.trim(),
    p_note: input.note?.trim() || undefined,
    p_cash_request_item_id: input.cashRequestItemId ?? undefined,
  });
  if (error) return refused("paySheet", error);
  return done();
}

export async function recoverOnSheet(
  sheetId: string,
  input: { advanceId: string; amount: number; recoveredOn: string; note: string | null },
): Promise<ActionState> {
  await requireTool("/bills");
  if (!input.advanceId) return { error: "Pick the advance to recover from." };
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { error: "The amount must be more than zero." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("recover_on_bill_sheet", {
    p_sheet_id: sheetId,
    p_advance_id: input.advanceId,
    p_amount: roundPaise(input.amount),
    p_recovered_on: input.recoveredOn,
    p_note: input.note?.trim() || undefined,
  });
  if (error) return refused("recoverOnSheet", error);
  return done();
}

/** A sheet's payment or recovery is reversed whole; money_reversal_guard checks the approver. */
export async function reverseSheetMoney(
  kind: "payment" | "recovery",
  entryId: string,
  reason: string,
): Promise<ActionState> {
  await requireTool("/bills");
  if (!reason.trim()) return { error: "Say why it is reversed." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("reverse_bill_sheet_money", {
    p_kind: kind,
    p_entry_id: entryId,
    p_reason: reason.trim(),
  });
  if (error) {
    if (error.code === "23505") return { error: "This was reversed already." };
    return refused("reverseSheetMoney", error);
  }
  return done();
}

export async function addSheetsToCashRequest(
  requestId: string,
  sheets: { sheetId: string; amount: number }[],
): Promise<ActionState> {
  const user = await requireTool("/bills");
  if (sheets.length === 0) return { error: "Tick the sheets to add." };
  if (sheets.some((sheet) => !Number.isFinite(sheet.amount) || sheet.amount <= 0)) {
    return { error: "Every amount asked for must be more than zero." };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("cash_request_items").insert(
    sheets.map((sheet) => ({
      cash_request_id: requestId,
      item_kind: "sheet",
      sheet_id: sheet.sheetId,
      requested_amount: roundPaise(sheet.amount),
      created_by: user.id,
      updated_by: user.id,
    })),
  );
  if (error) {
    if (error.code === "23505") return { error: "One of those sheets is already on this request." };
    return refused("addSheetsToCashRequest", error);
  }
  return done();
}
