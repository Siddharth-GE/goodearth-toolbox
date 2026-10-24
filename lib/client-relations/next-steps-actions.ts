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
 * One field per call (a chip saves when tapped). Every export opens with requireTool; RLS (0120) refuses anything past it; nothing throws.
 * An owner is checked against client_relations_team() on every write, so a step is never given to someone who cannot see it.
 */

const GRANT = "/client-relations";

function revalidateAll(): void {
  revalidatePath("/client-relations", "layout");
}

function friendly(error: { message: string; code?: string }, fallback: string): ActionState {
  // A row policy refusing the new row (0123): the plot is someone else's.
  if (error.code === "42501") {
    return { error: "That plot is not one of yours, so this cannot go on it." };
  }
  const state = guardError(error, fallback, [
    "You need the Client Relations app",
    "Only whoever set this action",
    "Who set an action cannot be changed",
    // Delete or cancel (0149).
    "since it was added",
    "cancelled action",
    "already closed",
    "Say why it is cancelled",
    // One owner per side (0125): a step's owner, a side with none, a side left with nobody.
    "step on this plot is",
    "owner yet",
    "instead of nobody",
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
  if (!known(ACTION_TRACKS, input.track)) return { error: "Pick Construction or Interior." };

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

/** Done stamps today (India) and un-done clears it, so they never disagree (0120's CHECK). Any picked date clears "date assumed". */
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
    // Only whoever set it, or a manager, closes or reopens it; its owner marks it finished (0121 holds the same line).
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
    if (!known(ACTION_TRACKS, patch.track)) return { error: "Pick Construction or Interior." };
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

/** Only while nobody has changed it since it was added, by its setter or a manager; the guard (0149) words any refusal. */
export async function deleteNextStep(stepId: string): Promise<ActionState> {
  await requireTool(GRANT);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("client_actions")
    .delete()
    .eq("id", stepId)
    .select("id");
  if (error) return friendly(error, "Could not delete that action. Try again.");
  if (!data?.length) return { error: "That action is no longer here." };

  revalidateAll();
  return undefined;
}

/** Closes it for good with a reason; the database stamps who and when, and marks it done (0149). */
export async function cancelNextStep(stepId: string, reason: string): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const why = reason.trim();
  if (!why) return { error: "Say why it is cancelled." };
  if (why.length > 500) return { error: "Keep the reason under 500 characters." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("client_actions")
    .update({ cancel_reason: why, updated_by: user.id })
    .eq("id", stepId)
    .select("id");
  if (error) return friendly(error, "Could not cancel that action. Try again.");
  if (!data?.length) return { error: "That action is no longer here." };

  revalidateAll();
  return undefined;
}

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
 * Each field is checked against the lists the database CHECKs (0050, 0120). A deed or CA moved off "signed" drops its original's
 * holder in the same write: 0050 refuses a custodian on an unsigned document.
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
      return { error: "Pick an interior stage from the list." };
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
