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

type Db = SupabaseClient<Database>;

// Reads use the admin client: the door has no browser session, and lib/relay/queries.ts opens
// with requireTool (no cross-tool imports). Safe because the view is open to every signed-in
// person and identity already proved /relay. STATE_COLUMNS is copied, not imported (contract in
// STATUS.md). Nothing throws: a failed read is null, already logged, never with email or text.

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

async function enrich(rows: StateRow[]): Promise<TrailSummary[]> {
  const chainIds = [...new Set(rows.map((r) => r.chain_id).filter((id): id is string => !!id))];
  const holderIds = [...new Set(rows.map((r) => r.holder_id).filter((id): id is string => !!id))];
  // Only each row's current leg is shown, so read only those leg numbers.
  const currentLegs = [
    ...new Set(rows.map((r) => r.current_leg).filter((leg): leg is number => leg !== null)),
  ];

  const admin = createAdminClient();

  // fetchAll avoids the 1,000-row cap. Own try/catch: a missing label is cosmetic and must not
  // fail the whole court.
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

// Unscoped on purpose: the door splits by scope in Node, so a linked space can say "N more
// elsewhere" from one read. Restated because listMyCourt needs a session.
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

// Not finished and not queued (a queued trail has no holder or clock). Word matching stays in
// Node: a bad PostgREST filter string is invisible to every CI gate.
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

// No is_finished filter: it is read straight after a write, and a just-finished trail is the one talked about.
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

// The label is the name as it stood when the trail was laid (0043), so it is read, not joined:
// a rename must not rewrite history.
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
      // A missing name is cosmetic: log and carry on.
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

// Active accounts only: the relay guard refuses a switched-off holder. A nameless profile is
// listed as "Unnamed", not dropped.
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

export type SetActivity = { activityId: string; activityName: string; expectedDays: number };

// Takes the client so the dialog (admin) and the write (the person) ask the same question. Not
// filtered to active types, like applyTrailSet: a type switched off between opening the dialog
// and Save should still lay down.
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

// The most recent LEG of each activity, anywhere (0043). A switched-off person comes back blank:
// the guard refuses a deactivated holder, so prefilling would only fail at the last step.
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

  // Both callers catch: a failed read here would blank every assignee and read as "no one has carried it".
  if (people.error) throw new Error("active people read failed", { cause: people.error });
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

// Days come from the TYPE, not the last leg, so the one-tap path and "choose people, change
// nothing" give the identical trail. The person comes from the last leg; blank leaves the
// dropdown unchosen.
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
