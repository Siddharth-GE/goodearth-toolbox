import "server-only";

import { isToolLead, requireTool } from "@/lib/auth/access";
import { hourInIndia, todayInIndia } from "@/lib/format";
import { listProgressStages, type ProgressStageRow } from "@/lib/masters/progress-stages";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { assertRead } from "@/lib/supabase/read-failed";
import { createClient } from "@/lib/supabase/server";

import {
  actionBucket,
  compareDone,
  compareOpen,
  loadOf,
  nextAction,
  plotHealth,
  plotNumber,
  plotRail,
  plotStatus,
  setterOf,
  type Health,
  type Load,
  type PlotStatus,
  type Rail,
} from "./next-steps";
import type { ActionStatus, ActionTrack, KaadalStage } from "./stages";

/**
 * Reads for the Saarang tracker's screens inside Client Relations — the
 * Actions board and the plot cards (root plan.md, seventh piece).
 *
 * Every export opens with requireTool("/client-relations"). Which plots and
 * actions come back is the database's answer, not this file's (0123): a
 * member sees the plots they own or hold an open action on, and the
 * actions they own, set, or that sit on their plots; an admin or a team
 * lead sees everything. So every count here is a count of what the viewer
 * may see. Who opens on whose list is decided here.
 *
 * Small on purpose: Saarang is ~70 plots and a few hundred actions a year,
 * so each screen reads its slice whole (fetchAll) and works in memory —
 * the same choice the dues board makes, and for the same reason: a count
 * worked out from a truncated page is a wrong number that looks right.
 */

const GRANT = "/client-relations";

type Supabase = Awaited<ReturnType<typeof createClient>>;

function fail(context: string, error: { message: string } | null): asserts error is null {
  assertRead("Client Relations", context, error);
}

export type Person = { id: string; name: string };

/** Who an action or a plot can be given to — client_relations_team() (0120). */
export async function readTeam(supabase: Supabase): Promise<Person[]> {
  await requireTool(GRANT);
  const { data, error } = await supabase.rpc("client_relations_team");
  fail("the team", error);
  return (data ?? []).map((row) => ({ id: row.id, name: row.full_name ?? "—" }));
}

export async function getTeam(): Promise<Person[]> {
  await requireTool(GRANT);
  return readTeam(await createClient());
}

async function namesFor(supabase: Supabase, ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const { data, error } = await supabase.from("profiles").select("id, full_name").in("id", unique);
  fail("staff names", error);
  return new Map((data ?? []).map((row) => [row.id, row.full_name ?? "—"]));
}

// ---------------------------------------------------------------------
// Plots, as the tracker named them
// ---------------------------------------------------------------------

/**
 * `plots!units_plot_id_fkey` names its key: units has two FKs to plots
 * (BUGCATCHER #2, and the note on ENGAGEMENT_SELECT in queries.ts).
 */
const PLOT_SELECT = `
  id, project_id, crm_owner_id, kaadal_owner_id, kaadal_stage, progress_stage_id,
  sale_deed_status, ca_status, updated_at,
  units!inner (
    id, name, code, status, unit_type,
    plots!units_plot_id_fkey ( name, code ),
    clients ( id, name ),
    projects ( id, name )
  )
`;

type PlotRecord = {
  id: string;
  project_id: string;
  crm_owner_id: string | null;
  kaadal_owner_id: string | null;
  kaadal_stage: string | null;
  progress_stage_id: string | null;
  sale_deed_status: string;
  ca_status: string;
  updated_at: string;
  units: {
    id: string;
    name: string;
    code: string | null;
    status: string;
    unit_type: string | null;
    plots: { name: string; code: string | null } | null;
    clients: { id: string; name: string } | null;
    projects: { id: string; name: string } | null;
  };
};

export type PlotRef = {
  engagementId: string;
  unitId: string;
  /** "10", "22-23" — set in monospace. */
  number: string;
  /** For sorting: the plot code, compared numerically. */
  sortKey: string;
  clientId: string | null;
  clientName: string | null;
  projectId: string;
  projectName: string;
  unitStatus: string;
  /** Masters' villa name — "Villa 3 (1BHK Study)" carries its configuration. */
  unitName: string;
};

function toRef(record: PlotRecord): PlotRef {
  const unit = record.units;
  return {
    engagementId: record.id,
    unitId: unit.id,
    number: plotNumber(unit.plots?.code ?? unit.code, unit.plots?.name ?? unit.name),
    sortKey: unit.plots?.code ?? unit.code ?? unit.name,
    clientId: unit.clients?.id ?? null,
    clientName: unit.clients?.name ?? null,
    projectId: record.project_id,
    projectName: unit.projects?.name ?? "—",
    unitStatus: unit.status,
    unitName: unit.name,
  };
}

