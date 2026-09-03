import "server-only";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dbErrorMessage } from "@/lib/db-error";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { fetchAll } from "@/lib/supabase/fetch-all";

/**
 * The six writes chat can make, each one the same single insert or RPC
 * the app's own Relay actions make.
 *
 * Every function here takes the client — the short-lived one act-as.ts
 * minted for the person who typed — and nothing here calls
 * `requireTool`. That is not a gap: `requireTool` reads a browser
 * session this door does not have, and the permission boundary it stands
 * for is enforced underneath anyway. The minted session is a real one,
 * so `has_app('/relay')` decides what its RLS can touch, and the 0036
 * relay guard decides everything else — holder-or-admin, the leg
 * arithmetic, the mandatory bounce note, the refusal to land a baton on
 * a switched-off account. Chat can do exactly what that person could do
 * at their own keyboard.
 *
 * The guard writes its refusals to be read by a person ("This trail only
 * has 3 legs"), so they are passed through to chat as they are. The
 * phrase list below is COPIED from lib/relay/actions.ts rather than
 * imported — one tool never imports another's code, and that file is a
 * "use server" module besides.
 *
 * Nothing throws. The door has ~30 seconds to answer Google with
 * something a person can read, so every function catches its own
 * failures and comes back with a sentence.
 */

type Db = SupabaseClient<Database>;

/** Did the write land, or what does the person need to be told. */
export type WriteResult = { ok: true; chainId?: string } | { ok: false; error: string };

/** lib/relay/actions.ts's RELAY_GUARD_PHRASES, copied. */
const RELAY_GUARD_PHRASES = [
  "baton",
  "trail",
  "leg",
  "switched off",
  "permanent",
  "signed-in",
] as const;

/**
 * The layout form, always — the same call and the same reason as
 * relay's own `revalidateRelay`: the Relay welcome screen's four live
 * counters go stale on an exact-path call. A `revalidatePath` inside a
 * route handler is legal and simply marks the cache; it does not need a
 * request the way `cookies()` does.
 */
function refreshRelay() {
  revalidatePath("/relay", "layout");
}

/** One `pusher_chain_events` insert — the shape all five event writes share. */
async function insertEvent(
  db: Db,
  row: {
    chain_id: string;
    kind: "pushed" | "completed" | "client_held" | "client_returned" | "bounced";
    from_leg: number;
    to_leg?: number;
    reason?: string;
    note: string | null;
  },
  fallback: string,
): Promise<WriteResult> {
  const { error } = await db.from("pusher_chain_events").insert(row);
  if (error) return { ok: false, error: dbErrorMessage(error, fallback, RELAY_GUARD_PHRASES) };
  refreshRelay();
  return { ok: true };
}

/**
 * Hand the baton on. One insert; the guard stamps the actor, the time,
 * the sequence number and the snapshots, and refuses if this person is
 * not the holder or if the baton has moved since the card was drawn —
 * which is what `fromLeg` is for.
 */
export async function pushBaton(db: Db, chainId: string, fromLeg: number): Promise<WriteResult> {
  try {
    return await insertEvent(
      db,
      { chain_id: chainId, kind: "pushed", from_leg: fromLeg, to_leg: fromLeg + 1, note: null },
      "Could not push this trail forward.",
    );
  } catch {
    return { ok: false, error: "Could not push this trail forward." };
  }
}

/** The last leg only — the guard is what says so. */
export async function finishTrail(db: Db, chainId: string, fromLeg: number): Promise<WriteResult> {
  try {
    return await insertEvent(
      db,
      { chain_id: chainId, kind: "completed", from_leg: fromLeg, note: null },
      "Could not finish this trail.",
    );
  } catch {
    return { ok: false, error: "Could not finish this trail." };
  }
}

/**
 * With the client, and back again. Same leg, same holder, same clock —
 * only what the screen says is being waited on changes.
 */
export async function holdForClient(
  db: Db,
  chainId: string,
  fromLeg: number,
): Promise<WriteResult> {
  try {
    return await insertEvent(
      db,
      { chain_id: chainId, kind: "client_held", from_leg: fromLeg, to_leg: fromLeg, note: null },
      "Could not mark this trail as with the client.",
    );
  } catch {
    return { ok: false, error: "Could not mark this trail as with the client." };
  }
}

export async function clientReturned(
  db: Db,
  chainId: string,
  fromLeg: number,
): Promise<WriteResult> {
  try {
    return await insertEvent(
      db,
      {
        chain_id: chainId,
        kind: "client_returned",
        from_leg: fromLeg,
        to_leg: fromLeg,
        note: null,
      },
      "Could not take this trail back from the client.",
    );
  } catch {
    return { ok: false, error: "Could not take this trail back from the client." };
  }
}

