"use server";

import { revalidatePath } from "next/cache";

import { requireTool } from "@/lib/auth/access";
import { guardError } from "@/lib/db-error";
import { todayInIndia } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { closeRight } from "./next-steps";
import {
  ACKNOWLEDGEMENTS,
  ACTION_STATUSES,
  ACTION_TRACKS,
  DEED_STATUSES,
  KAADAL_STAGES,
  ORIGINAL_WITH,
  REGISTRATION_STAGES,
  normaliseBottlenecks,
} from "./stages";

// Type-only and never re-exported (`npm run check:actions`).
import type { ActionState } from "@/lib/action-state";
import type { TablesUpdate } from "@/lib/supabase/database.types";

/**
 * Writes for the Saarang tracker's screens inside Client Relations — an
 * action's every field, and a plot's, one at a time (root plan.md,
 * seventh piece).
 *
 * One field per call, the tracker's PATCH: a chip saves the moment it is
 * tapped, so there is no form to half-fill. Every export opens with
 * requireTool("/client-relations"); RLS (0120) refuses anything past it;
 * nothing throws. An action's owner is checked against
 * client_relations_team() on every write, so a step is never given to
 * someone who cannot see it.
 */

const GRANT = "/client-relations";

function revalidateAll(): void {
  revalidatePath("/client-relations", "layout");
}

function friendly(error: { message: string }, fallback: string): ActionState {
  const state = guardError(error, fallback, [
    "You need the Client Relations app",
    "Only whoever set this action",
    "Who set an action cannot be changed",
  ]);
  if (state?.error === fallback) console.error("Client Relations write failed:", error);
  return state;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const known = (options: readonly { value: string }[], value: string) =>
  options.some((option) => option.value === value);

async function isOnTeam(
  supabase: Awaited<ReturnType<typeof createClient>>,
  personId: string,
): Promise<boolean | ActionState> {
  const { data, error } = await supabase.rpc("client_relations_team");
  if (error) return friendly(error, "Could not check who is on the team. Try again.");
  return (data ?? []).some((row) => row.id === personId);
}

// ---------------------------------------------------------------------
// Actions — the next steps
// ---------------------------------------------------------------------

export type NewStep = {
  engagementId: string | null;
  action: string;
  ownerId: string;
  dueOn: string | null;
  track: string;
};

export async function addNextStep(input: NewStep): Promise<ActionState> {
  const user = await requireTool(GRANT);

  const action = input.action.trim();
  if (!action) return { error: "Write what needs to happen first." };
  if (action.length > 500) return { error: "Keep it under 500 characters — notes take the rest." };
  if (!input.ownerId) return { error: "Pick who owns it." };
  if (input.dueOn && !validDate(input.dueOn)) return { error: "That date does not look right." };
  if (!known(ACTION_TRACKS, input.track)) return { error: "Pick Sales or Kaadal." };

  const supabase = await createClient();
  const onTeam = await isOnTeam(supabase, input.ownerId);
  if (typeof onTeam !== "boolean") return onTeam;
  if (!onTeam) return { error: "That person is not on the Client Relations team." };

  const { error } = await supabase.from("client_actions").insert({
    engagement_id: input.engagementId || null,
    action,
    owner_id: input.ownerId,
    due_on: input.dueOn || null,
    track: input.track,
    created_by: user.id,
    updated_by: user.id,
  });
  if (error) return friendly(error, "Could not add that. Try again.");

  revalidateAll();
  return undefined;
}

export type StepPatch = {
  action?: string;
  ownerId?: string;
  dueOn?: string | null;
  status?: string;
  track?: string;
  notes?: string | null;
  engagementId?: string | null;
};

/**
 * One change to one action. Done stamps today (in India) and un-done
 * clears it, so the two can never disagree (0120's CHECK holds the same
 * line). Any date a person picks clears "date assumed".
 */
export async function updateNextStep(stepId: string, patch: StepPatch): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const supabase = await createClient();
  const update: Record<string, unknown> = { updated_by: user.id };

  if (patch.action !== undefined) {
    const action = patch.action.trim();
    if (!action) return { error: "An action needs some words. Mark it done instead." };
    if (action.length > 500)
      return { error: "Keep it under 500 characters — notes take the rest." };
    update.action = action;
  }
  if (patch.ownerId !== undefined) {
    if (!patch.ownerId) return { error: "Pick who owns it." };
    const onTeam = await isOnTeam(supabase, patch.ownerId);
    if (typeof onTeam !== "boolean") return onTeam;
    if (!onTeam) return { error: "That person is not on the Client Relations team." };
    update.owner_id = patch.ownerId;
  }
  if (patch.dueOn !== undefined) {
    if (patch.dueOn && !validDate(patch.dueOn)) return { error: "That date does not look right." };
    update.due_on = patch.dueOn || null;
    update.due_assumed = false;
  }
  if (patch.status !== undefined) {
    if (!known(ACTION_STATUSES, patch.status)) return { error: "Pick a status from the list." };
    // Only whoever set it, or a manager, closes it or opens it again; its
    // owner marks it finished for them (0121 — the database holds the same
    // line, this says it in a sentence first).
    const { data: current, error: readError } = await supabase
      .from("client_actions")
      .select("status, owner_id, created_by")
      .eq("id", stepId)
      .maybeSingle();
    if (readError) return friendly(readError, "Could not read that action. Try again.");
    if (!current) return { error: "That action no longer exists." };
    const right = closeRight(
      { createdBy: current.created_by, ownerId: current.owner_id },
      { id: user.id, isManager: user.profile?.role === "admin" },
    );
    const closing = patch.status === "done" || current.status === "done";
    if (closing && patch.status !== current.status && right !== "close") {
      return {
        error:
          right === "finish"
            ? "Only whoever set this action, or a manager, can close it. Tick it to mark it finished for them."
            : "Only whoever set this action, or a manager, can close it.",
      };
    }
    if (patch.status === "awaiting_confirmation" && right === "none") {
      return { error: "Only its owner marks an action finished." };
    }
    update.status = patch.status;
    update.done_on = patch.status === "done" ? todayInIndia() : null;
  }
  if (patch.track !== undefined) {
    if (!known(ACTION_TRACKS, patch.track)) return { error: "Pick Sales or Kaadal." };
    update.track = patch.track;
  }
  if (patch.notes !== undefined) {
    const notes = patch.notes?.trim() ?? "";
    if (notes.length > 4000) return { error: "Notes can be up to 4,000 characters." };
    update.notes = notes || null;
  }
  if (patch.engagementId !== undefined) update.engagement_id = patch.engagementId || null;

  const { error } = await supabase
    .from("client_actions")
    .update(update as TablesUpdate<"client_actions">)
    .eq("id", stepId);
  if (error) return friendly(error, "Could not save that change. Try again.");

  revalidateAll();
  return undefined;
}

