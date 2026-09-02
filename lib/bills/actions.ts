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
    message.includes("status change") ||
    message.includes("must clear") ||
    message.includes("must record") ||
    message.includes("approved yet") ||
    message.includes("does not belong") ||
    message.includes("not both") ||
    message.includes("muster roll")
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

  revalidatePath("/bills", "layout");
  redirect(`/bills/${billId}`);
}

export type CreateNmrBillInput = {
  /** Optional: the labour contractor, or null when paid directly. */
  vendorId: string | null;
  projectId: string;
  plotId: string | null;
  unitId: string | null;
  invoiceNo: string;
  invoiceDate: string;
  taxableAmount: number;
  gstAmount: number;
  totalAmount: number;
  note: string | null;
};

/** NMR — daily wages. No PO, no contract; the scope is picked here and
 * enters the number. No over-billing warning exists, by design. */
export async function createNmrBill(input: CreateNmrBillInput): Promise<ActionState> {
  await requireTool("/bills");

  if (!input.projectId) return { error: "Pick the project this muster roll belongs to." };
  if (input.plotId && input.unitId) {
    return { error: "An NMR bill is for one plot or one unit, not both." };
  }
  if (!input.invoiceNo.trim()) return { error: "Type the muster roll or bill reference." };
  if (!input.invoiceDate) return { error: "Pick the bill date." };
  if (!Number.isFinite(input.taxableAmount) || input.taxableAmount < 0) {
    return { error: "Enter the taxable amount — zero or more." };
  }
  if (!Number.isFinite(input.gstAmount) || input.gstAmount < 0) {
    return { error: "Enter the GST amount — zero or more." };
  }
  if (!Number.isFinite(input.totalAmount) || input.totalAmount <= 0) {
    return { error: "Enter the bill total — more than zero." };
  }

  const supabase = await createClient();
  const { data: billId, error } = await supabase.rpc("create_nmr_bill", {
    p_vendor_id: (input.vendorId || null) as unknown as string,
    p_project_id: input.projectId,
    p_plot_id: (input.plotId || null) as unknown as string,
    p_unit_id: (input.unitId || null) as unknown as string,
    p_invoice_no: input.invoiceNo.trim(),
    p_invoice_date: input.invoiceDate,
    p_taxable_amount: input.taxableAmount,
    p_gst_amount: input.gstAmount,
    p_total_amount: input.totalAmount,
    p_note: (input.note?.trim() || null) as unknown as string,
  });
  if (error) {
    console.error("createNmrBill failed:", error);
    return guardError(error, "Could not record the bill. Try again.");
  }
  if (!billId) return { error: "Could not record the bill. Try again." };

  revalidatePath("/bills", "layout");
  redirect(`/bills/${billId}`);
}

/* ------------------------------------------------------------------ *
 * Labour contracts — created and approved inside Bills
 * ------------------------------------------------------------------ */

export type LabourContractFormState = ActionState;

function readContractForm(formData: FormData) {
  // One "scope" select encoding plot:<id> / unit:<id> / "" (general) —
  // picking both is structurally impossible, mirroring the DB CHECK.
  const scope = String(formData.get("scope") ?? "");
  return {
    vendor_id: String(formData.get("vendor_id") ?? ""),
    project_id: String(formData.get("project_id") ?? ""),
    plot_id: scope.startsWith("plot:") ? scope.slice("plot:".length) : null,
    unit_id: scope.startsWith("unit:") ? scope.slice("unit:".length) : null,
    description: String(formData.get("description") ?? "").trim(),
    contract_value: Number(formData.get("contract_value")),
  };
}

function validateContract(form: ReturnType<typeof readContractForm>): string | undefined {
  if (!form.vendor_id) return "Choose the contractor (a vendor in Masters).";
  if (!form.project_id) return "Choose a project.";
  if (!form.description) return "Say what the contract covers.";
  if (!Number.isFinite(form.contract_value) || form.contract_value <= 0)
    return "Enter the contract value — more than zero.";
  return undefined;
}

/** New contracts start pending — a bill approver or an admin must
 * approve before bills can be recorded against them. */
export async function createLabourContract(
  _state: LabourContractFormState,
  formData: FormData,
): Promise<LabourContractFormState> {
  const user = await requireTool("/bills");

  const form = readContractForm(formData);
  const invalid = validateContract(form);
  if (invalid) return { error: invalid };

  const supabase = await createClient();
  const { error } = await supabase
    .from("labour_contracts")
    .insert({ ...form, created_by: user.id, updated_by: user.id });
  if (error) {
    console.error("createLabourContract failed:", error);
    return { error: "Could not record the labour contract. Try again." };
  }

  revalidatePath("/bills", "layout");
  return undefined;
}

/** Terms are editable only while pending — the guard refuses after
 * approval (deactivate and record a new one instead). */
export async function updateLabourContract(
  id: string,
  _state: LabourContractFormState,
  formData: FormData,
): Promise<LabourContractFormState> {
  const user = await requireTool("/bills");

  const form = readContractForm(formData);
  const invalid = validateContract(form);
  if (invalid) return { error: invalid };

  const supabase = await createClient();
  const { error } = await supabase
    .from("labour_contracts")
    .update({ ...form, updated_by: user.id })
    .eq("id", id);
  if (error) {
    console.error("updateLabourContract failed:", error);
    return guardError(error, "Could not update the labour contract. Try again.");
  }

  revalidatePath("/bills", "layout");
  return undefined;
}

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
    return guardError(error, "Could not approve the contract. Try again.");
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
    return guardError(error, "Could not update the contract. Try again.");
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
    return guardError(error, "Could not save. Try again.");
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
    return guardError(error, "Could not approve. Try again.");
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
    return guardError(error, "Could not send the bill back. Try again.");
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
    return guardError(error, "Could not mark the bill paid. Try again.");
  }

  revalidatePath("/bills", "layout");
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

  revalidatePath("/bills", "layout");
  redirect("/bills/list");
}
