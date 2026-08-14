"use server";

import { requireTool } from "@/lib/auth/access";
import { getCurrentUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// Applying a standard set needs two reads before it can write — the set's
// activities, and each one's legs from its last run. Both live in
// queries.ts; this is a plain server-to-server import, and it stays a
// one-way street (queries.ts never imports from here).
import { getActivityDefaults, getDepartmentsByTrailSet, listTrailSets } from "./queries";

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
  revalidatePath("/relay/court");
  revalidatePath("/relay/trails");
  if (chainId) revalidatePath(`/relay/trails/${chainId}`);
}

/** A leg IS an activity (0043) — there is no label to type any more. */
export type LegInput = { activityId: string; assigneeId: string; expectedDays: number };

export type OpenTrailInput = {
  projectId: string;
  unitId: string | null;
  /**
   * The trail's single activity — only for a one-step trail, and null
   * for anything longer. Since 0043 the activities live on the LEGS; a
   * twelve-step trail has no one answer to "which activity is it", which
   * is why the column is nullable and the view falls back to the type's
   * name.
   */
  activityId: string | null;
  /** Which trail type this is, if it came from one. */
  trailSetId: string | null;
  title: string | null;
  note: string | null;
  legs: LegInput[];
  /** A trail can be in several at once — a selections handoff is Design and Purchase. */
  departmentIds: string[];
  /** False lays it out without starting it — the queue the founder kept. */
  start?: boolean;
};