/**
 * Send it back to an earlier leg, with a reason and a note. The three
 * checks the app makes before the round trip are made by the dialog's
 * own parser (trail-rules.ts) — by the time a bounce reaches here the
 * reason is picked, the note is not blank and the target is earlier, and
 * the database refuses it again anyway (0036 §6).
 */
export async function bounceBaton(
  db: Db,
  chainId: string,
  fromLeg: number,
  toLeg: number,
  reason: string,
  note: string,
): Promise<WriteResult> {
  try {
    return await insertEvent(
      db,
      {
        chain_id: chainId,
        kind: "bounced",
        from_leg: fromLeg,
        to_leg: toLeg,
        reason,
        note: note.trim(),
      },
      "Could not bounce this trail back.",
    );
  } catch {
    return { ok: false, error: "Could not bounce this trail back." };
  }
}

// ---------------------------------------------------------------------
// Opening a trail from a trail type
// ---------------------------------------------------------------------

/**
 * `applyTrailSet` restated for the door.
 *
 * The app's version leans on three functions in lib/relay/queries.ts
 * that each open with `requireTool`; this one asks the same four
 * questions with the minted client instead. The answers must match the
 * app's exactly, or the same trail type laid down from chat would come
 * out with different people on it than the one laid down in the browser
 * — so the ordering, the fallbacks and the refusals below are the app's,
 * word for word where they are said out loud.
 */
const NO_TRAIL_TYPE = "That trail type no longer exists.";
const COULD_NOT_OPEN = "Could not add this trail type.";

type SetActivity = { activityId: string; activityName: string; expectedDays: number };

/** The trail type and its activities, in order — listTrailSets's two reads, narrowed to one set. */
async function readSet(
  db: Db,
  setId: string,
): Promise<{ name: string; activities: SetActivity[] } | null> {
  // Deliberately not filtered to active types, exactly as applyTrailSet
  // is not (it reads the list with includeInactive): the dialog only
  // ever offers the live ones, and a type switched off in the seconds
  // between opening that dialog and pressing Save should still lay down
  // rather than vanish mid-action.
  const { data: set, error: setError } = await db
    .from("pusher_trail_sets")
    .select("id, name")
    .eq("id", setId)
    .maybeSingle();
  if (setError || !set) return null;

  const items = await fetchAll<{
    id: string;
    activity_id: string;
    sort_order: number;
    expected_days: number;
  }>((from, to) =>
    db
      .from("pusher_trail_set_items")
      .select("id, activity_id, sort_order, expected_days")
      .eq("set_id", setId)
      .order("id")
      .range(from, to),
  );

  const { data: activities, error: activityError } = await db
    .from("pusher_activities")
    .select("id, name");
  if (activityError) return null;
  const nameById = new Map((activities ?? []).map((a) => [a.id, a.name]));

  return {
    name: set.name,
    activities: items
      .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))
      .map((item) => ({
        activityId: item.activity_id,
        activityName: nameById.get(item.activity_id) ?? "—",
        expectedDays: item.expected_days,
      })),
  };
}

/**
 * Who normally carries each activity, and for how many days —
 * `getActivityDefaults` restated. The unit of prefill is the ACTIVITY,
 * not the trail (0043), and the answer is the most recent LEG of that
 * activity anywhere.
 *
 * Someone switched off comes back blank rather than pre-chosen: the
 * guard refuses to land a baton on a deactivated account, so prefilling
 * one only produces a refusal at the last step.
 */
async function readActivityDefaults(
  db: Db,
): Promise<Map<string, { assigneeId: string; expectedDays: number }>> {
  const [legs, people] = await Promise.all([
    fetchAll<{
      activity_id: string;
      assignee_id: string;
      expected_days: number;
      created_at: string;
    }>((from, to) =>
      db
        .from("pusher_chain_legs")
        .select("activity_id, assignee_id, expected_days, created_at")
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to),
    ),
    db.from("profiles").select("id").eq("is_active", true),
  ]);

  const active = new Set((people.data ?? []).map((p) => p.id));
  const byActivity = new Map<string, { assigneeId: string; expectedDays: number }>();
  for (const leg of legs) {
    if (byActivity.has(leg.activity_id)) continue;
    byActivity.set(leg.activity_id, {
      assigneeId: active.has(leg.assignee_id) ? leg.assignee_id : "",
      expectedDays: leg.expected_days,
    });
  }
  return byActivity;
}

