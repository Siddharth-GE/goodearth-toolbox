import "server-only";

import { requireTool } from "@/lib/auth/access";
import { hourInIndia, todayInIndia } from "@/lib/format";
import { plotNumber } from "@/lib/masters/plot-number";
import {
  actionBucket,
  compareDone,
  compareOpen,
  daysBetween,
  loadOf,
  nextAction,
  type Load,
} from "@/lib/next-steps/rules";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { assertRead } from "@/lib/supabase/read-failed";
import { createClient } from "@/lib/supabase/server";

import {
  historyLines,
  placeOf,
  railOf,
  revisingLabel,
  revisionCounts,
  stepStatus,
  villaHealth,
  type BoardStage,
  type HistoryLine,
  type Place,
  type RailSegment,
  type StepStatus,
  type VillaHealth,
} from "./board";
import { GRANT } from "./shared";

/**
 * Reads for the design board (root plan.md, thirteenth piece): the Board,
 * a villa's stages, actions and history, the Actions list, the welcome.
 *
 * Every export opens with requireTool("/design-management"). Everyone
 * holding the grant sees every villa (0126 — the founder took the open
 * recommendation); who opens on whose list is decided here, never by a
 * policy. Small on purpose: ~70 villas, a few hundred steps and actions,
 * so each screen reads its slice whole (fetchAll) and works in memory — a
 * count from a truncated page is a wrong number that looks right.
 *
 * Names merge through Maps, never an embed of `profiles`: design_steps,
 * design_step_events and design_actions each carry several FKs to it
 * (BUGCATCHER #2). `units` reaches `plots` through two FKs, so that embed
 * names its key.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>;

function fail(context: string, error: { message: string } | null): asserts error is null {
  assertRead("Design Management", context, error);
}

export type Person = { id: string; name: string };

export type Me = { id: string; name: string; isManager: boolean };

async function readMe(): Promise<Me> {
  const user = await requireTool(GRANT);
  return {
    id: user.id,
    name: user.profile?.full_name ?? "",
    isManager: user.profile?.role === "admin",
  };
}

/** Who can be put on a stage or own an action — design_team() (0126). */
async function readTeam(supabase: Supabase): Promise<Person[]> {
  const { data, error } = await supabase.rpc("design_team");
  fail("the design team", error);
  return (data ?? []).map((row) => ({ id: row.id, name: row.full_name ?? "—" }));
}

async function namesFor(supabase: Supabase, ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return new Map();
  const rows = await fetchAll<{ id: string; full_name: string | null }>((from, to) =>
    supabase.from("profiles").select("id, full_name").in("id", unique).order("id").range(from, to),
  );
  return new Map(rows.map((row) => [row.id, row.full_name ?? "—"]));
}

// ---------------------------------------------------------------------
// Stages and villas
// ---------------------------------------------------------------------

type StageRecord = {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  on_board: boolean;
};

async function readStages(
  supabase: Supabase,
): Promise<{ board: BoardStage[]; names: Map<string, string> }> {
  const rows = await fetchAll<StageRecord>((from, to) =>
    supabase
      .from("design_stages")
      .select("id, name, sort_order, is_active, on_board")
      .order("sort_order")
      .order("name")
      .order("id")
      .range(from, to),
  );
  return {
    board: rows
      .filter((stage) => stage.on_board && stage.is_active)
      .map((stage) => ({ id: stage.id, name: stage.name })),
    names: new Map(rows.map((stage) => [stage.id, stage.name])),
  };
}

export type VillaRef = {
  unitId: string;
  /** "41", "22-23" — set in monospace. */
  number: string;
  /** For sorting: the plot code, compared numerically. */
  sortKey: string;
  villaName: string;
  clientName: string | null;
  projectId: string;
  projectName: string;
};

const UNIT_SELECT = `
  id, name, code, project_id,
  plots!units_plot_id_fkey ( name, code ),
  clients ( name ),
  projects ( name )
`;

type UnitRecord = {
  id: string;
  name: string;
  code: string | null;
  project_id: string;
  plots: { name: string; code: string | null } | null;
  clients: { name: string } | null;
  projects: { name: string } | null;
};

function toRef(unit: UnitRecord): VillaRef {
  return {
    unitId: unit.id,
    number: plotNumber(unit.plots?.code ?? unit.code, unit.plots?.name ?? unit.name),
    sortKey: unit.plots?.code ?? unit.code ?? unit.name,
    villaName: unit.name,
    clientName: unit.clients?.name ?? null,
    projectId: unit.project_id,
    projectName: unit.projects?.name ?? "—",
  };
}