export async function openTrail(
  input: OpenTrailInput,
): Promise<{ error?: string; chainId?: string }> {
  await requireTool("/relay");

  if (!input.projectId) return { error: "Pick a project first." };
  if (input.legs.length === 0) return { error: "A trail needs at least one activity." };

  for (const [i, leg] of input.legs.entries()) {
    if (!leg.activityId) return { error: `Step ${i + 1} needs an activity.` };
    if (!leg.assigneeId) return { error: `Step ${i + 1} needs someone to carry it.` };
    if (!Number.isInteger(leg.expectedDays) || leg.expectedDays < 1) {
      return { error: `Step ${i + 1} needs a whole number of days, at least 1.` };
    }
  }

  // The same activity twice in one trail would put the baton through
  // identical steps, which is never what anyone meant and is impossible
  // to read on the route afterwards.
  const seen = new Set(input.legs.map((l) => l.activityId));
  if (seen.size !== input.legs.length) {
    return { error: "The same activity appears twice — each step should be a different one." };
  }

  const supabase = await createClient();
  // The generated RPC arg types are non-null (Postgres has no way to say
  // "this parameter may be null"), but unit_id, title and note all
  // legitimately are — a project-level trail has no unit.
  const { data, error } = await supabase.rpc("open_chain", {
    p_project_id: input.projectId,
    p_unit_id: input.unitId as string,
    p_activity_id: input.activityId as string,
    p_title: input.title as string,
    p_note: input.note as string,
    p_legs: input.legs.map((l) => ({
      activity_id: l.activityId,
      assignee_id: l.assigneeId,
      expected_days: l.expectedDays,
    })),
    p_trail_set_id: input.trailSetId as string,
    // Kept by the founder: a trail can be laid out now and begun when
    // the site is actually ready.
    p_start: input.start !== false,
  });

  if (error) return guardError(error, "Could not open this trail.") ?? {};

  const chainId = data as string;

  // A second call rather than a parameter on open_chain: the trail
  // existing without its tags is a cosmetic gap someone can fix on the
  // trail page, whereas failing the whole open because a department is
  // missing would lose the legs they just typed.
  if (input.departmentIds.length > 0) {
    const { error: deptError } = await supabase.rpc("set_chain_departments", {
      p_chain_id: chainId,
      p_department_ids: input.departmentIds,
    });
    if (deptError) console.error("relay openTrail departments failed:", deptError);
  }

  revalidate();
  return { chainId };
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
  await requireTool("/relay");

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

/**
 * Say the work has gone to the client, or come back.
 *
 * Same leg, same holder, same clock — the only thing that changes is
 * what the screen says is being waited on. The person holding the baton
 * is still the person chasing it, which is why the trail stays in their
 * court with an amber chip rather than disappearing from it.
 */
export async function holdForClient(
  chainId: string,
  fromLeg: number,
  note: string | null,
): Promise<ActionState> {
  await requireTool("/relay");

  const supabase = await createClient();
  const { error } = await supabase.from("pusher_chain_events").insert({
    chain_id: chainId,
    kind: "client_held",
    from_leg: fromLeg,
    to_leg: fromLeg,
    note: note?.trim() || null,
  });

  if (error) return guardError(error, "Could not mark this trail as with the client.");
  revalidate(chainId);
  return undefined;
}

export async function clientReturned(
  chainId: string,
  fromLeg: number,
  note: string | null,
): Promise<ActionState> {
  await requireTool("/relay");

  const supabase = await createClient();
  const { error } = await supabase.from("pusher_chain_events").insert({
    chain_id: chainId,
    kind: "client_returned",
    from_leg: fromLeg,
    to_leg: fromLeg,
    note: note?.trim() || null,
  });

  if (error) return guardError(error, "Could not take this trail back from the client.");
  revalidate(chainId);
  return undefined;
}

export async function finishTrail(
  chainId: string,
  fromLeg: number,
  note: string | null,
): Promise<ActionState> {
  await requireTool("/relay");

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
  await requireTool("/relay");

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
  await requireTool("/relay");

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
  await requireTool("/relay");

  for (const [i, leg] of legs.entries()) {
    if (!leg.activityId) return { error: `Step ${i + 1} needs an activity.` };
    if (!leg.assigneeId) return { error: `Step ${i + 1} needs someone to carry it.` };
    if (!Number.isInteger(leg.expectedDays) || leg.expectedDays < 1) {
      return { error: `Step ${i + 1} needs a whole number of days, at least 1.` };
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("replace_future_legs", {
    p_chain_id: chainId,
    p_legs: legs.map((l) => ({
      activity_id: l.activityId,
      assignee_id: l.assigneeId,
      expected_days: l.expectedDays,
    })),
  });

  if (error) return guardError(error, "Could not change the legs ahead.");
  revalidate(chainId);
  return undefined;
}

/**
 * The project schedule. Only two things are ever typed: a start date and
 * a stage's length in weeks. Every date on screen is worked out from
 * them, so there is nothing here that sets one.
 */
export async function setProjectStart(projectId: string, startDate: string): Promise<ActionState> {
  await requireTool("/relay");

  if (!startDate) return { error: "Pick the date this project starts." };
  if (Number.isNaN(Date.parse(startDate))) return { error: "That is not a date." };

  const supabase = await createClient();
  const user = await getCurrentUser();
  const { error } = await supabase.from("pusher_project_plans").upsert(
    {
      project_id: projectId,
      start_date: startDate,
      created_by: user?.id,
      updated_by: user?.id,
    },
    { onConflict: "project_id" },
  );

  if (error) return { error: "Could not set the start date." };
  revalidatePath("/relay/projects");
  revalidatePath(`/relay/projects/${projectId}`);
  return undefined;
}

export async function addProjectStage(
  projectId: string,
  name: string,
  weeks: number,
): Promise<ActionState> {
  await requireTool("/relay");

  if (!name.trim()) return { error: "A stage needs a name." };
  if (!Number.isInteger(weeks) || weeks < 1) {
    return { error: "A stage needs a whole number of weeks, at least 1." };
  }

  const supabase = await createClient();
  const user = await getCurrentUser();

  // Appended to the end. Reordering is its own action, so adding a stage
  // never silently reshuffles the plan.
  const { data: last } = await supabase
    .from("project_stages")
    .select("sort_order")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("project_stages").insert({
    project_id: projectId,
    name: name.trim(),
    weeks,
    sort_order: (last?.sort_order ?? 0) + 10,
    created_by: user?.id,
    updated_by: user?.id,
  });

  if (error) {
    if (error.code === "23505") return { error: `"${name.trim()}" is already a stage here.` };
    return { error: "Could not add this stage." };
  }

  revalidatePath(`/relay/projects/${projectId}`);
  return undefined;
}

export async function updateProjectStage(
  stageId: string,
  projectId: string,
  name: string,
  weeks: number,
): Promise<ActionState> {
  await requireTool("/relay");

  if (!name.trim()) return { error: "A stage needs a name." };
  if (!Number.isInteger(weeks) || weeks < 1) {
    return { error: "A stage needs a whole number of weeks, at least 1." };
  }

  const supabase = await createClient();
  const user = await getCurrentUser();
  const { error } = await supabase
    .from("project_stages")
    .update({ name: name.trim(), weeks, updated_by: user?.id })
    .eq("id", stageId);

  if (error) {
    if (error.code === "23505") return { error: `"${name.trim()}" is already a stage here.` };
    return guardError(error, "Could not change this stage.");
  }

  revalidatePath(`/relay/projects/${projectId}`);
  return undefined;
}

export async function deleteProjectStage(stageId: string, projectId: string): Promise<ActionState> {
  await requireTool("/relay");

  const supabase = await createClient();
  const { error } = await supabase.from("project_stages").delete().eq("id", stageId);

  // The guard refuses a stage that still has trails in it, and says how
  // many — pass that through rather than a generic failure.
  if (error) return guardError(error, "Could not remove this stage.");

  revalidatePath(`/relay/projects/${projectId}`);
  return undefined;
}

/** Swap a stage with its neighbour. The accepted moveSpaceView race — it self-heals. */
export async function moveProjectStage(
  stageId: string,
  projectId: string,
  direction: "up" | "down",
): Promise<ActionState> {
  await requireTool("/relay");

  const supabase = await createClient();
  const { data: stages } = await supabase
    .from("project_stages")
    .select("id, sort_order")
    .eq("project_id", projectId)
    .order("sort_order")
    .order("id");

  if (!stages) return { error: "Could not reorder the stages." };

  const index = stages.findIndex((s) => s.id === stageId);
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || swapWith < 0 || swapWith >= stages.length) return undefined;

  // Two updates rather than an upsert: nothing is being inserted, and an
  // upsert would demand every NOT NULL column just to change one. There
  // is no unique index on sort_order, so the moment between the two
  // writes where both rows share a value is harmless — reads break ties
  // on id.
  const a = stages[index];
  const b = stages[swapWith];
  const [first, second] = await Promise.all([
    supabase.from("project_stages").update({ sort_order: b.sort_order }).eq("id", a.id),
    supabase.from("project_stages").update({ sort_order: a.sort_order }).eq("id", b.id),
  ]);

  if (first.error || second.error) return { error: "Could not reorder the stages." };
  revalidatePath(`/relay/projects/${projectId}`);
  return undefined;
}

/** Filing a trail under a stage — or taking it out of one. */
export async function setTrailStage(
  chainId: string,
  projectStageId: string | null,
): Promise<ActionState> {
  await requireTool("/relay");

  const supabase = await createClient();
  const user = await getCurrentUser();
  const { error } = await supabase
    .from("pusher_chains")
    .update({ project_stage_id: projectStageId, updated_by: user?.id })
    .eq("id", chainId);

  if (error) return guardError(error, "Could not move this trail to that stage.");
  revalidate(chainId);
  revalidatePath("/relay/projects");
  return undefined;
}

/** Replaces the whole set — the UI edits departments as chips, not one at a time. */
export async function setTrailDepartments(
  chainId: string,
  departmentIds: string[],
): Promise<ActionState> {
  await requireTool("/relay");

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_chain_departments", {
    p_chain_id: chainId,
    p_department_ids: departmentIds,
  });

  if (error) return guardError(error, "Could not change this trail's departments.");
  revalidate(chainId);
  return undefined;
}

