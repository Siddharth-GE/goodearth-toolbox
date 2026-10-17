"use server";

import { revalidatePath } from "next/cache";

import { requireTool } from "@/lib/auth/access";
import { guardError } from "@/lib/db-error";
import { optionalText, text } from "@/lib/form-data";
import { createClient } from "@/lib/supabase/server";

// Type-only and NOT re-exported: a bare `export type { X }` in a "use server" file crashes every action in the chunk (check:actions).
import type { ActionState } from "@/lib/action-state";

/** Every export opens with requireTool; RLS refuses anything that slips past. Actions return ActionState, never throw. */

const GRANT = "/client-relations";

/** The layout form covers the whole tree, the moved clients list included. */
function revalidateAll(): void {
  revalidatePath("/client-relations", "layout");
}

/** Database messages are written for people (0050); surface those, fall back for the rest. */
const CRM_GUARD_PHRASES = [
  "no longer exists",
  "You need the Client Relations app",
  "Unknown unit status",
  // crm_assign_unit and crm_release_unit, on a plot someone else owns (0123).
  "That plot is not one of yours",
] as const;
function friendly(error: { message: string; code?: string }, fallback: string): ActionState {
  // A row policy refusing the new row (0123): the plot is someone else's.
  if (error.code === "42501") return { error: "That plot is not one of yours." };
  const state = guardError(error, fallback, CRM_GUARD_PHRASES);
  if (state?.error === fallback) console.error("Client Relations write failed:", error);
  return state;
}

export type ClientInput = {
  name: string;
  mobile: string | null;
  email: string | null;
  stage: string;
  ownerId: string | null;
  source: string | null;
  firstContactOn: string | null;
  lostReason: string | null;
  notes: string | null;
};

function validateClient(input: ClientInput): string | null {
  if (!input.name.trim()) return "Type the client's name.";
  if (!["prospect", "client", "lost"].includes(input.stage)) {
    return "Pick whether this is a prospect, a client, or lost.";
  }
  // Mirrors clients_lost_reason_check (0050).
  if (input.stage === "lost" && !(input.lostReason ?? "").trim()) {
    return "Say why this one was lost — a blank reason helps nobody later.";
  }
  return null;
}

/** Named createClientRecord because createClient is taken by lib/supabase/server.ts. */
export async function createClientRecord(input: ClientInput): Promise<ActionState> {
  await requireTool(GRANT);
  const problem = validateClient(input);
  if (problem) return { error: problem };

  const supabase = await createClient();
  const { error } = await supabase.from("clients").insert({
    name: input.name.trim(),
    mobile: input.mobile?.trim() || null,
    email: input.email?.trim() || null,
    stage: input.stage,
    crm_owner_id: input.ownerId,
    source: input.source?.trim() || null,
    first_contact_on: input.firstContactOn || null,
    lost_reason: input.lostReason?.trim() || null,
    notes: input.notes?.trim() || null,
  });
  if (error) return friendly(error, "Could not add that person. Try again.");

  revalidateAll();
  return undefined;
}

export async function updateClientRecord(
  clientId: string,
  input: ClientInput,
): Promise<ActionState> {
  await requireTool(GRANT);
  const problem = validateClient(input);
  if (problem) return { error: problem };

  const supabase = await createClient();
  const { error } = await supabase
    .from("clients")
    .update({
      name: input.name.trim(),
      mobile: input.mobile?.trim() || null,
      email: input.email?.trim() || null,
      stage: input.stage,
      crm_owner_id: input.ownerId,
      source: input.source?.trim() || null,
      first_contact_on: input.firstContactOn || null,
      // Clearing the stage clears the reason.
      lost_reason: input.stage === "lost" ? (input.lostReason?.trim() ?? null) : null,
      notes: input.notes?.trim() || null,
    })
    .eq("id", clientId);
  if (error) return friendly(error, "Could not save those changes. Try again.");

  revalidateAll();
  revalidatePath(`/client-relations/${clientId}`);
  return undefined;
}

