import "server-only";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dbErrorMessage } from "@/lib/db-error";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { readActivityDefaults, readSet } from "./relay-reads";

/**
 * The writes chat can make, each one the same single insert or RPC the
 * app's own Relay actions make.
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
// Opening a trail
// ---------------------------------------------------------------------

/**
 * `openTrail` and `applyTrailSet` restated for the door.
 *
 * The app's versions lean on functions in lib/relay/queries.ts that each
 * open with `requireTool`; these ask the same questions with the minted
 * client instead. The answers must match the app's exactly, or the same
 * trail laid down from chat would come out different from one laid down
 * in the browser — so the ordering, the fallbacks and the refusals below
 * are the app's, word for word where they are said out loud.
 *
 * There is ONE write path. A trail type with its usual people, a trail
 * type with people chosen by hand, and a trail built step by step all
 * end in the same `openTrail` below; `openTrailFromSet` is only the work
 * of turning a type into legs before calling it. That is the point: the
 * five refusals, the `open_chain` call and the department tagging cannot
 * drift apart between the two ways of asking for a trail.
 */
const NO_TRAIL_TYPE = "That trail type no longer exists.";
const COULD_NOT_OPEN = "Could not add this trail type.";
const COULD_NOT_OPEN_TRAIL = "Could not open this trail.";

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
 * Open a trail on a house — the app's own `openTrail`, restated.
 *
 * Its five refusals are here word for word, in the same order, because
 * they are the sentences a person reads when they have mistyped
 * something: a trail with no steps, a step with no activity, a step with
 * nobody on it, a step with half a day on it, the same activity twice.
 * They are checked here so the dialog can say which step is wrong; the
 * database checks them all again anyway (0036).
 *
 * `setId` says this trail came from a trail type: it is stamped on the
 * chain, it fills in the title when the caller hasn't got one, and it is
 * what the department tags are copied from. A custom trail passes null
 * for all three, and its confirmation says to add departments by hand.
 */
export async function openTrail(
  db: Db,
  input: {
    unitId: string;
    setId: string | null;
    title: string | null;
    legs: { activityId: string; assigneeId: string; expectedDays: number }[];
    start: boolean;
  },
): Promise<WriteResult> {
  try {
    if (!input.unitId) return { ok: false, error: "Pick a house first." };
    if (input.legs.length === 0)
      return { ok: false, error: "A trail needs at least one activity." };

    for (const [i, leg] of input.legs.entries()) {
      if (!leg.activityId) return { ok: false, error: `Step ${i + 1} needs an activity.` };
      if (!leg.assigneeId) return { ok: false, error: `Step ${i + 1} needs someone to carry it.` };
      if (!Number.isInteger(leg.expectedDays) || leg.expectedDays < 1) {
        return { ok: false, error: `Step ${i + 1} needs a whole number of days, at least 1.` };
      }
    }

    // The same activity twice in one trail would put the baton through
    // identical steps, which is never what anyone meant and is impossible
    // to read on the route afterwards.
    const seen = new Set(input.legs.map((leg) => leg.activityId));
    if (seen.size !== input.legs.length) {
      return {
        ok: false,
        error: "The same activity appears twice — each step should be a different one.",
      };
    }

    // A villa names one id; the chain row must name both, so the project
    // comes from the unit rather than from the dialog.
    const { data: unit, error: unitError } = await db
      .from("units")
      .select("id, project_id")
      .eq("id", input.unitId)
      .maybeSingle();
    if (unitError || !unit) return { ok: false, error: "That house no longer exists." };

    // A trail laid from a type is titled with the type's name — the
    // caller usually has it in hand already (openTrailFromSet does), and
    // when it doesn't, one read here is better than making every caller
    // fetch it. A custom trail's title is whatever the person typed.
    let title = input.title;
    if (!title && input.setId) {
      const set = await readSet(db, input.setId);
      title = set?.name ?? null;
    }

    // The generated RPC arg types are non-null (Postgres cannot say "this
    // parameter may be null"), but the single activity, the title, the
    // note and the trail type all legitimately are.
    //
    // The single activity is stamped only on a CUSTOM one-step trail.
    // Since 0043 the activities live on the legs, and a longer trail has
    // no one answer to "which activity is it" — but a trail laid from a
    // type always passes null however short it is, exactly as the app's
    // applyTrailSet does, because the view names a typed trail after its
    // type and a one-activity type must read the same from chat as it
    // does from the browser.
    const { data, error } = await db.rpc("open_chain", {
      p_project_id: unit.project_id,
      p_unit_id: input.unitId,
      p_activity_id: (!input.setId && input.legs.length === 1
        ? input.legs[0].activityId
        : null) as unknown as string,
      p_title: title as unknown as string,
      p_note: null as unknown as string,
      p_legs: input.legs.map((leg) => ({
        activity_id: leg.activityId,
        assignee_id: leg.assigneeId,
        expected_days: leg.expectedDays,
      })),
      p_trail_set_id: input.setId as unknown as string,
      p_start: input.start,
    });

    if (error) {
      return { ok: false, error: dbErrorMessage(error, COULD_NOT_OPEN_TRAIL, RELAY_GUARD_PHRASES) };
    }

    const chainId = typeof data === "string" ? data : undefined;

    // Best effort, and deliberately not fatal: the trail exists and is
    // correct without its department tags, and failing here would tell
    // the person nothing happened beside a trail that plainly did open.
    // Only a trail type has departments to copy — a custom trail has no
    // earlier trail of its kind to copy them from, which is what its
    // confirmation sentence says out loud.
    if (chainId && input.setId) {
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
    return { ok: false, error: COULD_NOT_OPEN_TRAIL };
  }
}

/**
 * Lay a trail type down on a house with its usual people — the one-tap
 * path, and the only one that picks the people for you.
 *
 * All it does is turn the type into legs: its activities in order, each
 * with whoever normally carries it and for however long they normally
 * take. Then it hands them to `openTrail` like any other trail, so there
 * is one place where a trail is opened and one set of refusals.
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
    if (!input.setId) return { ok: false, error: "Pick a trail type first." };

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

    return await openTrail(db, {
      unitId: input.unitId,
      setId: input.setId,
      title: set.name,
      legs: set.activities.map((item) => ({
        activityId: item.activityId,
        assigneeId: defaults.get(item.activityId)!.assigneeId,
        expectedDays: item.expectedDays,
      })),
      start: input.start,
    });
  } catch (error) {
    console.error("google-chat relay-writes: open trail from set broke", error);
    return { ok: false, error: COULD_NOT_OPEN };
  }
}
