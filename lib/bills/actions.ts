"use server";

import { requireTool } from "@/lib/auth/access";
import { guardError } from "@/lib/db-error";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// Type-only import, and deliberately NOT re-exported — see the note in
// lib/budgets/actions.ts: a bare `export type { X };` in a "use server"
// file crashes every action in its compiled chunk at load time.
import type { ActionState } from "@/lib/action-state";

/**
 * Writes for Bills. The real rules live in the database (bills_guard,
 * create_bill, migration 0025) — these actions validate first so
 * refusals arrive as friendly messages, but a write that slips past the
 * UI is still stopped DB-side.
 */

/** The guards raise human-readable messages (written for exactly this).
 * Surface the known ones instead of a generic "try again". */
const BILL_GUARD_PHRASES = [
  "permanent",
  "no longer be edited",
  "exactly one",
  "issued purchase order",
  "inactive",
  "short code",
  "no longer exists",
  "approver",
  "send-back needs a note",
  "payment reference",
  "invoice",
  "can''t be negative",
  "can't be negative",
  "more than zero",
  "status change",
  "must clear",
  "must record",
  "approved yet",
  "does not belong",
  "not both",
  "muster roll",
] as const;

// Recording a bill — with its lines — is createBillWithLines in
// lib/bills/line-actions.ts (0106: bills have lines).

/* ------------------------------------------------------------------ *
 * Work orders (the labour contracts, 0105) — approval and the off-switch.
 * Making and editing them is lib/bills/work-order-actions.ts.
 * ------------------------------------------------------------------ */

/** pending → approved. The DB guard re-checks the approver list. */
export async function approveLabourContract(contractId: string): Promise<ActionState> {
  const user = await requireTool("/bills");

  const supabase = await createClient();
  const { error } = await supabase
    .from("labour_contracts")
    .update({
      status: "approved",
      approved_by: user.id,
      approved_at: new Date().toISOString(),
      updated_by: user.id,
    })
    // No status filter — the guard's message beats silent zero rows.
    .eq("id", contractId);
  if (error) {
    console.error("approveLabourContract failed:", error);
    return guardError(error, "Could not approve the contract. Try again.", BILL_GUARD_PHRASES);
  }

  revalidatePath("/bills", "layout");
  return undefined;
}

/** The off-switch: an inactive contract takes no new bills. Allowed at
 * any status; existing bills are untouched. */
export async function setLabourContractActive(
  contractId: string,
  isActive: boolean,
): Promise<ActionState> {
  const user = await requireTool("/bills");

  const supabase = await createClient();
  const { error } = await supabase
    .from("labour_contracts")
    .update({ is_active: isActive, updated_by: user.id })
    .eq("id", contractId);
  if (error) {
    console.error("setLabourContractActive failed:", error);
    return guardError(error, "Could not update the contract. Try again.", BILL_GUARD_PHRASES);
  }

  revalidatePath("/bills", "layout");
  return undefined;
}

export type UpdateBillInput = {
  invoiceNo: string;
  invoiceDate: string;
  taxableAmount: number;
  gstAmount: number;
  totalAmount: number;
  note: string | null;
};

/** Invoice fields and amounts only — the anchor, vendor, scope and
 * number are permanent (bills_guard), and status moves through the
 * transition actions, never here. */