/** FormData adapters for RecordFormDialog. `?? null` because an untouched input arrives as "". */
function clientFromForm(formData: FormData): ClientInput {
  return {
    name: text(formData, "name"),
    mobile: optionalText(formData, "mobile"),
    email: optionalText(formData, "email"),
    stage: text(formData, "stage") || "prospect",
    ownerId: optionalText(formData, "ownerId"),
    source: optionalText(formData, "source"),
    firstContactOn: optionalText(formData, "firstContactOn"),
    lostReason: optionalText(formData, "lostReason"),
    notes: optionalText(formData, "notes"),
  };
}

export async function createClientForm(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return createClientRecord(clientFromForm(formData));
}

export async function updateClientForm(
  clientId: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return updateClientRecord(clientId, clientFromForm(formData));
}

/**
 * Gives a client their plot: the one moment CRM writes Masters' data, through the security-definer function in 0050.
 * Flipping the person to 'client' is part of it: a prospect holding a plot means nothing.
 */
export async function assignPlot(
  clientId: string,
  unitId: string,
  status: "reserved" | "sold",
): Promise<ActionState> {
  await requireTool(GRANT);
  if (!unitId) return { error: "Pick which plot they have taken." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("crm_assign_unit", {
    p_unit_id: unitId,
    p_client_id: clientId,
    p_status: status,
  });
  if (error) return friendly(error, "Could not assign that plot. Try again.");

  const today = new Date().toISOString().slice(0, 10);
  const { error: stageError } = await supabase
    .from("clients")
    .update({ stage: "client", converted_on: today, lost_reason: null })
    .eq("id", clientId)
    .eq("stage", "prospect");
  if (stageError) {
    // The plot IS assigned here; say so rather than invite a second click.
    console.error("Plot assigned but stage not updated:", stageError);
    return { error: "Plot assigned, but could not mark them as a client. Edit them to fix it." };
  }

  revalidateAll();
  revalidatePath(`/client-relations/${clientId}`);
  return undefined;
}

export type MilestoneInputPatch = {
  dueAmount: number | null;
  dueOn: string | null;
  invoiceNo: string | null;
  invoicedOn: string | null;
  note: string | null;
};

export async function saveMilestone(
  milestoneId: string,
  input: MilestoneInputPatch,
): Promise<ActionState> {
  await requireTool(GRANT);

  if (input.dueAmount !== null && (!Number.isFinite(input.dueAmount) || input.dueAmount < 0)) {
    return { error: "An amount has to be zero or more." };
  }
  // Mirrors client_payment_milestones_invoice_check.
  if (input.invoiceNo?.trim() && !input.invoicedOn) {
    return { error: "An invoice number needs the date it was raised." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("client_payment_milestones")
    .update({
      due_amount: input.dueAmount,
      due_on: input.dueOn || null,
      invoice_no: input.invoiceNo?.trim() || null,
      invoiced_on: input.invoicedOn || null,
      note: input.note?.trim() || null,
    })
    .eq("id", milestoneId);
  if (error) return friendly(error, "Could not save that milestone. Try again.");

  revalidateAll();
  return undefined;
}

export type ReceiptInputData = {
  engagementId: string;
  milestoneId: string | null;
  amount: number;
  receivedOn: string;
  mode: string;
  reference: string | null;
  note: string | null;
};

export async function addReceipt(input: ReceiptInputData): Promise<ActionState> {
  await requireTool(GRANT);

  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { error: "Enter how much came in — more than zero." };
  }
  if (!input.receivedOn) return { error: "Pick the date the money came in." };
  if (!["bank", "cheque", "upi", "cash", "other"].includes(input.mode)) {
    return { error: "Pick how the money came in." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("client_receipts").insert({
    engagement_id: input.engagementId,
    // Blank = arrived, not yet filed against a stage; dues spread it across the oldest unpaid rungs.
    milestone_id: input.milestoneId || null,
    amount: input.amount,
    received_on: input.receivedOn,
    mode: input.mode,
    reference: input.reference?.trim() || null,
    note: input.note?.trim() || null,
  });
  if (error) return friendly(error, "Could not record that payment. Try again.");

  revalidateAll();
  return undefined;
}

export async function deleteReceipt(receiptId: string): Promise<ActionState> {
  await requireTool(GRANT);

  const supabase = await createClient();
  const { error } = await supabase.from("client_receipts").delete().eq("id", receiptId);
  if (error) return friendly(error, "Could not remove that payment. Try again.");

  revalidateAll();
  return undefined;
}
