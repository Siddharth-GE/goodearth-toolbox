import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { fetchAll } from "@/lib/supabase/fetch-all";
import type {
  ActivityOption,
  LegOption,
  PersonOption,
  Scope,
  StepDefault,
  TrailSetOption,
  TrailSummary,
} from "./trail-rules";

/** The client a read runs on: the admin one for a card, the minted one for a write. */
type Db = SupabaseClient<Database>;

/**
 * The two reads /court and /trail are built from: everything the sender
 * holds, and everything running in a scope. Both read `pusher_chain_state`
 * — the same view every relay list reads — through the admin client,
 * because the door has no browser session and `lib/relay/queries.ts`
 * opens every function with `requireTool` (one tool never imports
 * another's code, and that read needs a session this door doesn't have).
 * Sanctioned the same way identity.ts and spaces.ts already are: the
 * view is granted to every signed-in person with no gate of its own, and
 * the identity step already proved the sender holds /relay or is an
 * admin, so this reveals nothing they couldn't already see at
 * /relay/court or /relay/trails.
 *
 * The column list below is copied from lib/relay/queries.ts's
 * STATE_COLUMNS, not imported — the columns are the contract row
 * STATUS.md gains in Phase 8, and copying them here is the whole point
 * of "one tool never imports another's code".
 *
 * Nothing here throws. The door must always answer Google within its
 * ~30 seconds, so a failed read comes back as null, already logged —
 * the same shape spaces.ts uses — and never an email or message text in
 * the log line.
 */

const STATE_COLUMNS =
  "chain_id, project_id, project_name, unit_id, unit_name, activity_name, title, leg_count, current_leg, holder_id, days_in_leg, expected_days, is_stuck, is_finished, is_queued, is_with_client, with_client_days";

type StateRow = {
  chain_id: string | null;
  project_id: string | null;
  project_name: string | null;
  unit_id: string | null;
  unit_name: string | null;
  activity_name: string | null;
  title: string | null;
  leg_count: number | null;
  current_leg: number | null;
  holder_id: string | null;
  days_in_leg: number | null;
  expected_days: number | null;
  is_stuck: boolean | null;
  is_finished: boolean | null;
  is_queued: boolean | null;
  is_with_client: boolean | null;
  with_client_days: number | null;
};

/** Same normalisation lib/relay/queries.ts's toRow does: a view's columns all come back nullable. */
function toSummary(
  row: StateRow,
  legLabels: Map<string, string>,
  holderNames: Map<string, string>,
): TrailSummary {
  const chainId = row.chain_id ?? "";
  return {
    chainId,
    projectId: row.project_id ?? "",
    projectName: row.project_name ?? "—",
    unitId: row.unit_id,
    unitName: row.unit_name,
    activityName: row.activity_name ?? "—",
    title: row.title,
    currentLeg: row.current_leg,
    legCount: row.leg_count ?? 0,
    legLabel:
      row.current_leg !== null ? (legLabels.get(`${chainId}:${row.current_leg}`) ?? null) : null,
    holderName: row.holder_id ? (holderNames.get(row.holder_id) ?? null) : null,
    daysInLeg: row.days_in_leg ?? 0,
    expectedDays: row.expected_days ?? 0,
    isStuck: row.is_stuck ?? false,
    isWithClient: row.is_with_client ?? false,
    withClientDays: row.with_client_days ?? 0,
  };
}

/**
 * The current leg's label for a handful of chains, and the holder's
 * name for a handful of people — the two shared reads both /court and
 * /trail need, in one place so they stay identical. Skipped entirely
 * when there is nothing to look up: an empty court costs nothing beyond
 * the one view read.
 */