export async function createDepartment(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireTool("/relay");

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "A department needs a name." };

  const supabase = await createClient();
  const user = await getCurrentUser();
  const { error } = await supabase
    .from("pusher_departments")
    .insert({ name, created_by: user?.id, updated_by: user?.id });

  if (error) {
    if (error.code === "23505") return { error: `"${name}" is already on the list.` };
    return { error: "Could not add this department." };
  }

  revalidatePath("/relay/activities");
  return undefined;
}

/** Departments are switched off, never deleted — past trails must stay readable. */
export async function setDepartmentActive(id: string, isActive: boolean): Promise<ActionState> {
  await requireTool("/relay");

  const supabase = await createClient();
  const user = await getCurrentUser();
  const { error } = await supabase
    .from("pusher_departments")
    .update({ is_active: isActive, updated_by: user?.id })
    .eq("id", id);

  if (error) return { error: "Could not change this department." };
  revalidatePath("/relay/activities");
  return undefined;
}

export async function createActivity(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireTool("/relay");

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

  revalidatePath("/relay/activities");
  return undefined;
}

/** Activities are switched off, never deleted — trails behind them must stay readable. */
export async function setActivityActive(id: string, isActive: boolean): Promise<ActionState> {
  await requireTool("/relay");

  const supabase = await createClient();
  const user = await getCurrentUser();
  const { error } = await supabase
    .from("pusher_activities")
    .update({ is_active: isActive, updated_by: user?.id })
    .eq("id", id);

  if (error) return { error: "Could not change this activity." };
  revalidatePath("/relay/activities");
  return undefined;
}

