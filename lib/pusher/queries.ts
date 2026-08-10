import "server-only";

import { requireTool } from "@/lib/auth/access";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import { cache } from "react";

import { replayChain } from "./chain";
import { buildSchedule, orderStages, type ProjectStage } from "./schedule";
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
  /** Created but never started: no events, no clock, no holder. */
  isQueued: boolean;
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
  is_queued: boolean | null;
  started_at: string | null;
  department_names: string[] | null;
};

const STATE_COLUMNS =
  "chain_id, project_id, project_name, unit_name, activity_name, title, leg_count, current_leg, holder_id, days_in_leg, expected_days, is_stuck, is_finished, is_queued, started_at, department_names";

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
    isQueued: row.is_queued ?? false,
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
  /**
   * "running" (default), "finished", "queued", or "all".
   *
   * Queued trails are excluded from "running" deliberately: a house with
   * a standard set laid down has a dozen of them, and letting them into
   * the running list would bury the trails someone is actually holding
   * under work nobody has started. They are findable — that is what
   * "queued" and "all" are for — but they are never the default answer
   * to "what is in flight".
   */
  status?: "running" | "finished" | "queued" | "all";
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
  if (status === "queued") {
    query = query.eq("is_queued", true);
  } else if (status !== "all") {
    query = query.eq("is_queued", false).eq("is_finished", status === "finished");
  }
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
    activity_id: string;
    label: string | null;
    assignee_id: string;
    expected_days: number;
  }>((from, to) =>
    supabase
      .from("pusher_chain_legs")
      .select("chain_id, leg_no, activity_id, label, assignee_id, expected_days")
      .in("chain_id", chainIds)
      .order("chain_id")
      .order("leg_no")
      .range(from, to),
  );

  for (const row of rows) {
    const list = byChain.get(row.chain_id) ?? [];
    list.push({
      leg_no: row.leg_no,
      activity_id: row.activity_id,
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
    fetchAll<{
      leg_no: number;
      activity_id: string;
      label: string | null;
      assignee_id: string;
      expected_days: number;
    }>((from, to) =>
      supabase
        .from("pusher_chain_legs")
        .select("leg_no, activity_id, label, assignee_id, expected_days")
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
    activity_id: l.activity_id,
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

/**
 * What one activity normally looks like: who last carried it and how
 * many days it was given.
 *
 * The unit of prefill is the ACTIVITY, not the trail (0043). A trail is
 * now a list of activities, so "who normally does the Fire NOC, and how
 * long does it normally take" is the question worth answering — and the
 * answer comes from the most recent LEG of that activity anywhere, which
 * is far better evidence than the last whole trail that happened to
 * mention it.
 */
export type ActivityDefault = { assigneeId: string; expectedDays: number };

export async function getActivityDefaults(): Promise<Map<string, ActivityDefault>> {
  await requireTool("/pusher");
  const supabase = await createClient();

  const [legs, people] = await Promise.all([
    // Completeness matters: a missing leg means an activity silently
    // prefills with the wrong person, which is worse than not at all.
    fetchAll<{
      activity_id: string;
      assignee_id: string;
      expected_days: number;
      created_at: string;
    }>((from, to) =>
      supabase
        .from("pusher_chain_legs")
        .select("activity_id, assignee_id, expected_days, created_at")
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to),
    ),
    listPeople(),
  ]);

  const active = new Set(people.map((p) => p.id));
  const byActivity = new Map<string, ActivityDefault>();

  for (const leg of legs) {
    if (byActivity.has(leg.activity_id)) continue;
    byActivity.set(leg.activity_id, {
      // Someone switched off comes back blank rather than pre-chosen:
      // the guard refuses to land a baton on a deactivated account, so
      // prefilling one only produces a refusal at the last step, on the
      // screen furthest from the cause.
      assigneeId: active.has(leg.assignee_id) ? leg.assignee_id : "",
      expectedDays: leg.expected_days,
    });
  }

  return byActivity;
}

/** Departments used by the last trail of a given type — prefilled like the legs. */
export async function getDepartmentsByTrailSet(): Promise<Map<string, string[]>> {
  await requireTool("/pusher");
  const supabase = await createClient();

  const chains = await fetchAll<{ chain_id: string | null; trail_set_id: string | null }>(
    (from, to) =>
      supabase
        .from("pusher_chain_state")
        .select("chain_id, trail_set_id")
        .not("trail_set_id", "is", null)
        .order("created_at", { ascending: false })
        .order("chain_id")
        .range(from, to),
  );

  const latest = new Map<string, string>();
  for (const c of chains) {
    if (!c.trail_set_id || !c.chain_id) continue;
    if (!latest.has(c.trail_set_id)) latest.set(c.trail_set_id, c.chain_id);
  }

  const chainIds = [...latest.values()];
  if (chainIds.length === 0) return new Map();

  const rows = await fetchAll<{ chain_id: string; department_id: string }>((from, to) =>
    supabase
      .from("pusher_chain_departments")
      .select("chain_id, department_id")
      .in("chain_id", chainIds)
      .order("chain_id")
      .range(from, to),
  );

  const byChain = new Map<string, string[]>();
  for (const r of rows)
    byChain.set(r.chain_id, [...(byChain.get(r.chain_id) ?? []), r.department_id]);

  return new Map([...latest].map(([setId, chainId]) => [setId, byChain.get(chainId) ?? []]));
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
    getActivityDefaults(),
  ]);

  return {
    projects: projects.data ?? [],
    units: units.sort((a, b) => a.name.localeCompare(b.name)),
    activities,
    departments,
    people,
    // A plain object, not the Map: this crosses into a Client Component,
    // and React only serialises plain data as props.
    activityDefaults: Object.fromEntries(prefills) as Record<string, ActivityDefault>,
  };
}

/**
 * Every project with a one-line verdict — the list behind the Projects
 * tab. Three reads for the whole page, however many projects there are.
 */
export async function listProjectSchedules() {
  await requireTool("/pusher");
  const supabase = await createClient();

  const [projects, stages, plans, trails] = await Promise.all([
    supabase.from("projects").select("id, name, code, status").order("name"),
    fetchAll<ProjectStage & { project_id: string }>((from, to) =>
      supabase
        .from("project_stages")
        .select("id, project_id, name, weeks, sort_order")
        .order("id")
        .range(from, to),
    ),
    supabase.from("pusher_project_plans").select("project_id, start_date"),
    // Every trail in the company, but only the four fields the schedule
    // needs. This crosses 1,000 on the first real project, so it pages.
    // project_id is nullable here only because every view column comes
    // back nullable from the type generator — normalised just below.
    fetchAll<{
      project_id: string | null;
      project_stage_id: string | null;
      is_finished: boolean | null;
      is_stuck: boolean | null;
      is_queued: boolean | null;
    }>((from, to) =>
      supabase
        .from("pusher_chain_state")
        .select("project_id, project_stage_id, is_finished, is_stuck, is_queued")
        .order("chain_id")
        .range(from, to),
    ),
  ]);

  const startByProject = new Map(
    (plans.data ?? []).map((p) => [p.project_id, p.start_date as string]),
  );

  return (projects.data ?? []).map((project) => {
    const projectTrails = trails
      .filter((t) => t.project_id === project.id)
      .map((t) => ({
        projectStageId: t.project_stage_id,
        isFinished: t.is_finished ?? false,
        isStuck: t.is_stuck ?? false,
        isQueued: t.is_queued ?? false,
      }));

    return {
      id: project.id,
      name: project.name,
      code: project.code,
      status: project.status,
      // "Live" is a baton with someone. Queued work is counted separately
      // rather than folded in — it is real, but it is not in flight.
      liveTrails: projectTrails.filter((t) => !t.isFinished && !t.isQueued).length,
      queuedTrails: projectTrails.filter((t) => t.isQueued).length,
      stuckTrails: projectTrails.filter((t) => !t.isFinished && t.isStuck).length,
      schedule: buildSchedule(
        stages.filter((s) => s.project_id === project.id),
        projectTrails,
        startByProject.get(project.id) ?? null,
        new Date().toISOString(),
      ),
    };
  });
}

/** One project: its schedule, its stages, and the trails filed under each. */
export async function getProjectSchedule(projectId: string) {
  await requireTool("/pusher");
  const supabase = await createClient();

  const [project, stages, plan, trails, names] = await Promise.all([
    supabase.from("projects").select("id, name, code").eq("id", projectId).maybeSingle(),
    fetchAll<ProjectStage>((from, to) =>
      supabase
        .from("project_stages")
        .select("id, name, weeks, sort_order")
        .eq("project_id", projectId)
        .order("id")
        .range(from, to),
    ),
    supabase
      .from("pusher_project_plans")
      .select("start_date")
      .eq("project_id", projectId)
      .maybeSingle(),
    fetchAll<StateRow & { project_stage_id: string | null }>((from, to) =>
      supabase
        .from("pusher_chain_state")
        .select(`${STATE_COLUMNS}, project_stage_id`)
        .eq("project_id", projectId)
        .order("chain_id")
        .range(from, to),
    ),
    nameMap(),
  ]);

  if (!project.data) return null;

  const rows = trails.map((t) => ({
    ...toRow(t, names),
    projectStageId: t.project_stage_id,
  }));

  return {
    project: project.data,
    startDate: (plan.data?.start_date as string | undefined) ?? null,
    stages: orderStages(stages),
    trails: rows,
    schedule: buildSchedule(
      stages,
      rows.map((r) => ({
        projectStageId: r.projectStageId,
        isFinished: r.isFinished,
        isStuck: r.isStuck,
        isQueued: r.isQueued,
      })),
      (plan.data?.start_date as string | undefined) ?? null,
      new Date().toISOString(),
    ),
  };
}

/** Headline counts for the top of the tool. */
export async function getPusherPulse(userId: string) {
  await requireTool("/pusher");
  const supabase = await createClient();

  // "Live" means a baton is actually with someone. A queued trail is
  // real planned work but nobody is holding it and no clock is running,
  // so counting it here would inflate the one number that is supposed to
  // mean "in flight right now".
  const running = supabase
    .from("pusher_chain_state")
    .select("chain_id", { count: "exact", head: true })
    .eq("is_queued", false)
    .eq("is_finished", false);

  const [live, cold, mine] = await Promise.all([
    running,
    supabase
      .from("pusher_chain_state")
      .select("chain_id", { count: "exact", head: true })
      .eq("is_queued", false)
      .eq("is_finished", false)
      .eq("is_stuck", true),
    // holder_id is null on a queued trail, so this one is already safe —
    // stated anyway so the three counts read as one rule, not two.
    supabase
      .from("pusher_chain_state")
      .select("chain_id", { count: "exact", head: true })
      .eq("is_queued", false)
      .eq("is_finished", false)
      .eq("holder_id", userId),
  ]);

  return {
    live: live.count ?? 0,
    cold: cold.count ?? 0,
    mine: mine.count ?? 0,
  };
}

// ---------------------------------------------------------------------
// Standard trails at the house level
// ---------------------------------------------------------------------

export type TrailSet = {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  activities: {
    itemId: string;
    activityId: string;
    activityName: string;
    /** How long this step is given when the type is laid down. Editable after. */
    expectedDays: number;
    sortOrder: number;
  }[];
};

/**
 * The named standard sets, each with its ordered activities.
 *
 * Two reads, however many sets — the same shape as the schedule reads.
 * A set is a list of ACTIVITIES, never a frozen copy of people and days:
 * the legs are prefilled from each activity's last run at the moment the
 * set is applied, so a leaver's name cannot ride along on every new
 * house forever.
 */
export async function listTrailSets(includeInactive = false): Promise<TrailSet[]> {
  await requireTool("/pusher");
  const supabase = await createClient();

  let setQuery = supabase
    .from("pusher_trail_sets")
    .select("id, name, is_active, sort_order")
    .order("sort_order")
    .order("name");
  if (!includeInactive) setQuery = setQuery.eq("is_active", true);

  const [sets, items] = await Promise.all([
    setQuery,
    // Completeness matters: an activity missing from a set is work that
    // silently never lands on a house, with nothing on screen to explain
    // the gap.
    fetchAll<{
      id: string;
      set_id: string;
      activity_id: string;
      sort_order: number;
      expected_days: number;
    }>((from, to) =>
      supabase
        .from("pusher_trail_set_items")
        .select("id, set_id, activity_id, sort_order, expected_days")
        .order("id")
        .range(from, to),
    ),
  ]);

  if (sets.error) {
    console.error("pusher listTrailSets failed:", sets.error);
    return [];
  }

  const activities = await listActivities(true);
  const nameById = new Map(activities.map((a) => [a.id, a.name]));

  return (sets.data ?? []).map((set) => ({
    id: set.id,
    name: set.name,
    isActive: set.is_active,
    sortOrder: set.sort_order,
    activities: items
      .filter((i) => i.set_id === set.id)
      .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))
      .map((i) => ({
        itemId: i.id,
        activityId: i.activity_id,
        activityName: nameById.get(i.activity_id) ?? "—",
        expectedDays: i.expected_days,
        sortOrder: i.sort_order,
      })),
  }));
}

