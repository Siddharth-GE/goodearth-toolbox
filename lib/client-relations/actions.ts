"use server";

import { revalidatePath } from "next/cache";

import { requireTool } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { normaliseBottlenecks } from "./stages";

// Type-only import, and deliberately NOT re-exported. A bare
// `export type { X }` in a "use server" file crashes every action in its
// compiled chunk at load time — it caused a production outage once, and
// `npm run check:actions` is the gate that keeps it from happening twice.
import type { ActionState } from "@/lib/action-state";

/**
 * Writes for Client Relations.
 *
 * Every export opens with requireTool("/client-relations"), then RLS
 * refuses anything that slips past. Actions return ActionState and never
 * throw, so a form can render the message inline.
 */

const GRANT = "/client-relations";

/** Every CRM screen shows some slice of the same records. The layout
 * form covers the whole tree — the moved clients list included. */
function revalidateAll(): void {
  revalidatePath("/client-relations", "layout");
}

/**
 * The database's own messages are written for a person to read (0050
 * raises "You need the Client Relations app to assign a plot", not a
 * constraint name). Surface those; fall back for anything else.
 */
function friendly(error: { message: string }, fallback: string): ActionState {
  const message = error.message;
  if (
    message.includes("no longer exists") ||
    message.includes("You need the Client Relations app") ||
    message.includes("Unknown unit status")
  ) {
    return { error: message.replace(/^.*?:\s*/, "") };
  }
  console.error("Client Relations write failed:", error);
  return { error: fallback };
}

// ---------------------------------------------------------------------
// Clients and prospects
// ---------------------------------------------------------------------

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
  // Mirrors clients_lost_reason_check in 0050 §1. A status nobody can
  // explain is a status nobody trusts six months later.
  if (input.stage === "lost" && !(input.lostReason ?? "").trim()) {
    return "Say why this one was lost — a blank reason helps nobody later.";
  }
  return null;
}

/**
 * Named createClientRecord, not createClient, because
 * lib/supabase/server.ts already owns that name — the same collision
 * Masters resolved the same way.
 */
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
      // Clearing the stage clears the reason with it, so a client who came
      // back does not keep the note explaining why they left.
      lost_reason: input.stage === "lost" ? (input.lostReason?.trim() ?? null) : null,
      notes: input.notes?.trim() || null,
    })
    .eq("id", clientId);
  if (error) return friendly(error, "Could not save those changes. Try again.");

  revalidateAll();
  revalidatePath(`/client-relations/${clientId}`);
  return undefined;
}

/**
 * The two FormData shims RecordFormDialog needs.
 *
 * That component drives every create/edit dialog in the app and hands its
 * action a (state, formData) pair, so the typed functions above get a thin
 * adapter rather than a second dialog being written by hand. `?? null`
 * everywhere because an untouched input arrives as "" and a blank mobile
 * is not the empty string.
 */