// ---------------------------------------------------------------------
// Standard trails at the house level
// ---------------------------------------------------------------------

function revalidateHouse(projectId: string, unitId?: string) {
  revalidatePath("/relay/projects");
  revalidatePath(`/relay/projects/${projectId}`);
  if (unitId) revalidatePath(`/relay/projects/${projectId}/houses/${unitId}`);
  revalidatePath("/relay/trails");
}

/**
 * Lay a standard set down on a house.
 *
 * Every trail arrives QUEUED — created, staffed, and with no clock
 * running. That is the whole point: twelve live trails would be twelve
 * clocks started at once, and the Handover trail at three expected days
 * would be cold within the week, on work nobody meant to begin.
 *
 * One RPC, so a set either lands whole or not at all. The legs come from
 * each activity's last run, exactly as the Open-a-trail form fills them
 * in — a set says WHAT work happens, the last run says who tends to do
 * it. An activity nobody has ever run has no prefill, so it is reported
 * by name rather than silently skipped or landed with an empty leg.
 */
/**
 * Lay a trail type down on a house — ONE trail, whose legs are the
 * type's activities in order (0043).
 *
 * This used to create twelve separate trails. The founder's correction:
 * "the leg is the activity". So a standard villa is one trail with
 * twelve activity-legs and one baton walking them, which also means one
 * clock rather than twelve — the thing the queue was invented to stop.
 *
 * Each activity's person and days come from the type's own defaults,
 * falling back to whoever last carried that activity anywhere. Everything
 * is editable afterwards, and nothing behind the baton ever is.
 */