async function enrich(rows: StateRow[]): Promise<TrailSummary[]> {
  const chainIds = [...new Set(rows.map((r) => r.chain_id).filter((id): id is string => !!id))];
  const holderIds = [...new Set(rows.map((r) => r.holder_id).filter((id): id is string => !!id))];
  // Only the leg each row is currently sitting on is ever shown, so the
  // read is shrunk to those leg numbers too — a chain can have several
  // legs, and there is no reason to pull labels for the ones nobody is
  // asking about.
  const currentLegs = [
    ...new Set(rows.map((r) => r.current_leg).filter((leg): leg is number => leg !== null)),
  ];

  const admin = createAdminClient();

  // Un-ranged, this silently caps at PostgREST's 1,000-row limit (the
  // fetchAll rule in CLAUDE.md), so it goes through fetchAll like every
  // other completeness-sensitive read. It gets its own try/catch,
  // though: a missing leg label is cosmetic — the card still shows the
  // leg number — and must never turn a whole court or search into
  // "something went wrong".
  const legLabels = new Map<string, string>();
  if (chainIds.length > 0 && currentLegs.length > 0) {
    try {
      const legs = await fetchAll<{ chain_id: string; leg_no: number; label: string | null }>(
        (from, to) =>
          admin
            .from("pusher_chain_legs")
            .select("chain_id, leg_no, label")
            .in("chain_id", chainIds)
            .in("leg_no", currentLegs)
            .order("chain_id")
            .order("leg_no")
            .range(from, to),
      );
      for (const leg of legs) {
        if (leg.label) legLabels.set(`${leg.chain_id}:${leg.leg_no}`, leg.label);
      }
    } catch (error) {
      console.error("google-chat relay-reads: leg label read failed", error);
    }
  }

  const holderNames = new Map<string, string>();
  if (holderIds.length > 0) {
    const { data, error } = await admin
      .from("profiles")
      .select("id, full_name")
      .in("id", holderIds);
    if (error) {
      console.error("google-chat relay-reads: holder name read failed", error);
    } else {
      for (const profile of data ?? []) {
        if (profile.full_name) holderNames.set(profile.id, profile.full_name);
      }
    }
  }

  return rows.map((row) => toSummary(row, legLabels, holderNames));
}

/**
 * Every unfinished baton this person holds, worst first — the same read
 * `listMyCourt` does, restated because that function opens with
 * `requireTool` and this door has no session to give it.
 *
 * Deliberately unscoped: the door splits this by scope in Node
 * (`trail-rules.ts`'s `splitByScope`) so a linked space's card can say
 * both "yours here" and "and N more elsewhere" from one read, rather
 * than two.
 */
export async function listCourt(userId: string): Promise<TrailSummary[] | null> {
  try {
    const admin = createAdminClient();
    const rows = await fetchAll<StateRow>((from, to) =>
      admin
        .from("pusher_chain_state")
        .select(STATE_COLUMNS)
        .eq("holder_id", userId)
        .eq("is_finished", false)
        .order("is_stuck", { ascending: false })
        .order("days_in_leg", { ascending: false })
        .order("chain_id")
        .range(from, to),
    );
    return await enrich(rows);
  } catch (error) {
    console.error("google-chat relay-reads: court read failed", error);
    return null;
  }
}

/**
 * Everything running in a scope — not finished, and not queued, because
 * a queued trail has no holder and no clock and the app's own running
 * list excludes it for the same reason. Word matching happens in Node
 * with `trail-rules.ts`'s `matchesWords`, never a `.or(ilike...)`
 * filter string here: a bad PostgREST select is invisible to every CI
 * gate, so the search stays plain TypeScript instead.
 */
export async function listRunning(scope: Scope): Promise<TrailSummary[] | null> {
  try {
    const admin = createAdminClient();
    const rows = await fetchAll<StateRow>((from, to) => {
      let query = admin
        .from("pusher_chain_state")
        .select(STATE_COLUMNS)
        .eq("is_finished", false)
        .eq("is_queued", false)
        .order("is_stuck", { ascending: false })
        .order("days_in_leg", { ascending: false })
        .order("chain_id");
      if (scope.kind === "unit") query = query.eq("unit_id", scope.unitId);
      if (scope.kind === "project") query = query.eq("project_id", scope.projectId);
      return query.range(from, to);
    });
    return await enrich(rows);
  } catch (error) {
    console.error("google-chat relay-reads: running trails read failed", error);
    return null;
  }
}