function compareVillas(a: VillaRef, b: VillaRef): number {
  return (
    a.projectName.localeCompare(b.projectName) ||
    a.sortKey.localeCompare(b.sortKey, "en", { numeric: true }) ||
    a.unitId.localeCompare(b.unitId)
  );
}

async function readVillas(supabase: Supabase): Promise<VillaRef[]> {
  const rows = await fetchAll<UnitRecord>((from, to) =>
    supabase.from("units").select(UNIT_SELECT).order("id").range(from, to),
  );
  return rows.map(toRef).sort(compareVillas);
}

// ---------------------------------------------------------------------
// Steps, people, actions
// ---------------------------------------------------------------------

type StepRecord = {
  id: string;
  unit_id: string;
  design_stage_id: string;
  status: string;
  note: string | null;
  reason: string | null;
  started_on: string | null;
  done_on: string | null;
  updated_at: string;
};

const STEP_SELECT =
  "id, unit_id, design_stage_id, status, note, reason, started_on, done_on, updated_at";

type ActionRecord = {
  id: string;
  unit_id: string | null;
  design_stage_id: string | null;
  action: string;
  owner_id: string;
  due_on: string | null;
  status: string;
  notes: string | null;
  done_on: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

const ACTION_SELECT =
  "id, unit_id, design_stage_id, action, owner_id, due_on, status, notes, done_on, created_by, updated_by, created_at, updated_at";

export type DesignAction = {
  id: string;
  unitId: string | null;
  villa: VillaRef | null;
  stageId: string | null;
  stageName: string | null;
  action: string;
  ownerId: string;
  ownerName: string;
  dueOn: string | null;
  status: string;
  notes: string | null;
  doneOn: string | null;
  createdBy: string | null;
  setterName: string;
  /** "Added 15 Oct by Navarang" / "Edited …". */
  stamp: { edited: boolean; on: string; by: string | null };
  sortKey: string;
};

function toAction(
  row: ActionRecord,
  villas: Map<string, VillaRef>,
  stageNames: Map<string, string>,
  names: Map<string, string>,
): DesignAction {
  const villa = row.unit_id ? (villas.get(row.unit_id) ?? null) : null;
  const edited = row.updated_at.slice(0, 16) !== row.created_at.slice(0, 16);
  const stampBy = edited ? (row.updated_by ?? row.created_by) : row.created_by;
  const setter = row.created_by ?? row.owner_id;
  return {
    id: row.id,
    unitId: row.unit_id,
    villa,
    stageId: row.design_stage_id,
    stageName: row.design_stage_id ? (stageNames.get(row.design_stage_id) ?? null) : null,
    action: row.action,
    ownerId: row.owner_id,
    ownerName: names.get(row.owner_id) ?? "—",
    dueOn: row.due_on,
    status: row.status,
    notes: row.notes,
    doneOn: row.done_on,
    createdBy: row.created_by,
    setterName: names.get(setter) ?? "—",
    stamp: {
      edited,
      on: (edited ? row.updated_at : row.created_at).slice(0, 10),
      by: stampBy ? (names.get(stampBy)?.split(" ")[0] ?? null) : null,
    },
    sortKey: villa ? `${villa.projectName} ${villa.sortKey}` : "",
  };
}

function sortActions(actions: DesignAction[]): DesignAction[] {
  const open = actions.filter((a) => a.status !== "done").sort(compareOpen);
  const done = actions.filter((a) => a.status === "done").sort(compareDone);
  return [...open, ...done];
}

// ---------------------------------------------------------------------
// The Board
// ---------------------------------------------------------------------

export type VillaCard = VillaRef & {
  place: Place;
  /** The stage it sits at; null when nothing has started. */
  placeName: string | null;
  currentStatus: StepStatus | null;
  rail: RailSegment[];
  /** "Revising Design · 2nd time" for each earlier stage sent back. */
  revising: string[];
  /** On the stage it sits at. */
  people: Person[];
  /** Days since the stage it sits at started. */
  daysInStage: number | null;
  next: { action: string; dueOn: string | null; status: string } | null;
  health: VillaHealth | null;
  mine: boolean;
};

export type BoardBasics = {
  today: string;
  me: Me;
  team: Person[];
  stages: BoardStage[];
  villas: VillaRef[];
  /** Open actions per person, for the owner menu. */
  openByOwner: Record<string, number>;
};

type BoardData = BoardBasics & {
  cards: VillaCard[];
  steps: StepRecord[];
  peopleByStep: Map<string, Person[]>;
  actions: DesignAction[];
  revisions: Map<string, number>;
  stageNames: Map<string, string>;
};

/** Everything the board's screens share, read once. */
async function readBoard(): Promise<BoardData> {
  const me = await readMe();
  const supabase = await createClient();
  const today = todayInIndia();

  const [team, stages, villas, steps, people, actionRows, sendBacks] = await Promise.all([
    readTeam(supabase),
    readStages(supabase),
    readVillas(supabase),
    fetchAll<StepRecord>((from, to) =>
      supabase.from("design_steps").select(STEP_SELECT).order("id").range(from, to),
    ),
    fetchAll<{ step_id: string; profile_id: string; added_at: string }>((from, to) =>
      supabase
        .from("design_step_people")
        .select("step_id, profile_id, added_at")
        .order("added_at")
        .order("id")
        .range(from, to),
    ),
    fetchAll<ActionRecord>((from, to) =>
      supabase.from("design_actions").select(ACTION_SELECT).order("id").range(from, to),
    ),
    fetchAll<{ step_id: string; kind: string; to_status: string | null }>((from, to) =>
      supabase
        .from("design_step_events")
        .select("step_id, kind, to_status")
        .eq("kind", "status")
        .eq("to_status", "revising")
        .order("id")
        .range(from, to),
    ),
  ]);

  const names = await namesFor(supabase, [
    ...people.map((row) => row.profile_id),
    ...actionRows.flatMap((row) => [row.owner_id, row.created_by, row.updated_by]),
  ]);

  const villaById = new Map(villas.map((villa) => [villa.unitId, villa]));
  const peopleByStep = new Map<string, Person[]>();
  for (const row of people) {
    const list = peopleByStep.get(row.step_id) ?? [];
    list.push({ id: row.profile_id, name: names.get(row.profile_id) ?? "—" });
    peopleByStep.set(row.step_id, list);
  }
  const actions = sortActions(
    actionRows.map((row) => toAction(row, villaById, stages.names, names)),
  );
  const revisions = revisionCounts(
    sendBacks.map((row) => ({ stepId: row.step_id, kind: row.kind, toStatus: row.to_status })),
  );

  const stepsByUnit = new Map<string, StepRecord[]>();
  for (const step of steps) {
    stepsByUnit.set(step.unit_id, [...(stepsByUnit.get(step.unit_id) ?? []), step]);
  }
  const actionsByUnit = new Map<string, DesignAction[]>();
  for (const action of actions) {
    if (!action.unitId) continue;
    actionsByUnit.set(action.unitId, [...(actionsByUnit.get(action.unitId) ?? []), action]);
  }
  const boardIds = new Set(stages.board.map((stage) => stage.id));

  const cards: VillaCard[] = villas.map((villa) => {
    const own = (stepsByUnit.get(villa.unitId) ?? []).filter((step) =>
      boardIds.has(step.design_stage_id),
    );
    const lite = own.map((step) => ({ stageId: step.design_stage_id, status: step.status }));
    const place = placeOf(stages.board, lite);
    const rail = railOf(stages.board, lite);
    const currentStage = place.index >= 0 ? stages.board[place.index] : null;
    const current = currentStage
      ? (own.find((step) => step.design_stage_id === currentStage.id) ?? null)
      : null;
    const earlier = rail.slice(0, Math.max(place.index, 0));
    const revisingSteps = own.filter(
      (step) =>
        step.status === "revising" &&
        earlier.some((segment) => segment.stageId === step.design_stage_id),
    );
    const villaActions = actionsByUnit.get(villa.unitId) ?? [];
    const onCurrent = current ? (peopleByStep.get(current.id) ?? []) : [];
    const touched = [
      ...own.map((step) => step.updated_at),
      ...villaActions.map((action) => action.stamp.on),
    ].sort();
    const mine =
      own.some((step) => (peopleByStep.get(step.id) ?? []).some((p) => p.id === me.id)) ||
      villaActions.some(
        (action) =>
          action.status !== "done" && (action.ownerId === me.id || action.createdBy === me.id),
      );
    const next = nextAction(villaActions);
    const currentStatus = current ? stepStatus(current.status).value : null;

    return {
      ...villa,
      place,
      placeName: currentStage?.name ?? null,
      currentStatus,
      rail,
      revising: revisingSteps.map((step) =>
        revisingLabel(
          stages.names.get(step.design_stage_id) ?? "a stage",
          revisions.get(step.id) ?? 1,
        ),
      ),
      people: onCurrent,
      daysInStage: current?.started_on ? daysBetween(current.started_on, today) : null,
      next: next ? { action: next.action, dueOn: next.dueOn, status: next.status } : null,
      health: villaHealth(
        {
          place,
          currentStatus,
          revising: revisingSteps.length > 0,
          peopleOnCurrent: onCurrent.length,
          lastTouched: touched[touched.length - 1] ?? null,
        },
        villaActions,
        today,
      ),
      mine,
    };
  });

  const openByOwner: Record<string, number> = {};
  for (const action of actions) {
    const bucket = actionBucket(action, today);
    if (bucket === "done" || bucket === "confirm") continue;
    openByOwner[action.ownerId] = (openByOwner[action.ownerId] ?? 0) + 1;
  }

  return {
    today,
    me,
    team,
    stages: stages.board,
    villas,
    openByOwner,
    cards,
    steps,
    peopleByStep,
    actions,
    revisions,
    stageNames: stages.names,
  };
}

function basicsOf(data: BoardData): BoardBasics {
  const { today, me, team, stages, villas, openByOwner } = data;
  return { today, me, team, stages, villas, openByOwner };
}

export type BoardFilters = { q?: string; project?: string; who?: string; health?: string };

export type DesignBoard = BoardBasics & {
  /** Villas with something started, after every filter, in board order. */
  cards: VillaCard[];
  /** Villas with nothing started, after the search and project filters. */
  notStarted: VillaCard[];
  /** "mine" or "all" — what the board is showing. */
  who: "mine" | "all";
  projects: { id: string; name: string }[];
  counts: Record<VillaHealth | "all", number>;
};

export async function getDesignBoard(filters: BoardFilters): Promise<DesignBoard> {
  await requireTool(GRANT);
  const data = await readBoard();

  // A manager opens on everyone; anyone else on their own villas — or on
  // everyone while they have none yet, so a first visit is never empty.
  const hasMine = data.cards.some((card) => card.mine);
  const who: "mine" | "all" =
    filters.who === "all" || filters.who === "mine"
      ? filters.who
      : data.me.isManager || !hasMine
        ? "all"
        : "mine";

  const needle = filters.q?.trim().toLowerCase() ?? "";
  const matches = (card: VillaCard) =>
    (!filters.project || card.projectId === filters.project) &&
    (!needle ||
      card.number.toLowerCase().includes(needle) ||
      card.villaName.toLowerCase().includes(needle) ||
      (card.clientName ?? "").toLowerCase().includes(needle));

  const started = data.cards.filter(
    (card) => card.place.index >= 0 && matches(card) && (who === "all" || card.mine),
  );
  const counts = {
    all: started.length,
    overdue: 0,
    revising: 0,
    pass_on: 0,
    nobody: 0,
    stale: 0,
    on_track: 0,
    complete: 0,
  } satisfies Record<VillaHealth | "all", number>;
  for (const card of started) if (card.health) counts[card.health] += 1;

  const projects = [
    ...new Map(data.villas.map((villa) => [villa.projectId, villa.projectName])).entries(),
  ]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    ...basicsOf(data),
    cards: started.filter((card) => !filters.health || card.health === filters.health),
    notStarted: data.cards.filter((card) => card.place.index === -1 && matches(card)),
    who,
    projects,
    counts,
  };
}