function clientFromForm(formData: FormData): ClientInput {
  const text = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" && value.trim() ? value : null;
  };
  return {
    name: (formData.get("name") as string) ?? "",
    mobile: text("mobile"),
    email: text("email"),
    stage: (formData.get("stage") as string) ?? "prospect",
    ownerId: text("ownerId"),
    source: text("source"),
    firstContactOn: text("firstContactOn"),
    lostReason: text("lostReason"),
    notes: text("notes"),
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

// ---------------------------------------------------------------------
// Adding them to the master
// ---------------------------------------------------------------------

/**
 * Give a client their plot. This is the founder's "once they are a client
 * they can be added to the master" — the one moment CRM writes Masters'
 * data, through the security-definer function declared in 0050 §3 rather
 * than by touching `units` directly.
 *
 * Flipping the person to 'client' is part of the same action on purpose:
 * a prospect holding a plot is a state nobody would ever mean.
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
    // The plot IS assigned at this point. Say so rather than implying
    // nothing happened and inviting a second click.
    console.error("Plot assigned but stage not updated:", stageError);
    return { error: "Plot assigned, but could not mark them as a client. Edit them to fix it." };
  }

  revalidateAll();
  revalidatePath(`/client-relations/${clientId}`);
  return undefined;
}

// ---------------------------------------------------------------------
// The plot record
// ---------------------------------------------------------------------

export type EngagementInput = {
  ownerId: string | null;
  saleDeedStatus: string;
  saleDeedOriginalWith: string | null;
  saleDeedAck: string | null;
  saleDeedSignedOn: string | null;
  caStatus: string;
  caOriginalWith: string | null;
  caAck: string | null;
  caSignedOn: string | null;
  registrationStage: string;
  registrationNote: string | null;
  registrationOn: string | null;
  designSupport: string | null;
  details: string | null;
  checkInOn: string | null;
  plotValue: number | null;
  constructionValue: number | null;
};

export async function saveEngagement(
  engagementId: string,
  input: EngagementInput,
): Promise<ActionState> {
  const user = await requireTool(GRANT);

  if (!["not_signed", "signed"].includes(input.saleDeedStatus)) {
    return { error: "Pick whether the sale deed is signed." };
  }
  if (!["not_signed", "signed"].includes(input.caStatus)) {
    return { error: "Pick whether the construction agreement is signed." };
  }
  // Mirrors client_engagements_deed_original_check. Catching it here means
  // a sentence rather than a constraint name.
  if (input.saleDeedStatus !== "signed" && input.saleDeedOriginalWith) {
    return { error: "Only a signed sale deed can have an original with someone." };
  }
  if (input.caStatus !== "signed" && input.caOriginalWith) {
    return { error: "Only a signed construction agreement can have an original with someone." };
  }
  for (const value of [input.plotValue, input.constructionValue]) {
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      return { error: "Values must be zero or more." };
    }
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("client_engagements")
    .update({
      crm_owner_id: input.ownerId,
      sale_deed_status: input.saleDeedStatus,
      sale_deed_original_with: input.saleDeedOriginalWith || null,
      sale_deed_ack: input.saleDeedAck || null,
      sale_deed_signed_on: input.saleDeedSignedOn || null,
      ca_status: input.caStatus,
      ca_original_with: input.caOriginalWith || null,
      ca_ack: input.caAck || null,
      ca_signed_on: input.caSignedOn || null,
      registration_stage: input.registrationStage,
      registration_note: input.registrationNote?.trim() || null,
      registration_on: input.registrationOn || null,
      design_support: input.designSupport?.trim() || null,
      details: input.details?.trim() || null,
      check_in_on: input.checkInOn || null,
      plot_value: input.plotValue,
      construction_value: input.constructionValue,
      updated_by: user.id,
    })
    .eq("id", engagementId);
  if (error) return friendly(error, "Could not save this plot. Try again.");

  revalidateAll();
  return undefined;
}

/**
 * Bottlenecks are saved on their own because they are tick-boxes, not a
 * field in the save-on-blur block — clicking one and waiting for a blur
 * that never comes is how a change gets lost.
 */
export async function setBottlenecks(engagementId: string, values: string[]): Promise<ActionState> {
  await requireTool(GRANT);

  const supabase = await createClient();
  const { error } = await supabase
    .from("client_engagements")
    .update({ bottlenecks: normaliseBottlenecks(values) })
    .eq("id", engagementId);
  if (error) return friendly(error, "Could not save what this plot is waiting on.");

  revalidateAll();
  return undefined;
}

// ---------------------------------------------------------------------
// The payment schedule
// ---------------------------------------------------------------------

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

// ---------------------------------------------------------------------
// Receipts — money in
// ---------------------------------------------------------------------

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
    // Blank means "arrived, not yet filed against a stage" — legal, and
    // the dues arithmetic spreads it across the oldest unpaid rungs.
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
