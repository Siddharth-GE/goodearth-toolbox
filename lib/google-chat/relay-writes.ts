import "server-only";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dbErrorMessage } from "@/lib/db-error";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { readActivityDefaults, readSet } from "./relay-reads";

// Each write is the same insert or RPC as the app's Relay actions, on the client act-as.ts
// minted. No requireTool: it needs a browser session this door lacks, and the boundary holds
// underneath (has_app('/relay') and the 0036 guard decide everything). Guard refusals are
// readable and passed through; RELAY_GUARD_PHRASES is copied from lib/relay/actions.ts (no
// cross-tool import). Nothing throws.

type Db = SupabaseClient<Database>;

export type WriteResult = { ok: true; chainId?: string } | { ok: false; error: string };

const RELAY_GUARD_PHRASES = [
  "baton",
  "trail",
  "leg",
  "switched off",
  "permanent",
  "signed-in",
] as const;

// Layout form: the Relay welcome counters go stale on an exact-path call.
function refreshRelay() {
  revalidatePath("/relay", "layout");
}

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

// `fromLeg` makes the guard refuse if the baton moved since the card was drawn.
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

// The dialog's parser has checked reason, note and target; the database refuses again (0036 §6).
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

// openTrail and applyTrailSet restated with the minted client. Refusals match the app's word for
// word, so a trail opened from chat equals one from the browser. One write path: every way of
// asking ends in openTrail.
const NO_TRAIL_TYPE = "That trail type no longer exists.";
const COULD_NOT_OPEN = "Could not add this trail type.";
const COULD_NOT_OPEN_TRAIL = "Could not open this trail.";

// Best effort: a missing department tag is cosmetic. The admin client reads only what every
// signed-in person can read.
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

// The five refusals are the app's own, checked here so the dialog can say which step is wrong;
// the database checks again (0036). `setId` is stamped on the chain, fills the title and is where
// department tags come from; a custom trail passes null.
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

    // The same activity twice would run the baton through identical steps.
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

    // A trail from a type is titled with the type's name.
    let title = input.title;
    if (!title && input.setId) {
      const set = await readSet(db, input.setId);
      title = set?.name ?? null;
    }

    // The generated RPC arg types are non-null though these params may be null. The single
    // activity is stamped only on a CUSTOM one-step trail (0043 put activities on legs); a typed
    // trail passes null, as applyTrailSet does, so the view names it after its type.
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

    // Best effort: the trail is correct without tags. A custom trail has no earlier one to copy from.
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

// Turns a type into legs, then hands them to openTrail so there is one set of refusals. The
// unstaffed refusal is the app's own: its value is naming which activity has nobody.
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