// ---------------------------------------------------------------------
// A villa
// ---------------------------------------------------------------------

export type StepView = {
  stageId: string;
  stageName: string;
  /** Null until the stage has a step on this villa. */
  stepId: string | null;
  status: StepStatus;
  note: string | null;
  reason: string | null;
  startedOn: string | null;
  doneOn: string | null;
  people: Person[];
  revisions: number;
};

export type VillaBoard = BoardBasics & {
  card: VillaCard;
  steps: StepView[];
  actions: DesignAction[];
  history: HistoryLine[];
};

/** `null` when the villa does not exist — the caller's notFound(). */
export async function getVillaBoard(unitId: string): Promise<VillaBoard | null> {
  await requireTool(GRANT);
  const data = await readBoard();
  const card = data.cards.find((villa) => villa.unitId === unitId);
  if (!card) return null;

  const supabase = await createClient();
  const events = await fetchAll<{
    seq: number;
    at: string;
    kind: string;
    from_status: string | null;
    to_status: string | null;
    design_stage_id: string;
    person_id: string | null;
    actor_id: string | null;
    reason: string | null;
  }>((from, to) =>
    supabase
      .from("design_step_events")
      .select("seq, at, kind, from_status, to_status, design_stage_id, person_id, actor_id, reason")
      .eq("unit_id", unitId)
      .order("seq")
      .range(from, to),
  );
  const eventNames = await namesFor(
    supabase,
    events.flatMap((event) => [event.person_id, event.actor_id]),
  );

  const own = data.steps.filter((step) => step.unit_id === unitId);
  const steps: StepView[] = data.stages.map((stage) => {
    const step = own.find((row) => row.design_stage_id === stage.id) ?? null;
    return {
      stageId: stage.id,
      stageName: stage.name,
      stepId: step?.id ?? null,
      status: stepStatus(step?.status ?? "not_started").value,
      note: step?.note ?? null,
      reason: step?.reason ?? null,
      startedOn: step?.started_on ?? null,
      doneOn: step?.done_on ?? null,
      people: step ? (data.peopleByStep.get(step.id) ?? []) : [],
      revisions: step ? (data.revisions.get(step.id) ?? 0) : 0,
    };
  });

  return {
    ...basicsOf(data),
    card,
    steps,
    actions: data.actions.filter((action) => action.unitId === unitId),
    history: historyLines(
      events.map((event) => ({
        seq: event.seq,
        at: event.at,
        kind: event.kind,
        fromStatus: event.from_status,
        toStatus: event.to_status,
        stageName: data.stageNames.get(event.design_stage_id) ?? "a stage",
        personName: event.person_id ? (eventNames.get(event.person_id) ?? "—") : null,
        actorId: event.actor_id,
        actorName: event.actor_id ? (eventNames.get(event.actor_id) ?? "—") : null,
        reason: event.reason,
      })),
    ),
  };
}