// ---------------------------------------------------------------------
// A plot, one field at a time
// ---------------------------------------------------------------------

export type PlotPatch = {
  ownerId?: string | null;
  saleDeedStatus?: string;
  saleDeedOriginalWith?: string | null;
  saleDeedAck?: string | null;
  saleDeedSignedOn?: string | null;
  caStatus?: string;
  caOriginalWith?: string | null;
  caAck?: string | null;
  caSignedOn?: string | null;
  bottlenecks?: string[];
  registrationStage?: string;
  registrationNote?: string | null;
  registrationOn?: string | null;
  progressStageId?: string | null;
  /** The three design checks: true stamps today, false clears. */
  designConfirmed?: boolean;
  permit?: boolean;
  workingDrawing?: boolean;
  kaadalStage?: string | null;
  kaadalOwnerId?: string | null;
  kaadalNote?: string | null;
  designSupport?: string | null;
  details?: string | null;
  checkInOn?: string | null;
  plotValue?: number | null;
  constructionValue?: number | null;
};

function optionalDate(value: string | null | undefined): string | null | false {
  if (!value) return null;
  return validDate(value) ? value : false;
}

/**
 * The tracker's PATCH /deals/:id, checked field by field against the same
 * lists the database CHECKs (0050, 0120). A deed or CA moved off "signed"
 * drops who holds its original in the same write — 0050 refuses a
 * custodian on an unsigned document, and a chip should never meet a
 * constraint name.
 */