export type HouseRow = {
  unitId: string;
  unitName: string;
  live: number;
  cold: number;
  queued: number;
  finished: number;
};

/**
 * Every house in a project with its four counts — the list on the
 * project page, and the way into each house.
 *
 * Units come from Masters and are listed even when they have no trails
 * at all: a villa nobody has started work on is exactly the one worth
 * seeing, and leaving it out would make "nothing here yet" invisible.
 */
export async function listProjectHouses(projectId: string): Promise<HouseRow[]> {
  await requireTool("/pusher");
  const supabase = await createClient();

  const [units, trails] = await Promise.all([
    fetchAll<{ id: string; name: string }>((from, to) =>
      supabase
        .from("units")
        .select("id, name")
        .eq("project_id", projectId)
        .order("id")
        .range(from, to),
    ),
    fetchAll<{
      unit_id: string | null;
      is_finished: boolean | null;
      is_stuck: boolean | null;
      is_queued: boolean | null;
    }>((from, to) =>
      supabase
        .from("pusher_chain_state")
        .select("unit_id, is_finished, is_stuck, is_queued")
        .eq("project_id", projectId)
        .order("chain_id")
        .range(from, to),
    ),
  ]);

  return units
    .map((unit) => {
      const mine = trails.filter((t) => t.unit_id === unit.id);
      const running = mine.filter((t) => !t.is_finished && !t.is_queued);
      return {
        unitId: unit.id,
        unitName: unit.name,
        live: running.length,
        cold: running.filter((t) => t.is_stuck).length,
        queued: mine.filter((t) => t.is_queued).length,
        finished: mine.filter((t) => t.is_finished).length,
      };
    })
    .sort((a, b) => a.unitName.localeCompare(b.unitName, undefined, { numeric: true }));
}

