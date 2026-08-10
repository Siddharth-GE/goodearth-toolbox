import "server-only";

import { requireTool } from "@/lib/auth/access";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import { cache } from "react";

import { replayChain } from "./chain";
import type { ChainEvent, EventKind, Leg } from "./events";

/**
 * Reads for Pusher.
 *
 * Two rules shape everything here:
 *
 * 1. Lists read `pusher_chain_state` (0036 §11), never raw events. That
 *    view derives holder, current leg and days-in-leg in SQL, so "which
 *    trails have gone cold" is a filter the database answers rather than
 *    something we work out after dragging every event into Node. Only the
 *    trail detail page reads a full log, and that is one trail's worth.
 *
 * 2. Everyone signed in can SEE every trail — full visibility is the
 *    product, it is how a manager spots a cold trail in someone else's
 *    court. requireTool is what decides who gets in at all.
 */

export const PUSHER_LIST_LIMIT = 50;

/** Columns are normalised here because a view's columns all come back nullable from the type generator. */
export type ChainRow = {
  chainId: string;
  projectId: string;
  projectName: string;
  unitName: string | null;
  activityName: string;
  title: string | null;
  legCount: number;
  currentLeg: number | null;
  holderId: string | null;
  holderName: string | null;
  daysInLeg: number;
  expectedDays: number;
  isStuck: boolean;
  isFinished: boolean;
  startedAt: string | null;
  departments: string[];
};

type StateRow = {
  chain_id: string | null;
  project_id: string | null;
  project_name: string | null;
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
  started_at: string | null;
  department_names: string[] | null;
};

const STATE_COLUMNS =
  "chain_id, project_id, project_name, unit_name, activity_name, title, leg_count, current_leg, holder_id, days_in_leg, expected_days, is_stuck, is_finished, started_at, department_names";

function toRow(row: StateRow, names: Map<string, string>): ChainRow {
  return {
    chainId: row.chain_id ?? "",
    projectId: row.project_id ?? "",
    projectName: row.project_name ?? "—",
    unitName: row.unit_name,
    activityName: row.activity_name ?? "—",
    title: row.title,
    legCount: row.leg_count ?? 0,
    currentLeg: row.current_leg,
    holderId: row.holder_id,
    holderName: row.holder_id ? (names.get(row.holder_id) ?? null) : null,
    daysInLeg: row.days_in_leg ?? 0,
    expectedDays: row.expected_days ?? 0,
    isStuck: row.is_stuck ?? false,
    isFinished: row.is_finished ?? false,
    startedAt: row.started_at,
    departments: row.department_names ?? [],
  };
}

/** Everyone who could hold a baton. Small (~70 rows) and needed by every screen. */
export const listPeople = cache(async (): Promise<{ id: string; name: string }[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("is_active", true)
    .order("full_name");

  if (error) {
    console.error("pusher listPeople failed:", error);
    return [];
  }
  return (data ?? []).map((p) => ({ id: p.id, name: p.full_name ?? "Unnamed" }));
});

async function nameMap(): Promise<Map<string, string>> {
  return new Map((await listPeople()).map((p) => [p.id, p.name]));
}

export type TrailFilters = {
  page?: number;
  stuckOnly?: boolean;
  projectId?: string;
  holderId?: string;
  activityId?: string;
  departmentId?: string;
  /** "running" (default), "finished", or "all". */
  status?: "running" | "finished" | "all";
};

export async function listTrails(filters: TrailFilters = {}) {
  await requireTool("/pusher");
  const supabase = await createClient();
  const page = Math.max(1, filters.page ?? 1);
  const from = (page - 1) * PUSHER_LIST_LIMIT;

  let query = supabase
    .from("pusher_chain_state")
    .select(STATE_COLUMNS, { count: "exact" })
    // Cold first, then the longest-waiting: the whole point of the tool
    // is that a stuck trail is the first thing anyone sees.
    .order("is_stuck", { ascending: false })
    .order("days_in_leg", { ascending: false })
    .order("chain_id");

  const status = filters.status ?? "running";
  if (status !== "all") query = query.eq("is_finished", status === "finished");
  if (filters.stuckOnly) query = query.eq("is_stuck", true);
  if (filters.projectId) query = query.eq("project_id", filters.projectId);
  if (filters.holderId) query = query.eq("holder_id", filters.holderId);
  if (filters.activityId) query = query.eq("activity_id", filters.activityId);
  // Departments are an array on the view precisely so this stays one
  // server-side containment filter rather than a second query and a
  // merge in Node — a trail can be in several at once.
  if (filters.departmentId) query = query.contains("department_ids", [filters.departmentId]);

  const { data, error, count } = await query.range(from, from + PUSHER_LIST_LIMIT - 1);

  if (error) {
    console.error("pusher listTrails failed:", error);
    return { rows: [] as ChainRow[], total: 0, page, pageCount: 1 };
  }

  const names = await nameMap();
  const rows = ((data ?? []) as StateRow[]).map((r) => toRow(r, names));
  const total = count ?? rows.length;

  return { rows, total, page, pageCount: Math.max(1, Math.ceil(total / PUSHER_LIST_LIMIT)) };
}