export async function updatePlot(engagementId: string, patch: PlotPatch): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const supabase = await createClient();
  const update: Record<string, unknown> = { updated_by: user.id };
  const today = todayInIndia();

  if (patch.ownerId !== undefined) {
    if (patch.ownerId) {
      const onTeam = await isOnTeam(supabase, patch.ownerId);
      if (typeof onTeam !== "boolean") return onTeam;
      if (!onTeam) return { error: "That person is not on the Client Relations team." };
    }
    update.crm_owner_id = patch.ownerId || null;
  }
  if (patch.kaadalOwnerId !== undefined) {
    if (patch.kaadalOwnerId) {
      const onTeam = await isOnTeam(supabase, patch.kaadalOwnerId);
      if (typeof onTeam !== "boolean") return onTeam;
      if (!onTeam) return { error: "That person is not on the Client Relations team." };
    }
    update.kaadal_owner_id = patch.kaadalOwnerId || null;
  }

  for (const [key, column, label] of [
    ["saleDeedStatus", "sale_deed_status", "sale deed"],
    ["caStatus", "ca_status", "construction agreement"],
  ] as const) {
    const value = patch[key];
    if (value === undefined) continue;
    if (!known(DEED_STATUSES, value)) return { error: `Pick where the ${label} stands.` };
    update[column] = value;
    if (value !== "signed") {
      update[key === "saleDeedStatus" ? "sale_deed_original_with" : "ca_original_with"] = null;
    }
  }
  for (const [key, column] of [
    ["saleDeedOriginalWith", "sale_deed_original_with"],
    ["caOriginalWith", "ca_original_with"],
  ] as const) {
    const value = patch[key];
    if (value === undefined) continue;
    if (value && !known(ORIGINAL_WITH, value)) return { error: "Pick who holds the original." };
    update[column] = value || null;
  }
  for (const [key, column] of [
    ["saleDeedAck", "sale_deed_ack"],
    ["caAck", "ca_ack"],
  ] as const) {
    const value = patch[key];
    if (value === undefined) continue;
    if (value && !known(ACKNOWLEDGEMENTS, value)) return { error: "Pick an acknowledgement." };
    update[column] = value || null;
  }
  for (const [key, column] of [
    ["saleDeedSignedOn", "sale_deed_signed_on"],
    ["caSignedOn", "ca_signed_on"],
    ["registrationOn", "registration_on"],
    ["checkInOn", "check_in_on"],
  ] as const) {
    if (patch[key] === undefined) continue;
    const value = optionalDate(patch[key]);
    if (value === false) return { error: "That date does not look right." };
    update[column] = value;
  }
  for (const [key, column] of [
    ["designConfirmed", "design_confirmed_on"],
    ["permit", "permit_on"],
    ["workingDrawing", "working_drawing_on"],
  ] as const) {
    if (patch[key] === undefined) continue;
    update[column] = patch[key] ? today : null;
  }
  if (patch.bottlenecks !== undefined) update.bottlenecks = normaliseBottlenecks(patch.bottlenecks);
  if (patch.registrationStage !== undefined) {
    if (!known(REGISTRATION_STAGES, patch.registrationStage)) {
      return { error: "Pick where registration stands." };
    }
    update.registration_stage = patch.registrationStage;
  }
  if (patch.progressStageId !== undefined) update.progress_stage_id = patch.progressStageId || null;
  if (patch.kaadalStage !== undefined) {
    if (patch.kaadalStage && !known(KAADAL_STAGES, patch.kaadalStage)) {
      return { error: "Pick a Kaadal stage from the list." };
    }
    update.kaadal_stage = patch.kaadalStage || null;
  }
  for (const [key, column, max] of [
    ["kaadalNote", "kaadal_note", 500],
    ["registrationNote", "registration_note", 4000],
    ["designSupport", "design_support", 4000],
    ["details", "details", 8000],
  ] as const) {
    if (patch[key] === undefined) continue;
    const value = patch[key]?.trim() ?? "";
    if (value.length > max)
      return { error: `Keep it under ${max.toLocaleString("en-IN")} characters.` };
    update[column] = value || null;
  }
  for (const [key, column] of [
    ["plotValue", "plot_value"],
    ["constructionValue", "construction_value"],
  ] as const) {
    const value = patch[key];
    if (value === undefined) continue;
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      return { error: "Values must be zero or more." };
    }
    update[column] = value;
  }

  const { error } = await supabase
    .from("client_engagements")
    .update(update as TablesUpdate<"client_engagements">)
    .eq("id", engagementId);
  if (error) {
    if (error.code === "23514" && /original/.test(error.message)) {
      return {
        error: "Only a signed document has an original with someone. Mark it signed first.",
      };
    }
    return friendly(error, "Could not save this plot. Try again.");
  }

  revalidateAll();
  return undefined;
}

/** The client's name, typed in place on a plot's header. */
export async function renameClient(clientId: string, name: string): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const trimmed = name.trim();
  if (!trimmed) return { error: "A client needs a name." };
  if (trimmed.length > 200) return { error: "Keep the name under 200 characters." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("clients")
    .update({ name: trimmed, updated_by: user.id })
    .eq("id", clientId);
  if (error) return friendly(error, "Could not rename the client. Try again.");

  revalidateAll();
  return undefined;
}