/**
 * The departments the last trail of this type carried —
 * `getDepartmentsByTrailSet` restated, narrowed to one type. The admin
 * client is fine here: it reads the same view and table every signed-in
 * person can read, and the answer is only ever used to tag the trail the
 * person has just opened. Best effort throughout: a trail without its
 * department tags is a cosmetic gap someone can fix on the trail page.
 */
async function readDepartments(setId: string): Promise<string[]> {
  try {
    const admin = createAdminClient();
    const { data: chains, error } = await admin
      .from("pusher_chain_state")
      .select("chain_id, trail_set_id, created_at")
      .eq("trail_set_id", setId)
      .order("created_at", { ascending: false })
      .order("chain_id")
      .limit(1);
    if (error || !chains?.length || !chains[0].chain_id) return [];

    const { data: rows, error: deptError } = await admin
      .from("pusher_chain_departments")
      .select("department_id")
      .eq("chain_id", chains[0].chain_id);
    if (deptError) return [];
    return (rows ?? []).map((r) => r.department_id);
  } catch (error) {
    console.error("google-chat relay-writes: department read failed", error);
    return [];
  }
}

/**
 * Lay a trail type down on a house — ONE trail, whose legs are the
 * type's activities in order, each with the person who normally carries
 * it. People are never hand-picked in chat, which is the whole reason
 * this path exists rather than the app's full form.
 *
 * The unstaffed refusal is the app's own sentence, because it is the one
 * message here whose entire value is naming which activity has nobody on
 * it and where to fix that.
 */
export async function openTrailFromSet(
  db: Db,
  input: { unitId: string; setId: string; start: boolean },
): Promise<WriteResult> {
  try {
    if (!input.unitId) return { ok: false, error: "Pick a house first." };
    if (!input.setId) return { ok: false, error: "Pick a trail type first." };

    // A villa names one id; the chain row must name both, so the
    // project comes from the unit rather than from the dialog.
    const { data: unit, error: unitError } = await db
      .from("units")
      .select("id, project_id")
      .eq("id", input.unitId)
      .maybeSingle();
    if (unitError || !unit) return { ok: false, error: "That house no longer exists." };

    const [set, defaults] = await Promise.all([readSet(db, input.setId), readActivityDefaults(db)]);
    if (!set) return { ok: false, error: NO_TRAIL_TYPE };
    if (set.activities.length === 0) {
      return { ok: false, error: `"${set.name}" has no activities in it yet — add some first.` };
    }

    const unstaffed = set.activities
      .filter((item) => !defaults.get(item.activityId)?.assigneeId)
      .map((item) => item.activityName);
    if (unstaffed.length > 0) {
      return {
        ok: false,
        error: `No one has ever carried ${unstaffed.join(", ")}, so there is nobody to put on ${unstaffed.length === 1 ? "it" : "them"}. Open a trail by hand once with ${unstaffed.length === 1 ? "that activity" : "those activities"} and this type will fill itself in after that.`,
      };
    }

    // The generated RPC arg types are non-null (Postgres cannot say "this
    // parameter may be null"), but a trail laid from a type has no single
    // activity and no note — exactly as applyTrailSet passes them.
    const { data, error } = await db.rpc("open_chain", {
      p_project_id: unit.project_id,
      p_unit_id: input.unitId,
      p_activity_id: null as unknown as string,
      p_title: set.name,
      p_note: null as unknown as string,
      p_legs: set.activities.map((item) => ({
        activity_id: item.activityId,
        assignee_id: defaults.get(item.activityId)!.assigneeId,
        expected_days: item.expectedDays,
      })),
      p_trail_set_id: input.setId,
      p_start: input.start,
    });

    if (error) {
      return { ok: false, error: dbErrorMessage(error, COULD_NOT_OPEN, RELAY_GUARD_PHRASES) };
    }

    const chainId = typeof data === "string" ? data : undefined;

    // Best effort, and deliberately not fatal: the trail exists and is
    // correct without its department tags, and failing here would tell
    // the person nothing happened beside a trail that plainly did open.
    if (chainId) {
      const departmentIds = await readDepartments(input.setId);
      if (departmentIds.length > 0) {
        const { error: deptError } = await db.rpc("set_chain_departments", {
          p_chain_id: chainId,
          p_department_ids: departmentIds,
        });
        if (deptError) {
          console.error("google-chat relay-writes: departments not tagged", deptError.message);
        }
      }
    }

    refreshRelay();
    return { ok: true, chainId };
  } catch (error) {
    console.error("google-chat relay-writes: open trail broke", error);
    return { ok: false, error: COULD_NOT_OPEN };
  }
}
