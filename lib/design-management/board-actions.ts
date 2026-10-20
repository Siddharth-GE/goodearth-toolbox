"use server";

import { revalidatePath } from "next/cache";

import { requireTool } from "@/lib/auth/access";
import { guardError } from "@/lib/db-error";
import { closeRight, isActionStatus } from "@/lib/next-steps/rules";
import { notifyAfter } from "@/lib/push/send";
import { createClient } from "@/lib/supabase/server";

import { isStepStatus } from "./board";
import { GRANT } from "./shared";

// Type-only and never re-exported (`npm run check:actions`).
import type { ActionState } from "@/lib/action-state";
import type { TablesUpdate } from "@/lib/supabase/database.types";

/**
 * Every export opens with requireTool and returns an ActionState. The database holds every rule (0126); this file says the same in a sentence first where it can.
 * A pass and "set where it is" touch several rows, so each is one database function: one transaction, never half done.
 */

function revalidateAll(): void {
  // Layout revalidate: an exact path would refresh only the welcome.
  revalidatePath("/design-management", "layout");
}

function friendly(error: { message: string }, fallback: string): ActionState {
  const state = guardError(error, fallback, [
    "You need the Design Management app",
    "Say why it is going back",
    "That stage is not on the design board",
    "A stage cannot move",
    "Who started a stage",
    "That person does not hold Design Management",
    "Only whoever set this action",
    "Who set an action cannot be changed",
    "This villa has already started",
    "That stage has not started on this villa",
    "Pick a different stage",
  ]);
  if (state?.error === fallback) console.error("Design board write failed:", error);
  return state;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function cleanPeople(peopleIds: string[]): string[] {
  return [...new Set(peopleIds.filter(Boolean))];
}

/** Everyone just put on a stage hears on their phone. The write has already stood; this never fails it. */
async function tellPeople(
  supabase: Awaited<ReturnType<typeof createClient>>,
  unitId: string,
  stageId: string,
  people: string[],
  actorId: string,
): Promise<void> {
  const [unit, stage] = await Promise.all([
    supabase.from("units").select("name").eq("id", unitId).maybeSingle(),
    supabase.from("design_stages").select("name").eq("id", stageId).maybeSingle(),
  ]);
  if (unit.error || stage.error) {
    console.error("Design board notice read failed:", unit.error ?? stage.error);
    return;
  }
  notifyAfter(people, actorId, {
    title: "A design stage is yours",
    body:
      [unit.data?.name, stage.data?.name].filter(Boolean).join(": ") || "Open the design board.",
    url: `/design-management/villas/${unitId}`,
  });
}

/** A stage with no step starts with this status. Revising needs a reason (the database insists too). */
export async function setStepStatus(
  unitId: string,
  stageId: string,
  status: string,
  reason?: string,
): Promise<ActionState> {
  await requireTool(GRANT);
  if (!isStepStatus(status)) return { error: "Pick a status from the list." };
  const why = reason?.trim() ?? "";
  if (status === "revising" && !why) return { error: "Say why it is going back for revision." };
  if (why.length > 500) return { error: "Keep the reason under 500 characters." };

  const supabase = await createClient();
  const { data: current, error: readError } = await supabase
    .from("design_steps")
    .select("id, status")
    .eq("unit_id", unitId)
    .eq("design_stage_id", stageId)
    .maybeSingle();
  if (readError) return friendly(readError, "Could not read that stage. Try again.");
  if (!current && status === "not_started") return undefined;

  const { error } = current
    ? await supabase
        .from("design_steps")
        .update({ status, reason: status === "revising" ? why : null })
        .eq("id", current.id)
    : await supabase.from("design_steps").insert({
        unit_id: unitId,
        design_stage_id: stageId,
        status,
        reason: status === "revising" ? why : null,
      });
  if (error) return friendly(error, "Could not save that stage. Try again.");

  revalidateAll();
  return undefined;
}

export async function setStepNote(stepId: string, note: string): Promise<ActionState> {
  await requireTool(GRANT);
  const text = note.trim();
  if (text.length > 500) return { error: "Keep the note under 500 characters." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("design_steps")
    .update({ note: text || null })
    .eq("id", stepId);
  if (error) return friendly(error, "Could not save the note. Try again.");

  revalidateAll();
  return undefined;
}

export async function addStepPerson(stepId: string, personId: string): Promise<ActionState> {
  const user = await requireTool(GRANT);
  if (!personId) return { error: "Pick who to put on it." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("design_step_people")
    .insert({ step_id: stepId, profile_id: personId });
  if (error) {
    if ("code" in error && error.code === "23505") return { error: "They are already on it." };
    return friendly(error, "Could not put them on it. Try again.");
  }

  const { data: step, error: stepError } = await supabase
    .from("design_steps")
    .select("unit_id, design_stage_id")
    .eq("id", stepId)
    .maybeSingle();
  if (stepError) console.error("Design board notice read failed:", stepError);
  else if (step)
    await tellPeople(supabase, step.unit_id, step.design_stage_id, [personId], user.id);

  revalidateAll();
  return undefined;
}

export async function removeStepPerson(stepId: string, personId: string): Promise<ActionState> {
  await requireTool(GRANT);
  const supabase = await createClient();
  const { error } = await supabase
    .from("design_step_people")
    .delete()
    .eq("step_id", stepId)
    .eq("profile_id", personId);
  if (error) return friendly(error, "Could not take them off. Try again.");

  revalidateAll();
  return undefined;
}

/** Start a stage at any time, with the people who take it. */
export async function startStep(
  unitId: string,
  stageId: string,
  peopleIds: string[],
): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const people = cleanPeople(peopleIds);
  if (people.length === 0) return { error: "Pick who takes it." };

  const supabase = await createClient();
  const { data: current, error: readError } = await supabase
    .from("design_steps")
    .select("id")
    .eq("unit_id", unitId)
    .eq("design_stage_id", stageId)
    .maybeSingle();
  if (readError) return friendly(readError, "Could not read that stage. Try again.");

  let stepId = current?.id ?? null;
  if (stepId) {
    const { error } = await supabase
      .from("design_steps")
      .update({ status: "working", reason: null })
      .eq("id", stepId);
    if (error) return friendly(error, "Could not start that stage. Try again.");
  } else {
    const { data, error } = await supabase
      .from("design_steps")
      .insert({ unit_id: unitId, design_stage_id: stageId, status: "working" })
      .select("id")
      .single();
    if (error) return friendly(error, "Could not start that stage. Try again.");
    stepId = data.id;
  }

  const { error: peopleError } = await supabase.from("design_step_people").upsert(
    people.map((personId) => ({ step_id: stepId, profile_id: personId })),
    { onConflict: "step_id,profile_id", ignoreDuplicates: true },
  );
  revalidateAll();
  if (peopleError) {
    const state = friendly(peopleError, "Could not put everyone on it.");
    return { error: `Started. ${state?.error ?? ""} Put the right people on it from the stage.` };
  }
  await tellPeople(supabase, unitId, stageId, people, user.id);
  return undefined;
}

export async function passStep(input: {
  unitId: string;
  fromStageId: string;
  toStageId: string;
  peopleIds: string[];
  note?: string;
}): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const people = cleanPeople(input.peopleIds);
  if (!input.toStageId) return { error: "Pick the stage it goes to." };
  if (people.length === 0) return { error: "Pick who takes it." };
  const note = input.note?.trim() ?? "";
  if (note.length > 500) return { error: "Keep the note under 500 characters." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("design_pass_step", {
    p_unit: input.unitId,
    p_from: input.fromStageId,
    p_to: input.toStageId,
    p_people: people,
    p_note: note,
  });
  if (error) return friendly(error, "Could not pass it on. Try again.");

  await tellPeople(supabase, input.unitId, input.toStageId, people, user.id);
  revalidateAll();
  return undefined;
}

/** Brings a villa in at the stage it has reached: earlier board stages Done, this one Working. One transaction, only on a villa with nothing started. */
export async function setWhereItIs(
  unitId: string,
  stageId: string,
  peopleIds: string[],
): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const people = cleanPeople(peopleIds);
  if (!stageId) return { error: "Pick the stage it is at." };
  if (people.length === 0) return { error: "Pick who is on it." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("design_set_where", {
    p_unit: unitId,
    p_stage: stageId,
    p_people: people,
  });
  if (error) return friendly(error, "Could not set where it is. Try again.");

  await tellPeople(supabase, unitId, stageId, people, user.id);
  revalidateAll();
  return undefined;
}

export type NewDesignAction = {
  unitId: string | null;
  stageId: string | null;
  action: string;
  ownerId: string;
  dueOn: string | null;
};

export async function addDesignAction(input: NewDesignAction): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const action = input.action.trim();
  if (!action) return { error: "Write what needs to happen first." };
  if (action.length > 500) return { error: "Keep it under 500 characters — notes take the rest." };
  if (!input.ownerId) return { error: "Pick who owns it." };
  if (input.dueOn && !validDate(input.dueOn)) return { error: "That date does not look right." };

  const supabase = await createClient();
  const { error } = await supabase.from("design_actions").insert({
    unit_id: input.unitId || null,
    design_stage_id: input.stageId || null,
    action,
    owner_id: input.ownerId,
    due_on: input.dueOn || null,
    created_by: user.id,
    updated_by: user.id,
  });
  if (error) return friendly(error, "Could not add that. Try again.");

  revalidateAll();
  return undefined;
}

export type DesignActionPatch = {
  action?: string;
  ownerId?: string;
  dueOn?: string | null;
  status?: string;
  notes?: string | null;
  unitId?: string | null;
  stageId?: string | null;
};

/** Only whoever set it, or a manager, closes or reopens it; its owner marks it finished (0126 holds the same line). */
export async function updateDesignAction(
  actionId: string,
  patch: DesignActionPatch,
): Promise<ActionState> {
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
    update.owner_id = patch.ownerId;
  }
  if (patch.dueOn !== undefined) {
    if (patch.dueOn && !validDate(patch.dueOn)) return { error: "That date does not look right." };
    update.due_on = patch.dueOn || null;
  }
  if (patch.status !== undefined) {
    if (!isActionStatus(patch.status)) return { error: "Pick a status from the list." };
    const { data: current, error: readError } = await supabase
      .from("design_actions")
      .select("status, owner_id, created_by")
      .eq("id", actionId)
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
  }
  if (patch.notes !== undefined) {
    const notes = patch.notes?.trim() ?? "";
    if (notes.length > 4000) return { error: "Notes can be up to 4,000 characters." };
    update.notes = notes || null;
  }
  if (patch.unitId !== undefined) update.unit_id = patch.unitId || null;
  if (patch.stageId !== undefined) update.design_stage_id = patch.stageId || null;

  const { error } = await supabase
    .from("design_actions")
    .update(update as TablesUpdate<"design_actions">)
    .eq("id", actionId);
  if (error) return friendly(error, "Could not save that change. Try again.");

  revalidateAll();
  return undefined;
}