/**
 * One trail, by id — the row a confirmation sentence is built from
 * after a write has landed. Same view, same enrichment as the two lists,
 * so "now with Anil, leg 3 of 8" in chat says exactly what the app's own
 * court would say a second later.
 *
 * No `is_finished` filter: this is read straight after a write, and a
 * trail that has just been finished is precisely the one being talked
 * about. Null means the read failed or the trail is gone.
 */
export async function getTrailSummary(chainId: string): Promise<TrailSummary | null> {
  if (!chainId) return null;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("pusher_chain_state")
      .select(STATE_COLUMNS)
      .eq("chain_id", chainId)
      .maybeSingle();

    if (error) {
      console.error("google-chat relay-reads: trail read failed", error);
      return null;
    }
    if (!data) return null;

    const [summary] = await enrich([data as StateRow]);
    return summary ?? null;
  } catch (error) {
    console.error("google-chat relay-reads: trail read broke", error);
    return null;
  }
}

/**
 * The trail types on offer in the /newtrail dialog — the live ones only,
 * in the order the app lists them. Just the id and the name: the
 * activities behind a type are read on the write side, as the person,
 * at the moment the type is laid down.
 */
export async function listTrailSets(): Promise<TrailSetOption[] | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("pusher_trail_sets")
      .select("id, name")
      .eq("is_active", true)
      .order("sort_order")
      .order("name");

    if (error) {
      console.error("google-chat relay-reads: trail sets read failed", error);
      return null;
    }
    return (data ?? []).map((set) => ({ id: set.id, name: set.name }));
  } catch (error) {
    console.error("google-chat relay-reads: trail sets read broke", error);
    return null;
  }
}

/**
 * Every leg of one trail, in order, with the label snapshot and who is
 * on it — the bounce dialog's list of places a baton can go back to.
 * The door filters it to the legs earlier than the current one; this
 * read simply says what the trail is made of.
 *
 * The label is the activity's name as it stood when the trail was laid
 * (0043's snapshot), which is why it is read rather than joined: a
 * renamed activity must not rewrite what a leg was called.
 */
export async function listLegs(chainId: string): Promise<LegOption[] | null> {
  if (!chainId) return null;

  try {
    const admin = createAdminClient();
    const legs = await fetchAll<{ leg_no: number; label: string | null; assignee_id: string }>(
      (from, to) =>
        admin
          .from("pusher_chain_legs")
          .select("leg_no, label, assignee_id")
          .eq("chain_id", chainId)
          .order("leg_no")
          .range(from, to),
    );

    const assigneeIds = [...new Set(legs.map((leg) => leg.assignee_id).filter(Boolean))];
    const names = new Map<string, string>();
    if (assigneeIds.length > 0) {
      const { data, error } = await admin
        .from("profiles")
        .select("id, full_name")
        .in("id", assigneeIds);
      // A missing name is cosmetic — the dialog still names the leg — so
      // it is logged and carried on from, never turned into a failure.
      if (error) console.error("google-chat relay-reads: leg assignee read failed", error);
      for (const profile of data ?? []) {
        if (profile.full_name) names.set(profile.id, profile.full_name);
      }
    }

    return legs.map((leg) => ({
      legNo: leg.leg_no,
      label: leg.label,
      assigneeName: names.get(leg.assignee_id) ?? null,
    }));
  } catch (error) {
    console.error("google-chat relay-reads: legs read broke", error);
    return null;
  }
}

/**
 * Everyone a step can be handed to — the dropdown behind "choose the
 * people myself". Active accounts only, by name, because the relay guard
 * refuses to land a baton on a switched-off account and offering one
 * would only produce a refusal at the last step.
 *
 * A profile with no name still has to be pickable — the person exists
 * and holds work — so it is listed as "Unnamed" rather than dropped.
 */