/** The batons in one person's hand, worst first. Never paged — nobody holds 50. */
export async function listMyCourt(userId: string): Promise<ChainRow[]> {
  await requireTool("/pusher");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("pusher_chain_state")
    .select(STATE_COLUMNS)
    .eq("holder_id", userId)
    .eq("is_finished", false)
    .order("is_stuck", { ascending: false })
    .order("days_in_leg", { ascending: false })
    .order("chain_id");

  if (error) {
    console.error("pusher listMyCourt failed:", error);
    return [];
  }
  const names = await nameMap();
  return ((data ?? []) as StateRow[]).map((r) => toRow(r, names));
}

/**
 * Batons held by someone whose account has since been switched off. They
 * cannot sign in, so nothing moves until an admin hands it over — which
 * is why this has its own panel rather than being left to be noticed.
 */
export async function listStrandedTrails(): Promise<ChainRow[]> {
  await requireTool("/pusher");
  const supabase = await createClient();

  const [{ data, error }, active] = await Promise.all([
    supabase
      .from("pusher_chain_state")
      .select(STATE_COLUMNS)
      .eq("is_finished", false)
      .not("holder_id", "is", null)
      .order("days_in_leg", { ascending: false })
      .order("chain_id"),
    listPeople(),
  ]);

  if (error) {
    console.error("pusher listStrandedTrails failed:", error);
    return [];
  }

  const activeIds = new Set(active.map((p) => p.id));
  const names = await nameMap();
  return ((data ?? []) as StateRow[])
    .filter((r) => r.holder_id && !activeIds.has(r.holder_id))
    .map((r) => toRow(r, names));
}

/**
 * Legs for a handful of trails at once — what the court cards need to
 * name the current leg and say who the baton passes to next. One query
 * for the whole screen rather than one per card.
 */
export async function getLegsFor(chainIds: string[]): Promise<Map<string, Leg[]>> {
  const byChain = new Map<string, Leg[]>();
  if (chainIds.length === 0) return byChain;

  await requireTool("/pusher");
  const supabase = await createClient();

  const rows = await fetchAll<{
    chain_id: string;
    leg_no: number;
    label: string;
    assignee_id: string;
    expected_days: number;
  }>((from, to) =>
    supabase
      .from("pusher_chain_legs")
      .select("chain_id, leg_no, label, assignee_id, expected_days")
      .in("chain_id", chainIds)
      .order("chain_id")
      .order("leg_no")
      .range(from, to),
  );

  for (const row of rows) {
    const list = byChain.get(row.chain_id) ?? [];
    list.push({
      leg_no: row.leg_no,
      label: row.label,
      assignee_id: row.assignee_id,
      expected_days: row.expected_days,
    });
    byChain.set(row.chain_id, list);
  }
  return byChain;
}

export type TrailDetail = {
  chainId: string;
  projectId: string;
  projectName: string;
  unitName: string | null;
  activityName: string;
  departments: { id: string; name: string }[];
  title: string | null;
  note: string | null;
  legs: (Leg & { assigneeName: string })[];
  events: (ChainEvent & { actorName: string; toAssigneeName: string | null })[];
  state: ReturnType<typeof replayChain>;
};