/** One house: its trails split into what is running and what is waiting. */
export async function getHouse(projectId: string, unitId: string) {
  await requireTool("/pusher");
  const supabase = await createClient();

  const [unit, project, trails, names] = await Promise.all([
    supabase.from("units").select("id, name").eq("id", unitId).maybeSingle(),
    supabase.from("projects").select("id, name").eq("id", projectId).maybeSingle(),
    fetchAll<StateRow & { project_stage_id: string | null }>((from, to) =>
      supabase
        .from("pusher_chain_state")
        .select(`${STATE_COLUMNS}, project_stage_id`)
        .eq("project_id", projectId)
        .eq("unit_id", unitId)
        .order("chain_id")
        .range(from, to),
    ),
    nameMap(),
  ]);

  if (!unit.data || !project.data) return null;

  const rows = trails.map((t) => ({ ...toRow(t, names), projectStageId: t.project_stage_id }));

  return {
    unit: unit.data,
    project: project.data,
    // Cold first among the running ones — the tool's standing order.
    running: rows
      .filter((r) => !r.isQueued && !r.isFinished)
      .sort((a, b) => Number(b.isStuck) - Number(a.isStuck) || b.daysInLeg - a.daysInLeg),
    queued: rows.filter((r) => r.isQueued),
    finished: rows.filter((r) => r.isFinished),
  };
}
