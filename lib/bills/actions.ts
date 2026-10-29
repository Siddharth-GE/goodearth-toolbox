"use server";

import { requireTool } from "@/lib/auth/access";
import { guardError } from "@/lib/db-error";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// Type-only and not re-exported: `export type { X }` in a "use server" file crashes the chunk at load.
import type { ActionState } from "@/lib/action-state";

// Rules live in the database (bills_guard, create_bill, 0025); actions pre-check so refusals read as sentences.

/** The guards raise human-readable messages; surface the known ones. */
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
  "reverse",
  "stays on record",
] as const;

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
    // No status filter: the guard's message beats silent zero rows.
    .eq("id", contractId);
  if (error) {
    console.error("approveLabourContract failed:", error);
    return guardError(error, "Could not approve the contract. Try again.", BILL_GUARD_PHRASES);
  }

  revalidatePath("/bills", "layout");
  return undefined;
}

/** An inactive contract takes no new bills; existing bills are untouched. */
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

/** Invoice fields and amounts only; anchor, vendor, scope and number are permanent (bills_guard). */
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
    // No status filter: filtering to recorded would make an edit on a locked bill match zero rows and "succeed".
    .eq("id", billId);
  if (error) {
    console.error("updateBill failed:", error);
    return guardError(error, "Could not save. Try again.", BILL_GUARD_PHRASES);
  }

  revalidatePath("/bills", "layout");
  return undefined;
}

/** The DB guard re-checks the approver list; self-approval is allowed. */
export async function approveBill(billId: string): Promise<ActionState> {
  const user = await requireTool("/bills");

  const supabase = await createClient();
  const { error } = await supabase
    .from("bills")
    .update({
      status: "approved",
      approved_by: user.id,
      approved_at: new Date().toISOString(),
      // The guard requires a cleared note.
      rejection_note: null,
      updated_by: user.id,
    })
    // No status filter: a stale button gets the guard's message, not a silent zero-row "success".
    .eq("id", billId);
  if (error) {
    console.error("approveBill failed:", error);
    return guardError(error, "Could not approve. Try again.", BILL_GUARD_PHRASES);
  }

  revalidatePath("/bills", "layout");
  return undefined;
}

/** Clears the approval record so the next approval stamps fresh. */
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

/** Only while recorded, and only by the recorder or an admin (delete_recorded_bill checks both); the number is burnt. */
export async function deleteBill(billId: string): Promise<ActionState> {
  await requireTool("/bills");

  const supabase = await createClient();
  // delete_recorded_bill (0106) deletes the bill and its lines and frees the labour entries it billed, in one transaction.
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