export const getTrail = cache(async (chainId: string): Promise<TrailDetail | null> => {
  await requireTool("/pusher");
  const supabase = await createClient();

  // The FK is named explicitly because pusher_chains reaches units
  // TWICE — once by unit_id, once by the (project_id, unit_id) composite
  // that proves the unit is in the chain's own project. A bare
  // `units(name)` is ambiguous and PostgREST refuses it outright
  // (PGRST201). Exactly the shape that silently signed everyone out in
  // 2026-08-05's `roles` embed.
  const { data: chain, error } = await supabase
    .from("pusher_chains")
    .select(
      "id, project_id, activity_id, title, note, projects(name), units!pusher_chains_unit_id_fkey(name), pusher_activities(name), pusher_chain_departments(department_id, pusher_departments(id, name))",
    )
    .eq("id", chainId)
    .maybeSingle();

  if (error) {
    console.error("pusher getTrail failed:", error);
    return null;
  }
  if (!chain) return null;

  // A trail's own legs and events are bounded (legs are a handful, events
  // grow only as the baton moves), so these need no paging — but they do
  // need to be COMPLETE, because a missing event silently changes who the
  // holder is. fetchAll throws rather than answering with half a log.
  const [legRows, eventRows, names] = await Promise.all([
    fetchAll<{ leg_no: number; label: string; assignee_id: string; expected_days: number }>(
      (from, to) =>
        supabase
          .from("pusher_chain_legs")
          .select("leg_no, label, assignee_id, expected_days")
          .eq("chain_id", chainId)
          .order("leg_no")
          .range(from, to),
    ),
    fetchAll<Omit<ChainEvent, "kind"> & { kind: string }>((from, to) =>
      supabase
        .from("pusher_chain_events")
        .select(
          "seq, kind, from_leg, to_leg, actor_id, to_assignee_id, to_expected_days, reason, note, occurred_at",
        )
        .eq("chain_id", chainId)
        .order("seq")
        .range(from, to),
    ),
    nameMap(),
  ]);

  const legs: Leg[] = legRows.map((l) => ({
    leg_no: l.leg_no,
    label: l.label,
    assignee_id: l.assignee_id,
    expected_days: l.expected_days,
  }));

  // `kind` is a CHECK-constrained text column, so it arrives as a plain
  // string — narrow it once, here at the read boundary, rather than
  // casting at every use.
  const events: ChainEvent[] = eventRows.map((e) => ({ ...e, kind: e.kind as EventKind }));

  return {
    chainId,
    projectId: chain.project_id,
    projectName: chain.projects?.name ?? "—",
    unitName: chain.units?.name ?? null,
    activityName: chain.pusher_activities?.name ?? "—",
    departments: (chain.pusher_chain_departments ?? [])
      .map((row) => row.pusher_departments)
      .filter((d): d is { id: string; name: string } => d !== null)
      .sort((a, b) => a.name.localeCompare(b.name)),
    title: chain.title,
    note: chain.note,
    legs: legs.map((l) => ({ ...l, assigneeName: names.get(l.assignee_id) ?? "Unnamed" })),
    events: events.map((e) => ({
      ...e,
      actorName: names.get(e.actor_id) ?? "Unnamed",
      toAssigneeName: e.to_assignee_id ? (names.get(e.to_assignee_id) ?? "Unnamed") : null,
    })),
    state: replayChain(events, legs, new Date().toISOString()),
  };
});

export async function listDepartments(includeInactive = false) {
  await requireTool("/pusher");
  const supabase = await createClient();

  let query = supabase
    .from("pusher_departments")
    .select("id, name, is_active, sort_order")
    .order("sort_order")
    .order("name");
  if (!includeInactive) query = query.eq("is_active", true);

  const { data, error } = await query;
  if (error) {
    console.error("pusher listDepartments failed:", error);
    return [];
  }
  return data ?? [];
}

export async function listActivities(includeInactive = false) {
  await requireTool("/pusher");
  const supabase = await createClient();

  let query = supabase
    .from("pusher_activities")
    .select("id, name, is_active, sort_order")
    .order("sort_order")
    .order("name");
  if (!includeInactive) query = query.eq("is_active", true);

  const { data, error } = await query;
  if (error) {
    console.error("pusher listActivities failed:", error);
    return [];
  }
  return data ?? [];
}

export type PrefillLeg = { label: string; assigneeId: string; expectedDays: number };

/** What a repeat of an activity starts from: its last run's legs and departments. */
export type Prefill = { legs: PrefillLeg[]; departmentIds: string[] };