export async function listPeople(): Promise<PersonOption[] | null> {
  try {
    const admin = createAdminClient();
    const people = await fetchAll<{ id: string; full_name: string | null }>((from, to) =>
      admin
        .from("profiles")
        .select("id, full_name")
        .eq("is_active", true)
        .order("full_name")
        .range(from, to),
    );
    return people.map((person) => ({ id: person.id, name: person.full_name ?? "Unnamed" }));
  } catch (error) {
    console.error("google-chat relay-reads: people read failed", error);
    return null;
  }
}

/**
 * Every activity a custom trail's step can be, in the order the app
 * lists them (sort order, then name). Live ones only: a switched-off
 * activity is one nobody should be starting new work on.
 */
export async function listActivities(): Promise<ActivityOption[] | null> {
  try {
    const admin = createAdminClient();
    const activities = await fetchAll<{ id: string; name: string }>((from, to) =>
      admin
        .from("pusher_activities")
        .select("id, name")
        .eq("is_active", true)
        .order("sort_order")
        .order("name")
        .range(from, to),
    );
    return activities.map((activity) => ({ id: activity.id, name: activity.name }));
  } catch (error) {
    console.error("google-chat relay-reads: activities read failed", error);
    return null;
  }
}

/** One activity of a trail type, in the order the type lists it. */
export type SetActivity = { activityId: string; activityName: string; expectedDays: number };

/**
 * The trail type and its activities, in order — `listTrailSets`'s two
 * reads, narrowed to one set.
 *
 * It takes the client rather than making one because both sides of a
 * custom trail ask this same question: the dialog asks it as the admin
 * client to pre-fill page 2, and the write asks it as the person a
 * moment later. One function, one answer, no chance of the two drifting.
 *
 * Deliberately not filtered to active types, exactly as `applyTrailSet`
 * is not (it reads the list with includeInactive): the dialog only ever
 * offers the live ones, and a type switched off in the seconds between
 * opening that dialog and pressing Save should still lay down rather
 * than vanish mid-action.
 */
export async function readSet(
  db: Db,
  setId: string,
): Promise<{ name: string; activities: SetActivity[] } | null> {
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
 * one only produces a refusal at the last step. A blank is what page 2's
 * "pick someone" empty dropdown is built from, and what the one-tap
 * path's unstaffed refusal counts.
 */
export async function readActivityDefaults(
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
 * A trail type's steps, pre-filled the way the one-tap path would fill
 * them — page 2 of /newtrail, when the person wants to choose the people
 * themselves.
 *
 * Its own function so the door stays dispatch-only: the admin client
 * lives in here with every other read, not in route.ts. It is the same
 * pair of reads the write makes a moment later as the person, and it
 * reveals nothing beyond what the app's own new-trail form shows anyone
 * signed in.
 *
 * The days come from the TYPE, not from the activity's last leg, so that
 * opening a type with the people switch off and opening it with the
 * switch on and changing nothing produce the identical trail. The person
 * comes from the last leg, as the app does — and a blank one (nobody has
 * ever carried it, or the usual person is switched off) is a dropdown
 * left unchosen rather than a refusal.
 */
export async function readSetSteps(
  setId: string,
): Promise<{ name: string; steps: StepDefault[] } | null> {
  try {
    const admin = createAdminClient();
    const [set, defaults] = await Promise.all([readSet(admin, setId), readActivityDefaults(admin)]);
    if (!set) return null;

    return {
      name: set.name,
      steps: set.activities.map((activity) => ({
        activityId: activity.activityId,
        activityName: activity.activityName,
        assigneeId: defaults.get(activity.activityId)?.assigneeId || null,
        expectedDays: activity.expectedDays,
      })),
    };
  } catch (error) {
    console.error("google-chat relay-reads: trail type steps read failed", error);
    return null;
  }
}
