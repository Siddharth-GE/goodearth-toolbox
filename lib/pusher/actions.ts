"use server";

import { requireTool } from "@/lib/auth/access";
import { getCurrentUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// Type-only import, and deliberately NOT re-exported — a bare
// `export type { X };` in a "use server" file crashes every action in its
// compiled chunk at load time (npm run check:actions enforces this).
import type { ActionState } from "@/lib/action-state";

/**
 * Writes for Pusher.
 *
 * The relay's rules live in the database (migration 0036 §8–§9), not
 * here. These actions exist to turn a refusal into something a person can
 * read and to revalidate the right pages — a write that skips them is
 * still stopped by the guard.
 *
 * Pushing, bouncing and finishing are ONE INSERT each: the guard stamps
 * the actor, the timestamp, the sequence number and the snapshots. That
 * is deliberate, and worth preserving — there is nothing for a caller to
 * get wrong except which trail and which leg.
 */

/**
 * The guard's messages are written to be read by a person; pass the known
 * ones straight through instead of burying them under "try again".
 */
function guardError(error: { message: string }, fallback: string): ActionState {
  const message = error.message ?? "";
  if (
    message.includes("baton") ||
    message.includes("trail") ||
    message.includes("leg") ||
    message.includes("switched off") ||
    message.includes("permanent") ||
    message.includes("signed-in")
  ) {
    return { error: message.replace(/^.*?:\s*/, "") };
  }
  return { error: fallback };
}

function revalidate(chainId?: string) {
  revalidatePath("/pusher");
  revalidatePath("/pusher/trails");
  if (chainId) revalidatePath(`/pusher/trails/${chainId}`);
}

export type LegInput = { label: string; assigneeId: string; expectedDays: number };

export type OpenTrailInput = {
  projectId: string;
  unitId: string | null;
  activityId: string;
  title: string | null;
  note: string | null;
  legs: LegInput[];
};

export async function openTrail(
  input: OpenTrailInput,
): Promise<{ error?: string; chainId?: string }> {
  await requireTool("/pusher");

  if (!input.projectId) return { error: "Pick a project first." };
  if (!input.activityId) return { error: "Pick an activity first." };
  if (input.legs.length === 0) return { error: "A trail needs at least one leg." };

  for (const [i, leg] of input.legs.entries()) {
    if (!leg.label.trim()) return { error: `Leg ${i + 1} needs a name.` };
    if (!leg.assigneeId) return { error: `Leg ${i + 1} needs someone to carry it.` };
    if (!Number.isInteger(leg.expectedDays) || leg.expectedDays < 1) {
      return { error: `Leg ${i + 1} needs a whole number of days, at least 1.` };
    }
  }

  const supabase = await createClient();
  // The generated RPC arg types are non-null (Postgres has no way to say
  // "this parameter may be null"), but unit_id, title and note all
  // legitimately are — a project-level trail has no unit.
  const { data, error } = await supabase.rpc("open_chain", {
    p_project_id: input.projectId,
    p_unit_id: input.unitId as string,
    p_activity_id: input.activityId,
    p_title: input.title as string,
    p_note: input.note as string,
    p_legs: input.legs.map((l) => ({
      label: l.label.trim(),
      assignee_id: l.assigneeId,
      expected_days: l.expectedDays,
    })),
  });

  if (error) return guardError(error, "Could not open this trail.") ?? {};

  revalidate();
  return { chainId: data as string };
}

/**
 * `fromLeg` is the caller's optimistic-concurrency token: "I am acting on
 * the leg I was looking at". If someone else moved the baton in the
 * meantime the guard says so by name rather than quietly acting on the
 * wrong leg.
 */
export async function pushBaton(
  chainId: string,
  fromLeg: number,
  note: string | null,
): Promise<ActionState> {
  await requireTool("/pusher");

  const supabase = await createClient();
  const { error } = await supabase.from("pusher_chain_events").insert({
    chain_id: chainId,
    kind: "pushed",
    from_leg: fromLeg,
    to_leg: fromLeg + 1,
    note: note?.trim() || null,
  });

  if (error) return guardError(error, "Could not push this trail forward.");
  revalidate(chainId);
  return undefined;
}

export async function finishTrail(
  chainId: string,
  fromLeg: number,
  note: string | null,
): Promise<ActionState> {
  await requireTool("/pusher");

  const supabase = await createClient();
  const { error } = await supabase.from("pusher_chain_events").insert({
    chain_id: chainId,
    kind: "completed",
    from_leg: fromLeg,
    note: note?.trim() || null,
  });

  if (error) return guardError(error, "Could not finish this trail.");
  revalidate(chainId);
  return undefined;
}

export async function bounceBaton(
  chainId: string,
  fromLeg: number,
  toLeg: number,
  reason: string,
  note: string,
): Promise<ActionState> {
  await requireTool("/pusher");

  // The database refuses these too (0036 §6) — checked here so the form
  // can say so without a round trip that reads like a crash.
  if (!reason) return { error: "Pick a reason — a bounce is never silent." };
  if (!note.trim()) return { error: "Say what needs to change before it comes back." };
  if (toLeg >= fromLeg) return { error: "A bounce goes backwards, to a leg the trail has passed." };

  const supabase = await createClient();
  const { error } = await supabase.from("pusher_chain_events").insert({
    chain_id: chainId,
    kind: "bounced",
    from_leg: fromLeg,
    to_leg: toLeg,
    reason,
    note: note.trim(),
  });

  if (error) return guardError(error, "Could not bounce this trail back.");
  revalidate(chainId);
  return undefined;
}

/** Admin only, and enforced in the RPC and both guards, not just here. */
export async function handBaton(
  chainId: string,
  toUserId: string,
  note: string,
): Promise<ActionState> {
  await requireTool("/pusher");

  const user = await getCurrentUser();
  if (user?.profile?.role !== "admin") {
    return { error: "Only an admin can hand a baton to someone else." };
  }
  if (!toUserId) return { error: "Say who is taking the baton." };
  if (!note.trim()) return { error: "Say why the baton is changing hands." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("hand_baton", {
    p_chain_id: chainId,
    p_to_user: toUserId,
    p_note: note.trim(),
  });

  if (error) return guardError(error, "Could not hand this baton over.");
  revalidate(chainId);
  return undefined;
}

/** Rewrites the legs still ahead of the baton. Everything behind it is history. */
export async function replaceFutureLegs(chainId: string, legs: LegInput[]): Promise<ActionState> {
  await requireTool("/pusher");

  for (const [i, leg] of legs.entries()) {
    if (!leg.label.trim()) return { error: `Leg ${i + 1} needs a name.` };
    if (!leg.assigneeId) return { error: `Leg ${i + 1} needs someone to carry it.` };
    if (!Number.isInteger(leg.expectedDays) || leg.expectedDays < 1) {
      return { error: `Leg ${i + 1} needs a whole number of days, at least 1.` };
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("replace_future_legs", {
    p_chain_id: chainId,
    p_legs: legs.map((l) => ({
      label: l.label.trim(),
      assignee_id: l.assigneeId,
      expected_days: l.expectedDays,
    })),
  });

  if (error) return guardError(error, "Could not change the legs ahead.");
  revalidate(chainId);
  return undefined;
}

export async function createActivity(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireTool("/pusher");

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "An activity needs a name." };

  const supabase = await createClient();
  const user = await getCurrentUser();
  const { error } = await supabase
    .from("pusher_activities")
    .insert({ name, created_by: user?.id, updated_by: user?.id });

  if (error) {
    if (error.code === "23505") return { error: `"${name}" is already on the list.` };
    return { error: "Could not add this activity." };
  }

  revalidatePath("/pusher/activities");
  return undefined;
}

/** Activities are switched off, never deleted — trails behind them must stay readable. */
export async function setActivityActive(id: string, isActive: boolean): Promise<ActionState> {
  await requireTool("/pusher");

  const supabase = await createClient();
  const user = await getCurrentUser();
  const { error } = await supabase
    .from("pusher_activities")
    .update({ is_active: isActive, updated_by: user?.id })
    .eq("id", id);

  if (error) return { error: "Could not change this activity." };
  revalidatePath("/pusher/activities");
  return undefined;
}