/**
 * For every activity, the legs of the last trail anyone ran with it —
 * what a new trail prefills with, so opening a repeat is about thirty
 * seconds' work.
 *
 * Computed for ALL activities in two queries and handed to the form up
 * front, rather than fetched per activity when the picker changes. There
 * are a couple of dozen activities at most, and this repo has already
 * learned that a Server Action is the wrong shape for a read (it
 * serialises per client and re-renders the route) — see the catalogue
 * route handler.
 *
 * Assignees who have since been switched off come back blank rather than
 * pre-chosen: the guard refuses to land a baton on a deactivated
 * account, so prefilling one would only produce a refusal at the last
 * step, on the screen furthest from the cause.
 */
export async function getPrefillsByActivity(): Promise<Map<string, Prefill>> {
  await requireTool("/pusher");
  const supabase = await createClient();

  const [chains, people] = await Promise.all([
    fetchAll<{ id: string; activity_id: string; created_at: string }>((from, to) =>
      supabase
        .from("pusher_chains")
        .select("id, activity_id, created_at")
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to),
    ),
    listPeople(),
  ]);

  // First row per activity wins — the list is already newest-first.
  const latestByActivity = new Map<string, string>();
  for (const chain of chains) {
    if (!latestByActivity.has(chain.activity_id)) {
      latestByActivity.set(chain.activity_id, chain.id);
    }
  }

  const chainIds = [...latestByActivity.values()];
  const [legsByChain, deptRows] = await Promise.all([
    getLegsFor(chainIds),
    chainIds.length === 0
      ? Promise.resolve([] as { chain_id: string; department_id: string }[])
      : fetchAll<{ chain_id: string; department_id: string }>((from, to) =>
          supabase
            .from("pusher_chain_departments")
            .select("chain_id, department_id")
            .in("chain_id", chainIds)
            .order("chain_id")
            .range(from, to),
        ),
  ]);

  const deptsByChain = new Map<string, string[]>();
  for (const row of deptRows) {
    deptsByChain.set(row.chain_id, [...(deptsByChain.get(row.chain_id) ?? []), row.department_id]);
  }

  const active = new Set(people.map((p) => p.id));

  return new Map(
    [...latestByActivity].map(([activityId, chainId]) => [
      activityId,
      {
        legs: (legsByChain.get(chainId) ?? []).map((leg) => ({
          label: leg.label,
          assigneeId: active.has(leg.assignee_id) ? leg.assignee_id : "",
          expectedDays: leg.expected_days,
        })),
        departmentIds: deptsByChain.get(chainId) ?? [],
      },
    ]),
  );
}

/** Projects and their units, for the "where does this trail live" picker. */
export async function getTrailFormOptions() {
  await requireTool("/pusher");
  const supabase = await createClient();

  const [projects, units, activities, departments, people, prefills] = await Promise.all([
    supabase.from("projects").select("id, name").order("name"),
    // Completeness matters: a unit missing from this list is a unit
    // nobody can open a trail on, with no error to explain why.
    fetchAll<{ id: string; name: string; project_id: string }>((from, to) =>
      supabase.from("units").select("id, name, project_id").order("id").range(from, to),
    ),
    listActivities(),
    listDepartments(),
    listPeople(),
    getPrefillsByActivity(),
  ]);

  return {
    projects: projects.data ?? [],
    units: units.sort((a, b) => a.name.localeCompare(b.name)),
    activities,
    departments,
    people,
    // A plain object, not the Map: this crosses into a Client Component,
    // and React only serialises plain data as props.
    prefills: Object.fromEntries(prefills) as Record<string, Prefill>,
  };
}

/** Headline counts for the top of the tool. */
export async function getPusherPulse(userId: string) {
  await requireTool("/pusher");
  const supabase = await createClient();

  const running = supabase
    .from("pusher_chain_state")
    .select("chain_id", { count: "exact", head: true })
    .eq("is_finished", false);

  const [live, cold, mine] = await Promise.all([
    running,
    supabase
      .from("pusher_chain_state")
      .select("chain_id", { count: "exact", head: true })
      .eq("is_finished", false)
      .eq("is_stuck", true),
    supabase
      .from("pusher_chain_state")
      .select("chain_id", { count: "exact", head: true })
      .eq("is_finished", false)
      .eq("holder_id", userId),
  ]);

  return {
    live: live.count ?? 0,
    cold: cold.count ?? 0,
    mine: mine.count ?? 0,
  };
}