// ---------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------

export type ActionsFilters = { project?: string; who?: string; showDone?: boolean };

export type DesignActionsBoard = BoardBasics & {
  actions: DesignAction[];
  /** A person's id, "all", or "mgmt". */
  who: string;
  hour: number;
  loads: { person: Person; load: Load }[];
  management: number;
  myLoad: Load;
  /** Finished by their owners, waiting for this person to confirm. */
  myToConfirm: number;
  doneCount: number;
  projects: { id: string; name: string }[];
};

export async function getDesignActions(filters: ActionsFilters): Promise<DesignActionsBoard> {
  await requireTool(GRANT);
  const data = await readBoard();
  const { me, today } = data;

  const defaultWho = me.isManager ? "all" : me.id;
  const who = filters.who || defaultWho;

  const inProject = (action: DesignAction) =>
    !filters.project || action.villa?.projectId === filters.project;
  const scoped = data.actions.filter(inProject);
  const forWho = (action: DesignAction) => {
    if (who === "all") return true;
    if (who === "mgmt") return action.status === "waiting_management";
    // A person's own list: theirs, and what they set that waits for their tick.
    return (
      action.ownerId === who ||
      (action.createdBy === who && action.status === "awaiting_confirmation")
    );
  };
  const listed = scoped.filter(forWho);

  const loads = data.team.map((person) => ({
    person,
    load: loadOf(
      scoped.filter((action) => action.ownerId === person.id),
      today,
    ),
  }));

  const projects = [
    ...new Map(
      data.actions
        .filter((action) => action.villa)
        .map((action) => [action.villa!.projectId, action.villa!.projectName]),
    ).entries(),
  ]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    ...basicsOf(data),
    actions: listed.filter((action) => filters.showDone || action.status !== "done"),
    who,
    hour: hourInIndia(),
    loads,
    management: scoped.filter((action) => action.status === "waiting_management").length,
    myLoad: loadOf(
      scoped.filter((action) => action.ownerId === me.id),
      today,
    ),
    myToConfirm: scoped.filter(
      (action) =>
        action.status === "awaiting_confirmation" &&
        (action.createdBy ?? action.ownerId) === me.id &&
        action.ownerId !== me.id,
    ).length,
    doneCount: listed.filter((action) => action.status === "done").length,
    projects,
  };
}

// ---------------------------------------------------------------------
// The welcome
// ---------------------------------------------------------------------

export async function getBoardWelcomeCounts(): Promise<{
  inDesign: number;
  revising: number;
  withClient: number;
  overdueActions: number;
}> {
  await requireTool(GRANT);
  const data = await readBoard();
  const started = data.cards.filter((card) => card.place.index >= 0);
  return {
    inDesign: started.filter((card) => !card.place.complete).length,
    revising: started.filter(
      (card) => card.revising.length > 0 || card.currentStatus === "revising",
    ).length,
    withClient: started.filter((card) =>
      card.rail.some((segment) => segment.status === "with_client"),
    ).length,
    overdueActions: data.actions.filter((action) => actionBucket(action, data.today) === "overdue")
      .length,
  };
}