export function comparePlots(a: PlotRef, b: PlotRef): number {
  return (
    a.projectName.localeCompare(b.projectName) ||
    a.sortKey.localeCompare(b.sortKey, "en", { numeric: true })
  );
}

async function loadPlots(supabase: Supabase, engagementIds?: string[]): Promise<PlotRecord[]> {
  if (engagementIds && engagementIds.length === 0) return [];
  const data = await fetchAll((from, to) => {
    let query = supabase.from("client_engagements").select(PLOT_SELECT);
    if (engagementIds) query = query.in("id", engagementIds);
    return query.order("id").range(from, to);
  });
  return data as unknown as PlotRecord[];
}

// ---------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------

type StepRecord = {
  id: string;
  engagement_id: string | null;
  action: string;
  owner_id: string;
  due_on: string | null;
  due_assumed: boolean;
  status: string;
  track: string;
  notes: string | null;
  done_on: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

const STEP_SELECT =
  "id, engagement_id, action, owner_id, due_on, due_assumed, status, track, notes, done_on, created_at, updated_at, created_by, updated_by";

export type NextStep = {
  id: string;
  engagementId: string | null;
  action: string;
  ownerId: string;
  ownerName: string;
  dueOn: string | null;
  dueAssumed: boolean;
  status: ActionStatus;
  track: ActionTrack;
  notes: string | null;
  doneOn: string | null;
  /** Who set it — the one who closes it, with a manager (0121). */
  createdBy: string | null;
  setterName: string;
  /** "Edited 15 Oct by Saurav", or "Added 29 Sep by Anu". */
  stamp: { edited: boolean; on: string; by: string | null };
  plot: PlotRef | null;
};

async function loadSteps(
  supabase: Supabase,
  scope: { engagementIds?: string[]; open?: boolean },
): Promise<StepRecord[]> {
  if (scope.engagementIds && scope.engagementIds.length === 0) return [];
  const data = await fetchAll((from, to) => {
    let query = supabase.from("client_actions").select(STEP_SELECT);
    if (scope.engagementIds) query = query.in("engagement_id", scope.engagementIds);
    if (scope.open) query = query.neq("status", "done");
    return query.order("id").range(from, to);
  });
  return data as StepRecord[];
}

/** A row edited more than a minute after it was made says "Edited". */
function stampOf(record: StepRecord, names: Map<string, string>): NextStep["stamp"] {
  const edited = Date.parse(record.updated_at) - Date.parse(record.created_at) > 60_000;
  const by = edited ? record.updated_by : record.created_by;
  return {
    edited,
    on: (edited ? record.updated_at : record.created_at).slice(0, 10),
    by: by ? (names.get(by)?.split(" ")[0] ?? null) : null,
  };
}

function toStep(
  record: StepRecord,
  names: Map<string, string>,
  plots: Map<string, PlotRef>,
): NextStep {
  return {
    id: record.id,
    engagementId: record.engagement_id,
    action: record.action,
    ownerId: record.owner_id,
    ownerName: names.get(record.owner_id) ?? "—",
    dueOn: record.due_on,
    dueAssumed: record.due_assumed,
    status: record.status as ActionStatus,
    track: record.track as ActionTrack,
    notes: record.notes,
    doneOn: record.done_on,
    createdBy: record.created_by,
    setterName: names.get(record.created_by ?? record.owner_id) ?? "—",
    stamp: stampOf(record, names),
    plot: record.engagement_id ? (plots.get(record.engagement_id) ?? null) : null,
  };
}

function stepPeople(records: StepRecord[]): string[] {
  return records.flatMap((r) => [r.owner_id, r.created_by ?? "", r.updated_by ?? ""]);
}

// ---------------------------------------------------------------------
// The Actions board
// ---------------------------------------------------------------------

export type BoardFilters = {
  project?: string;
  /** Only the Kaadal track. */
  kaadal?: boolean;
  /** "" = the default (a manager sees everyone, a member their own), "all", "mgmt", or a person's id. */
  who?: string;
  showDone?: boolean;
};

export type ActionsBoard = {
  today: string;
  hour: number;
  /**
   * isManager: an admin — closes anyone's action (0121). seesAll: an admin
   * or a team lead (0122) — everyone's work, and the team view.
   */
  me: { id: string; name: string; isManager: boolean; seesAll: boolean };
  team: Person[];
  /** Resolved: "all", "mgmt", or a person's id. */
  who: string;
  /** The list on screen: open steps, plus the latest done when asked. */
  steps: NextStep[];
  doneCount: number;
  /** Each team member's load across the scope (project / Kaadal), whatever `who` shows. */
  loads: { person: Person; load: Load }[];
  myLoad: Load;
  /** Finished by their owners, waiting for my tick. */
  myToConfirm: number;
  management: number;
  /** Every plot, for the composer's plot picker. */
  plots: PlotRef[];
  projects: { id: string; name: string }[];
  kpis: { sold: number; deedsSigned: number; casSigned: number; needCa: number };
};

const DONE_SHOWN = 30;

export async function getActionsBoard(filters: BoardFilters = {}): Promise<ActionsBoard> {
  const user = await requireTool(GRANT);
  const supabase = await createClient();
  const today = todayInIndia();
  const isManager = user.profile?.role === "admin";

  const [seesAll, team, plotRecords, open, doneCountRes] = await Promise.all([
    isToolLead(user, GRANT),
    readTeam(supabase),
    loadPlots(supabase),
    loadSteps(supabase, { open: true }),
    supabase
      .from("client_actions")
      .select("id", { count: "exact", head: true })
      .eq("status", "done"),
  ]);
  fail("done actions", doneCountRes.error);

  let done: StepRecord[] = [];
  if (filters.showDone) {
    const { data, error } = await supabase
      .from("client_actions")
      .select(STEP_SELECT)
      .eq("status", "done")
      .order("done_on", { ascending: false })
      .order("id")
      .limit(DONE_SHOWN);
    fail("done actions", error);
    done = (data ?? []) as StepRecord[];
  }

  const plots = new Map(plotRecords.map((record) => [record.id, toRef(record)]));
  const names = await namesFor(supabase, [user.id, ...stepPeople([...open, ...done])]);
  const all = [...open, ...done].map((record) => toStep(record, names, plots));

  const inScope = (step: NextStep) => {
    if (filters.kaadal && step.track !== "kaadal") return false;
    if (filters.project && step.plot?.projectId !== filters.project) return false;
    return true;
  };
  const scoped = all.filter(inScope);
  const scopedOpen = scoped.filter((step) => step.status !== "done");

  const who = filters.who || (seesAll ? "all" : user.id);
  const shown = scoped.filter((step) => {
    if (who === "mgmt") return step.status === "waiting_management";
    if (who === "all") return true;
    // A person's list holds what they own, and what they set that waits for their tick.
    return (
      step.ownerId === who || (step.status === "awaiting_confirmation" && setterOf(step) === who)
    );
  });

  const openShown = shown.filter((step) => step.status !== "done");
  openShown.sort(
    (a, b) =>
      compareOpen(
        { dueOn: a.dueOn, plotSort: a.plot?.sortKey },
        { dueOn: b.dueOn, plotSort: b.plot?.sortKey },
      ) || a.id.localeCompare(b.id),
  );
  const doneShown = shown.filter((step) => step.status === "done").sort(compareDone);

  const loads = team.map((person) => ({
    person,
    load: loadOf(
      scopedOpen.filter((step) => step.ownerId === person.id),
      today,
    ),
  }));

  const scopedPlots = [...plots.values()].filter(
    (plot) => !filters.project || plot.projectId === filters.project,
  );
  const sold = plotRecords.filter(
    (record) => record.units.clients && (!filters.project || record.project_id === filters.project),
  );

  const projects = new Map<string, string>();
  for (const plot of plots.values()) projects.set(plot.projectId, plot.projectName);

  return {
    today,
    hour: hourInIndia(),
    me: {
      id: user.id,
      name: names.get(user.id) ?? user.profile?.full_name ?? "",
      isManager,
      seesAll,
    },
    team,
    who,
    steps: [...openShown, ...doneShown],
    doneCount: doneCountRes.count ?? 0,
    loads,
    myLoad: loadOf(
      scopedOpen.filter((step) => step.ownerId === user.id),
      today,
    ),
    myToConfirm: scopedOpen.filter(
      (step) => step.status === "awaiting_confirmation" && setterOf(step) === user.id,
    ).length,
    management: scopedOpen.filter((step) => actionBucket(step, today) === "management").length,
    plots: scopedPlots.sort(comparePlots),
    projects: [...projects]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    kpis: {
      sold: sold.length,
      deedsSigned: sold.filter((r) => r.sale_deed_status === "signed").length,
      casSigned: sold.filter((r) => r.ca_status === "signed").length,
      needCa: sold.filter((r) => r.sale_deed_status === "signed" && r.ca_status !== "signed")
        .length,
    },
  };
}

/** Counts only, for the welcome screen — never a rupee. */
export async function getActionCounts(): Promise<{
  overdue: number;
  week: number;
  management: number;
}> {
  await requireTool(GRANT);
  const supabase = await createClient();
  const today = todayInIndia();
  const open = await loadSteps(supabase, { open: true });
  const load = loadOf(
    open.map((r) => ({ status: r.status, dueOn: r.due_on, dueAssumed: r.due_assumed })),
    today,
  );
  return { overdue: load.overdue, week: load.week, management: load.management };
}

// ---------------------------------------------------------------------
// Plot cards
// ---------------------------------------------------------------------

export type PlotCard = PlotRef & {
  ownerId: string | null;
  ownerName: string | null;
  kaadalStage: KaadalStage | null;
  stageName: string | null;
  status: PlotStatus;
  health: Health | null;
  rail: Rail;
  next: { action: string; dueOn: string | null; dueAssumed: boolean; status: string } | null;
  openCount: number;
};

/** Where each stage sits in the Masters list, and which one is the handover. */
export function stageIndex(stages: ProgressStageRow[]) {
  const order = new Map(stages.map((stage, index) => [stage.id, index]));
  const active = stages.map((stage, index) => (stage.is_active ? index : -1)).filter((i) => i >= 0);
  return {
    indexOf: (id: string | null) => (id ? (order.get(id) ?? -1) : -1),
    finalIndex: active.length ? active[active.length - 1] : -1,
    nameOf: (id: string | null) => (id ? (stages.find((s) => s.id === id)?.name ?? null) : null),
  };
}

function buildCard(
  record: PlotRecord,
  steps: StepRecord[],
  stages: ReturnType<typeof stageIndex>,
  names: Map<string, string>,
  today: string,
): PlotCard {
  const ref = toRef(record);
  const plot = {
    hasBuyer: Boolean(ref.clientId),
    unitStatus: ref.unitStatus,
    saleDeedStatus: record.sale_deed_status,
    caStatus: record.ca_status,
    stageIndex: stages.indexOf(record.progress_stage_id),
    finalIndex: stages.finalIndex,
  };
  const inputs = steps.map((s) => ({
    status: s.status,
    dueOn: s.due_on,
    dueAssumed: s.due_assumed,
  }));
  const lastTouched = [record.updated_at, ...steps.map((s) => s.updated_at)]
    .sort()
    .at(-1)!
    .slice(0, 10);
  const next = nextAction(steps.map((s) => ({ ...s, status: s.status, dueOn: s.due_on })));

  return {
    ...ref,
    ownerId: record.crm_owner_id,
    ownerName: record.crm_owner_id ? (names.get(record.crm_owner_id) ?? null) : null,
    kaadalStage: record.kaadal_stage as KaadalStage | null,
    stageName: stages.nameOf(record.progress_stage_id),
    status: plotStatus(plot),
    health: plotHealth({ ...plot, lastTouched }, inputs, today),
    rail: plotRail(plot),
    next: next
      ? {
          action: next.action,
          dueOn: next.due_on,
          dueAssumed: next.due_assumed,
          status: next.status,
        }
      : null,
    openCount: steps.filter((s) => s.status !== "done").length,
  };
}

/** Cards for some plots — a client's page, or a plot's own header. */
export async function readPlotCards(
  supabase: Supabase,
  engagementIds: string[],
  today: string,
): Promise<Map<string, PlotCard>> {
  await requireTool(GRANT);
  const [records, steps, stages] = await Promise.all([
    loadPlots(supabase, engagementIds),
    loadSteps(supabase, { engagementIds }),
    listProgressStages(),
  ]);
  const index = stageIndex(stages);
  const names = await namesFor(
    supabase,
    records.map((r) => r.crm_owner_id ?? ""),
  );
  return new Map(
    records.map((record) => [
      record.id,
      buildCard(
        record,
        steps.filter((s) => s.engagement_id === record.id),
        index,
        names,
        today,
      ),
    ]),
  );
}

/** Every step on these plots, open first by date, then the done ones. */
export async function readPlotSteps(
  supabase: Supabase,
  engagementIds: string[],
): Promise<Map<string, NextStep[]>> {
  await requireTool(GRANT);
  const [records, steps] = await Promise.all([
    loadPlots(supabase, engagementIds),
    loadSteps(supabase, { engagementIds }),
  ]);
  const plots = new Map(records.map((record) => [record.id, toRef(record)]));
  const names = await namesFor(supabase, stepPeople(steps));
  const byPlot = new Map<string, NextStep[]>();
  for (const record of steps) {
    if (!record.engagement_id) continue;
    const list = byPlot.get(record.engagement_id) ?? [];
    list.push(toStep(record, names, plots));
    byPlot.set(record.engagement_id, list);
  }
  for (const list of byPlot.values()) {
    list.sort((a, b) => {
      if ((a.status === "done") !== (b.status === "done")) return a.status === "done" ? 1 : -1;
      return a.status === "done"
        ? compareDone(a, b)
        : compareOpen({ dueOn: a.dueOn }, { dueOn: b.dueOn });
    });
  }
  return byPlot;
}

export type PlotFilters = { project?: string; who?: string; health?: string; q?: string };

export type PlotBoard = {
  cards: PlotCard[];
  /** Before the health filter: how many each chip would show. */
  counts: Record<Health | "all", number>;
  projects: { id: string; name: string }[];
  team: Person[];
  /** An admin or a team lead (0122): these are everyone's plots, not the viewer's own. */
  seesAll: boolean;
};

export async function getPlotBoard(filters: PlotFilters = {}): Promise<PlotBoard> {
  const user = await requireTool(GRANT);
  const supabase = await createClient();
  const today = todayInIndia();

  const [records, steps, stages, team, seesAll] = await Promise.all([
    loadPlots(supabase),
    loadSteps(supabase, {}),
    listProgressStages(),
    readTeam(supabase),
    isToolLead(user, GRANT),
  ]);
  const index = stageIndex(stages);
  const names = await namesFor(
    supabase,
    records.map((r) => r.crm_owner_id ?? ""),
  );

  const stepsByPlot = new Map<string, StepRecord[]>();
  for (const step of steps) {
    if (!step.engagement_id) continue;
    const list = stepsByPlot.get(step.engagement_id) ?? [];
    list.push(step);
    stepsByPlot.set(step.engagement_id, list);
  }

  const projects = new Map<string, string>();
  const search = filters.q?.trim().toLowerCase() ?? "";

  let cards = records
    .map((record) => {
      projects.set(record.project_id, record.units.projects?.name ?? "—");
      return buildCard(record, stepsByPlot.get(record.id) ?? [], index, names, today);
    })
    .filter((card) => !filters.project || card.projectId === filters.project)
    .filter((card) => {
      const who = filters.who;
      if (!who || who === "all") return true;
      const open = (stepsByPlot.get(card.engagementId) ?? []).filter((s) => s.status !== "done");
      if (who === "mgmt") return open.some((s) => s.status === "waiting_management");
      const record = records.find((r) => r.id === card.engagementId)!;
      return (
        record.crm_owner_id === who ||
        record.kaadal_owner_id === who ||
        open.some((s) => s.owner_id === who)
      );
    })
    .filter(
      (card) =>
        !search ||
        card.number.toLowerCase().includes(search) ||
        (card.clientName ?? "").toLowerCase().includes(search),
    );

  const counts = { all: cards.length } as PlotBoard["counts"];
  for (const health of [
    "overdue",
    "management",
    "no_next_step",
    "stale",
    "on_track",
    "handed_over",
  ] as Health[]) {
    counts[health] = cards.filter((card) => card.health === health).length;
  }
  if (filters.health) cards = cards.filter((card) => card.health === filters.health);

  return {
    cards: cards.sort(comparePlots),
    counts,
    projects: [...projects]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    team,
    seesAll,
  };
}

/**
 * What a plot's or a client's page needs to host action cards and a
 * composer: today, the team, every plot (for "move to another plot") and
 * each person's open count (for the owner menu).
 */
export async function getBoardBasics(): Promise<{
  today: string;
  meId: string;
  isManager: boolean;
  seesAll: boolean;
  team: Person[];
  plots: PlotRef[];
  openByOwner: Record<string, number>;
}> {
  const user = await requireTool(GRANT);
  const supabase = await createClient();
  const [seesAll, team, records, open] = await Promise.all([
    isToolLead(user, GRANT),
    readTeam(supabase),
    loadPlots(supabase),
    loadSteps(supabase, { open: true }),
  ]);
  const openByOwner: Record<string, number> = {};
  for (const step of open) openByOwner[step.owner_id] = (openByOwner[step.owner_id] ?? 0) + 1;
  return {
    today: todayInIndia(),
    meId: user.id,
    isManager: user.profile?.role === "admin",
    seesAll,
    team,
    plots: records.map(toRef).sort(comparePlots),
    openByOwner,
  };
}