export async function updateBill(billId: string, input: UpdateBillInput): Promise<ActionState> {
  const user = await requireTool("/bills");

  if (!input.invoiceNo.trim()) {
    return { error: "Type the invoice number as printed on the vendor's bill." };
  }
  if (!input.invoiceDate) return { error: "Pick the invoice date from the vendor's bill." };
  if (!Number.isFinite(input.taxableAmount) || input.taxableAmount < 0) {
    return { error: "Enter the taxable amount — zero or more." };
  }
  if (!Number.isFinite(input.gstAmount) || input.gstAmount < 0) {
    return { error: "Enter the GST amount — zero or more." };
  }
  if (!Number.isFinite(input.totalAmount) || input.totalAmount <= 0) {
    return { error: "Enter the invoice total — more than zero." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("bills")
    .update({
      invoice_no: input.invoiceNo.trim(),
      invoice_date: input.invoiceDate,
      taxable_amount: input.taxableAmount,
      gst_amount: input.gstAmount,
      total_amount: input.totalAmount,
      note: input.note?.trim() || null,
      updated_by: user.id,
    })
    // No status filter — filtering to recorded would make an edit on a
    // locked bill match zero rows and "succeed" silently. bills_guard
    // raises instead, and the message reaches the user.
    .eq("id", billId);
  if (error) {
    console.error("updateBill failed:", error);
    return guardError(error, "Could not save. Try again.", BILL_GUARD_PHRASES);
  }

  revalidatePath("/bills", "layout");
  return undefined;
}

/** recorded → approved. The DB guard re-checks the approver list; the
 * button is a courtesy. Self-approval is allowed (founder decision). */
export async function approveBill(billId: string): Promise<ActionState> {
  const user = await requireTool("/bills");

  const supabase = await createClient();
  const { error } = await supabase
    .from("bills")
    .update({
      status: "approved",
      approved_by: user.id,
      approved_at: new Date().toISOString(),
      // The guard requires a cleared note — an approval answers the
      // send-back that set it.
      rejection_note: null,
      updated_by: user.id,
    })
    // No status filter — a stale button on a moved-on bill should get
    // the guard's message, not a silent zero-row "success".
    .eq("id", billId);
  if (error) {
    console.error("approveBill failed:", error);
    return guardError(error, "Could not approve. Try again.", BILL_GUARD_PHRASES);
  }

  revalidatePath("/bills", "layout");
  return undefined;
}

/** approved → recorded, with the mandatory note. The approval record
 * clears so the next approval stamps fresh (the rejectIndent shape). */
export async function sendBackBill(billId: string, note: string): Promise<ActionState> {
  const user = await requireTool("/bills");

  if (!note.trim()) return { error: "Say what needs changing — a send-back needs a note." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("bills")
    .update({
      status: "recorded",
      rejection_note: note.trim(),
      approved_by: null,
      approved_at: null,
      updated_by: user.id,
    })
    .eq("id", billId);
  if (error) {
    console.error("sendBackBill failed:", error);
    return guardError(error, "Could not send the bill back. Try again.", BILL_GUARD_PHRASES);
  }

  revalidatePath("/bills", "layout");
  return undefined;
}

/** approved → paid, with the payment reference the guard insists on. */
export async function markBillPaid(billId: string, paymentRef: string): Promise<ActionState> {
  const user = await requireTool("/bills");

  if (!paymentRef.trim()) {
    return { error: "Record the payment reference — UTR, cheque number, UPI ref." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("bills")
    .update({
      status: "paid",
      payment_ref: paymentRef.trim(),
      paid_by: user.id,
      paid_at: new Date().toISOString(),
      updated_by: user.id,
    })
    .eq("id", billId);
  if (error) {
    console.error("markBillPaid failed:", error);
    return guardError(error, "Could not mark the bill paid. Try again.", BILL_GUARD_PHRASES);
  }

  revalidatePath("/bills", "layout");
  return undefined;
}

/** A wrongly recorded bill is thrown away and recorded again — the
 * number is burnt, gaps accepted. Only while recorded, and only by
 * whoever recorded it or an admin (delete_recorded_bill checks both). */
export async function deleteBill(billId: string): Promise<ActionState> {
  await requireTool("/bills");

  const supabase = await createClient();
  // delete_recorded_bill (0106): the bill, its lines, and the labour
  // entries it billed set free to be sent again — one transaction. Its
  // body repeats the recorded-bill delete rule (recorder or admin, only
  // while recorded) and says so in words when it refuses.
  const { error } = await supabase.rpc("delete_recorded_bill", { p_bill_id: billId });
  if (error) {
    console.error("deleteBill failed:", error);
    return guardError(error, "Could not delete the bill. Try again.", [
      ...BILL_GUARD_PHRASES,
      "Only a recorded bill",
      "Only the Bills tool",
    ]);
  }

  revalidatePath("/bills", "layout");
  redirect("/bills/list");
}