export async function applyTrailSet(
  projectId: string,
  unitId: string,
  setId: string,
  start = false,
): Promise<ActionState> {
  await requireTool("/relay");

  if (!projectId || !unitId) return { error: "Pick a house first." };
  if (!setId) return { error: "Pick a trail type first." };

  const [sets, defaults, departments] = await Promise.all([
    listTrailSets(true),
    getActivityDefaults(),
    getDepartmentsByTrailSet(),
  ]);
  const set = sets.find((s) => s.id === setId);
  if (!set) return { error: "That trail type no longer exists." };
  if (set.activities.length === 0) {
    return { error: `"${set.name}" has no activities in it yet — add some first.` };
  }

  // An activity nobody has ever carried has no one to put on it. Naming
  // them is the whole value of this message: the fix is to pick someone,
  // and nobody can do that without being told which.
  const unstaffed = set.activities
    .filter((item) => !defaults.get(item.activityId)?.assigneeId)
    .map((item) => item.activityName);

  if (unstaffed.length > 0) {
    return {
      error: `No one has ever carried ${unstaffed.join(", ")}, so there is nobody to put on ${unstaffed.length === 1 ? "it" : "them"}. Open a trail by hand once with ${unstaffed.length === 1 ? "that activity" : "those activities"} and this type will fill itself in after that.`,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("open_chain", {
    p_project_id: projectId,
    p_unit_id: unitId,
    p_activity_id: null as unknown as string,
    p_title: set.name,
    p_note: null as unknown as string,
    p_legs: set.activities.map((item) => ({
      activity_id: item.activityId,
      assignee_id: defaults.get(item.activityId)!.assigneeId,
      expected_days: item.expectedDays,
    })),
    p_trail_set_id: setId,
    p_start: start,
  });

  if (error) return guardError(error, "Could not add this trail type.") ?? {};

  const chainId = typeof data === "string" ? data : undefined;
  const departmentIds = departments.get(setId) ?? [];
  if (chainId && departmentIds.length > 0) {
    // Best effort, and deliberately not fatal: the trail exists and is
    // correct without its department tags, and failing the whole action
    // here would leave the founder staring at an error beside a trail
    // that plainly did get created.
    await supabase.rpc("set_chain_departments", {
      p_chain_id: chainId,
      p_department_ids: departmentIds,
    });
  }

  revalidateHouse(projectId, unitId);
  return undefined;
}

export async function startTrail(chainId: string, projectId: string, unitId: string) {
  await requireTool("/relay");
  if (!chainId) return { error: "Pick a trail first." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("start_chain", { p_chain_id: chainId });
  if (error) return guardError(error, "Could not start this trail.") ?? {};

  revalidate(chainId);
  revalidateHouse(projectId, unitId);
  return undefined;
}

/**
 * Throw away a queued trail — the one honest exception to "never delete
 * a chain" (0036 §7), and only because it has no history to destroy.
 *
 * The database refuses the moment it has started, so the button is a
 * courtesy and the guard is the boundary, as everywhere else here.
 */
export async function discardTrail(chainId: string, projectId: string, unitId: string) {
  await requireTool("/relay");
  if (!chainId) return { error: "Pick a trail first." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("discard_chain", { p_chain_id: chainId });
  if (error) return guardError(error, "Could not remove this trail.") ?? {};

  revalidateHouse(projectId, unitId);
  return undefined;
}

export async function createTrailSet(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireTool("/relay");

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "A trail type needs a name." };

  const supabase = await createClient();
  const user = await getCurrentUser();
  const { error } = await supabase
    .from("pusher_trail_sets")
    .insert({ name, created_by: user?.id, updated_by: user?.id });

  if (error) {
    if (error.code === "23505") return { error: `"${name}" is already a trail type.` };
    return { error: "Could not add this trail type." };
  }

  revalidatePath("/relay/sets");
  return undefined;
}

/** Types are switched off, never deleted — the trails they built stay readable. */
export async function setTrailSetActive(id: string, isActive: boolean): Promise<ActionState> {
  await requireTool("/relay");

  const supabase = await createClient();
  const user = await getCurrentUser();
  const { error } = await supabase
    .from("pusher_trail_sets")
    .update({ is_active: isActive, updated_by: user?.id })
    .eq("id", id);

  if (error) return { error: "Could not change this trail type." };
  revalidatePath("/relay/sets");
  return undefined;
}

/**
 * Replace a set's activities wholesale — which is also how it is
 * reordered, because sort_order is rewritten from the array's position.
 *
 * Delete-then-insert rather than a diff: the list is a dozen rows at
 * most, and a diff would have to reason about a row that moved AND
 * changed, which is exactly where an ordering bug hides.
 */
export async function setTrailSetActivities(
  setId: string,
  items: { activityId: string; expectedDays: number }[],
): Promise<ActionState> {
  await requireTool("/relay");
  if (!setId) return { error: "Pick a trail type first." };

  // The same activity twice would send the baton through identical
  // steps — the database refuses it, and this says so first.
  if (new Set(items.map((i) => i.activityId)).size !== items.length) {
    return { error: "That activity is already in this type." };
  }
  for (const item of items) {
    if (!Number.isInteger(item.expectedDays) || item.expectedDays < 1) {
      return { error: "Each activity needs a whole number of days, at least 1." };
    }
  }

  const supabase = await createClient();
  const user = await getCurrentUser();

  const { error: clearError } = await supabase
    .from("pusher_trail_set_items")
    .delete()
    .eq("set_id", setId);
  if (clearError) return { error: "Could not update this trail type." };

  if (items.length > 0) {
    const { error } = await supabase.from("pusher_trail_set_items").insert(
      items.map((item, i) => ({
        set_id: setId,
        activity_id: item.activityId,
        expected_days: item.expectedDays,
        sort_order: (i + 1) * 10,
        created_by: user?.id,
        updated_by: user?.id,
      })),
    );
    if (error) return { error: "Could not update this trail type." };
  }

  revalidatePath("/relay/sets");
  return undefined;
}
