"use server";

import { requireTool } from "@/lib/auth/access";
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
function guardError(error: { message: string }, fallback: string): ActionState {
  const message = error.message;
  if (
    message.includes("permanent") ||
    message.includes("no longer be edited") ||
    message.includes("exactly one") ||
    message.includes("issued purchase order") ||
    message.includes("inactive") ||
    message.includes("short code") ||
    message.includes("no longer exists") ||
    message.includes("approver") ||
    message.includes("send-back needs a note") ||
    message.includes("payment reference") ||
    message.includes("invoice") ||
    message.includes("can''t be negative") ||
    message.includes("can't be negative") ||
    message.includes("more than zero") ||
    message.includes("Invalid bill status change") ||
    message.includes("must clear") ||
    message.includes("must record")
  ) {
    return { error: message.replace(/^.*?:\s*/, "") };
  }
  return { error: fallback };
}

export type CreateBillInput = {
  poId: string | null;
  labourContractId: string | null;
  invoiceNo: string;
  invoiceDate: string;
  taxableAmount: number;
  gstAmount: number;
  totalAmount: number;
  note: string | null;
};

export async function createBill(input: CreateBillInput): Promise<ActionState> {
  await requireTool("/bills");

  if (!input.poId === !input.labourContractId) {
    return { error: "Pick what this bill is against — one purchase order or one labour contract." };
  }
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

  // The casts paper over a typegen limitation (the create_indent
  // precedent): it types every function argument non-null, but these
  // are genuinely optional and PostgREST passes the JSON null through.
  const { data: billId, error } = await supabase.rpc("create_bill", {
    p_po_id: (input.poId || null) as unknown as string,
    p_labour_contract_id: (input.labourContractId || null) as unknown as string,
    p_invoice_no: input.invoiceNo.trim(),
    p_invoice_date: input.invoiceDate,
    p_taxable_amount: input.taxableAmount,
    p_gst_amount: input.gstAmount,
    p_total_amount: input.totalAmount,
    p_note: (input.note?.trim() || null) as unknown as string,
  });
  if (error) {
    console.error("createBill failed:", error);
    return guardError(error, "Could not record the bill. Try again.");
  }
  if (!billId) return { error: "Could not record the bill. Try again." };

  revalidatePath("/bills");
  redirect(`/bills/${billId}`);
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
    return guardError(error, "Could not save. Try again.");
  }

  revalidatePath(`/bills/${billId}`);
  revalidatePath("/bills");
  return undefined;
}

/** A wrongly recorded bill is thrown away and recorded again — the
 * number is burnt, gaps accepted. RLS narrows this to recorded bills
 * owned by the actor (or an admin). */
export async function deleteBill(billId: string): Promise<ActionState> {
  await requireTool("/bills");

  const supabase = await createClient();
  // RLS filters unauthorised deletes to zero rows rather than raising,
  // so count the match to tell "gone" from "refused".
  const { count, error } = await supabase.from("bills").delete({ count: "exact" }).eq("id", billId);
  if (error) {
    console.error("deleteBill failed:", error);
    return guardError(error, "Could not delete the bill. Try again.");
  }
  if (!count) {
    return {
      error:
        "Only the person who recorded this bill (or an admin) can delete it, and only while it's still recorded.",
    };
  }

  revalidatePath("/bills");
  redirect("/bills");
}
