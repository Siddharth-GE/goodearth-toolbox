import "server-only";

import { requireTool } from "@/lib/auth/access";
import { todayInIndia } from "@/lib/format";
import { listWorkCategories, listWorkGroups, listWorkItems } from "@/lib/masters/works";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { readFailed } from "@/lib/supabase/read-failed";
import { createClient } from "@/lib/supabase/server";
import type { VillaChecklistRow } from "./checklist-queries";
import {
  buildProgramme,
  dayInIndia,
  dayOfStage,
  isStageStatus,
  isWaitingOn,
  nowAndNext,
  placeVillaOrder,
  stageProgress,
  villaHealth,
  type GroupInfo,
  type Health,
  type ProgrammeStage,
  type StageRecord,
  type StageStatus,
  type WaitingOn,
  type WorkProgress,
} from "./programme";
import {
  forecastVilla,
  isSequenceLink,
  learnedDays,
  SIZE_WORK_CODE,
  stageDays,
  stageLength,
  type ScheduleStage,
  type SequenceLink,
  type SequenceRule,
  type StageForecast,
  type VillaFollows,
  type VillaSchedule,
  villaRules,
} from "./schedule";
import type { VillaDelivery } from "./site-receipt-queries";

/** A villa's programme (0137) and its schedule: Supervisors' own stage tables, read with the open works lists, the villa's labour
 * and the money-free estimate_work_facts. Checklists and deliveries come in from the page, which reads them for their own sections. */

const GRANT = "/supervisors";

const fail = (context: string, error: { message: string }): never =>
  readFailed("supervisors", context, error);

type Client = Awaited<ReturnType<typeof createClient>>;

export type StageChecklist = {
  templateId: string;
  templateName: string;
  /** The villa's newest checklist of this kind for this stage, or null when none was started. */
  checklist: VillaChecklistRow | null;
};

export type StagePlan = {
  /** This villa's own days and pinned start, as set on the stage sheet. */
  ownDays: number | null;
  pinnedStart: string | null;
  baselineStart: string | null;
  baselineFinish: string | null;
};

export type StageView = ProgrammeStage & {
  day: number | null;
  contractorName: string | null;
  works: { id: string; label: string }[];
  progress: WorkProgress[];
  checklists: StageChecklist[];
  plan: StagePlan;
  forecast: StageForecast;
  /** What it follows on this villa: its own choice, or the sequence's. */
  follows: {
    own: VillaFollows | null;
    sequenceLabel: string | null;
    sequenceLink: SequenceLink;
    /** A stage the sequence does not name follows the stage before it in the list. */
    inSequence: boolean;
  };
};

export type StageEvent = {
  id: string;
  at: string;
  stageLabel: string | null;
  kind: "status" | "baseline";
  fromStatus: StageStatus | null;
  toStatus: StageStatus | null;
  waitingOn: WaitingOn | null;
  note: string | null;
  actorName: string | null;
};

export type Person = { id: string; name: string };

export type VillaScheduleView = Omit<VillaSchedule, "stages"> & {
  startOn: string | null;
  baselinedAt: string | null;
  /** The villa's size from its official estimate, when it has one. */
  villaSqft: number | null;
};

export type VillaProgramme = {
  supervisor: Person | null;
  stages: StageView[];
  now: StageView[];
  next: StageView[];
  health: Health;
  schedule: VillaScheduleView;
  history: StageEvent[];
  people: Person[];
  today: string;
  /** Stages marked not needed on this villa, in sequence order. */
  leftOff: { id: string; code: string; name: string }[];
};

const HISTORY_SHOWN = 40;

export type StageRow = {
  id: string;
  work_group_id: string;
  status: string;
  status_changed_at: string;
  waiting_on: string | null;
  waiting_note: string | null;
  started_on: string | null;
  finished_on: string | null;
  contractor_id: string | null;
  days: number | null;
  pinned_start: string | null;
  baseline_start: string | null;
  baseline_finish: string | null;
  not_needed: boolean;
  follows_group_id: string | null;
  link: string | null;
};

export type SiteVillaRow = {
  supervisor_id: string | null;
  start_on: string | null;
  baselined_at: string | null;
} | null;

export type EstimateRow = {
  work_item_id: string | null;
  quantity: number | null;
  uom: string | null;
};

/** What every villa's programme is worked out from: the works lists, the sequence, and what finished villas teach. */
export async function readShared(supabase: Client) {
  const today = todayInIndia();
  const [categories, groups, works] = await Promise.all([
    listWorkCategories(),
    listWorkGroups(),
    listWorkItems(),
  ]);
  const sizeWorkId = works.find((work) => work.code === SIZE_WORK_CODE)?.id ?? null;

  const [sequence, settings, finished, units, sizes] = await Promise.all([
    fetchAll((from, to) =>
      supabase
        .from("site_sequence")
        .select("work_group_id, position, follows_group_id, link, wait_days, typical_days")
        .order("position")
        .order("id")
        .range(from, to),
    ),
    supabase.from("site_schedule_settings").select("typical_sqft").maybeSingle(),
    // Every villa's finished stages: what the schedule learns its days from.
    fetchAll((from, to) =>
      supabase
        .from("site_stages")
        .select("plot_id, work_group_id, started_on, finished_on, status_changed_at")
        .eq("status", "done")
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase.from("units").select("id, plot_id").order("id").range(from, to),
    ),
    sizeWorkId
      ? fetchAll((from, to) =>
          supabase
            .from("estimate_work_facts")
            .select("estimate_id, unit_id, quantity")
            .eq("work_item_id", sizeWorkId)
            .order("estimate_id")
            .order("unit_id")
            .order("quantity")
            .range(from, to),
        )
      : Promise.resolve([]),
  ]);
  if (settings.error) fail("the schedule settings", settings.error);

  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const groupInfos: GroupInfo[] = groups.flatMap((group) => {
    const category = categoryById.get(group.category_id);
    if (!category) return [];
    return [
      {
        id: group.id,
        code: group.code,
        name: group.name,
        categoryName: category.name,
        order: category.sort_order * 10_000 + group.sort_order,
      },
    ];
  });

  // A villa's size: its official estimate's block-work quantity, the largest when a unit has more than one official copy.
  const sizeByUnit = new Map<string, number>();
  const perEstimate = new Map<string, { unitId: string; sqft: number }>();
  for (const row of sizes) {
    if (!row.estimate_id || !row.unit_id || row.quantity === null) continue;
    const entry = perEstimate.get(row.estimate_id) ?? { unitId: row.unit_id, sqft: 0 };
    entry.sqft += row.quantity;
    perEstimate.set(row.estimate_id, entry);
  }
  for (const { unitId: unit, sqft } of perEstimate.values()) {
    if (sqft > 0) sizeByUnit.set(unit, Math.max(sizeByUnit.get(unit) ?? 0, sqft));
  }
  const unitOfPlot = new Map(units.map((unit) => [unit.plot_id, unit.id]));

  const samplesByGroup = new Map<string, { days: number; sqft: number | null }[]>();
  for (const row of finished) {
    if (!row.started_on || !row.finished_on) continue;
    // A catch-up Done tap with nothing logged dates the stage to that one day: not a length to learn from.
    if (row.started_on === row.finished_on && row.finished_on === dayInIndia(row.status_changed_at))
      continue;
    const unit = unitOfPlot.get(row.plot_id);
    const samples = samplesByGroup.get(row.work_group_id) ?? [];
    samples.push({
      days: stageLength(row.started_on, row.finished_on),
      sqft: unit ? (sizeByUnit.get(unit) ?? null) : null,
    });
    samplesByGroup.set(row.work_group_id, samples);
  }

  const sequenceRules: SequenceRule[] = sequence.map((entry) => ({
    groupId: entry.work_group_id,
    followsGroupId: entry.follows_group_id,
    link: isSequenceLink(entry.link) ? entry.link : "after",
    waitDays: entry.wait_days,
    typicalDays: entry.typical_days,
  }));

  return {
    today,
    works,
    groupInfos,
    groupOfWork: new Map(works.map((work) => [work.id, work.group_id])),
    sequencePositions: sequence.map((entry) => ({
      groupId: entry.work_group_id,
      position: entry.position,
    })),
    sequenceRules,
    typicalByGroup: new Map(sequenceRules.map((rule) => [rule.groupId, rule.typicalDays])),
    typicalSqft: settings.data?.typical_sqft ?? null,
    samplesByGroup,
    sizeByUnit,
  };
}

export type Shared = Awaited<ReturnType<typeof readShared>>;

/** One villa's stages in order, with their forecast, from what readShared holds and the villa's own rows. */
export function planVilla(
  shared: Shared,
  input: {
    unitId: string | null;
    records: StageRow[];
    site: SiteVillaRow;
    estimate: EstimateRow[];
  },
) {
  const { today, groupOfWork } = shared;
  const { unitId } = input;
  const estimateRows = input.estimate.flatMap((row) =>
    row.work_item_id && row.quantity !== null
      ? [{ workItemId: row.work_item_id, quantity: row.quantity, uom: row.uom }]
      : [],
  );
  const estimateGroupIds = unitId
    ? new Set(
        input.estimate.flatMap((row) => {
          const group = row.work_item_id ? groupOfWork.get(row.work_item_id) : null;
          return group ? [group] : [];
        }),
      )
    : null;

  const stageRecords: StageRecord[] = input.records.map((record) => ({
    id: record.id,
    groupId: record.work_group_id,
    status: isStageStatus(record.status) ? record.status : "not_started",
    statusChangedAt: record.status_changed_at,
    waitingOn: record.waiting_on && isWaitingOn(record.waiting_on) ? record.waiting_on : null,
    waitingNote: record.waiting_note,
    startedOn: record.started_on,
    finishedOn: record.finished_on,
    contractorId: record.contractor_id,
  }));
  const planByGroup = new Map<string, StagePlan>(
    input.records.map((record) => [
      record.work_group_id,
      {
        ownDays: record.days,
        pinnedStart: record.pinned_start,
        baselineStart: record.baseline_start,
        baselineFinish: record.baseline_finish,
      },
    ]),
  );

  const notNeeded = new Set(
    input.records.filter((record) => record.not_needed).map((record) => record.work_group_id),
  );
  const villaFollows = new Map<string, VillaFollows>(
    input.records.flatMap((record) =>
      record.follows_group_id && record.link && isSequenceLink(record.link)
        ? [[record.work_group_id, { followsGroupId: record.follows_group_id, link: record.link }]]
        : [],
    ),
  );
  const rules = villaRules(shared.sequenceRules, villaFollows);
  const programme = placeVillaOrder(
    buildProgramme({
      groups: shared.groupInfos,
      sequence: shared.sequencePositions,
      // A villa whose official estimate names no grouped work is planned like one with none.
      estimateGroupIds: estimateGroupIds && estimateGroupIds.size > 0 ? estimateGroupIds : null,
      records: stageRecords,
      notNeeded,
    }),
    new Map([...villaFollows].map(([groupId, own]) => [groupId, own.followsGroupId])),
  );
  const groupById = new Map(shared.groupInfos.map((group) => [group.id, group]));
  const positionOf = new Map(
    shared.sequencePositions.map((entry) => [entry.groupId, entry.position]),
  );
  const leftOff = [...notNeeded]
    .flatMap((id) => {
      const group = groupById.get(id);
      return group ? [group] : [];
    })
    .sort(
      (a, b) =>
        (positionOf.get(a.id) ?? Infinity) - (positionOf.get(b.id) ?? Infinity) ||
        a.order - b.order,
    );

  const villaSqft = unitId ? (shared.sizeByUnit.get(unitId) ?? null) : null;
  const daysByGroup = new Map(
    programme.map((stage) => [
      stage.id,
      stageDays({
        own: planByGroup.get(stage.id)?.ownDays ?? null,
        learned: learnedDays(shared.samplesByGroup.get(stage.id) ?? [], villaSqft),
        typicalDays: shared.typicalByGroup.get(stage.id) ?? null,
        villaSqft,
        typicalSqft: shared.typicalSqft,
      }),
    ]),
  );

  const startOn = input.site?.start_on ?? null;
  const baselinedAt = input.site?.baselined_at ?? null;
  const scheduleStages: ScheduleStage[] = programme.map((stage) => {
    const plan = planByGroup.get(stage.id);
    return {
      groupId: stage.id,
      status: stage.status,
      startedOn: stage.record?.startedOn ?? null,
      finishedOn: stage.record?.finishedOn ?? null,
      days: plan?.ownDays ?? null,
      pinnedStart: plan?.pinnedStart ?? null,
      baselineStart: plan?.baselineStart ?? null,
      baselineFinish: plan?.baselineFinish ?? null,
    };
  });
  const schedule = forecastVilla({
    stages: scheduleStages,
    sequence: rules,
    startOn,
    today,
    daysByGroup,
    baselined: baselinedAt !== null,
  });

  return {
    today,
    works: shared.works,
    groupInfos: shared.groupInfos,
    groupOfWork,
    estimateRows,
    programme,
    planByGroup,
    schedule,
    sharedRules: shared.sequenceRules,
    villaFollows,
    leftOff,
    supervisorId: input.site?.supervisor_id ?? null,
    startOn,
    baselinedAt,
    villaSqft,
  };
}

/** What both the page and "Set the first plan" need: the villa's stages in order, with their forecast. */
async function readProgramme(supabase: Client, plotId: string, unitId: string | null) {
  const [shared, records, site, estimate] = await Promise.all([
    readShared(supabase),
    fetchAll((from, to) =>
      supabase
        .from("site_stages")
        .select(
          "id, work_group_id, status, status_changed_at, waiting_on, waiting_note, started_on, finished_on, contractor_id, days, pinned_start, baseline_start, baseline_finish, not_needed, follows_group_id, link",
        )
        .eq("plot_id", plotId)
        .order("id")
        .range(from, to),
    ),
    supabase
      .from("site_villas")
      .select("supervisor_id, start_on, baselined_at")
      .eq("plot_id", plotId)
      .maybeSingle(),
    unitId
      ? fetchAll((from, to) =>
          supabase
            .from("estimate_work_facts")
            .select("work_item_id, quantity, uom")
            .eq("unit_id", unitId)
            .order("estimate_id")
            .order("work_item_id")
            .order("quantity")
            .range(from, to),
        )
      : Promise.resolve([]),
  ]);
  if (site.error) fail("the villa's schedule", site.error);
  return planVilla(shared, { unitId, records, site: site.data, estimate });
}

const NO_PLAN: StagePlan = {
  ownDays: null,
  pinnedStart: null,
  baselineStart: null,
  baselineFinish: null,
};

export async function getVillaProgramme(input: {
  plotId: string;
  unitId: string | null;
  checklists: VillaChecklistRow[];
  templates: { id: string; name: string }[];
  templateGroups: Map<string, string[]>;
  deliveries: VillaDelivery[];
  contractors: { id: string; name: string }[];
}): Promise<VillaProgramme> {
  await requireTool(GRANT);
  const supabase = await createClient();
  const { plotId, unitId } = input;

  const [base, logs, events, profiles] = await Promise.all([
    readProgramme(supabase, plotId, unitId),
    fetchAll((from, to) =>
      supabase
        .from("labour_logs")
        .select("work_item_id, log_date, kind, quantity, uom, work_class")
        .eq("plot_id", plotId)
        .order("id")
        .range(from, to),
    ),
    supabase
      .from("site_stage_events")
      .select("id, at, work_group_id, kind, from_status, to_status, waiting_on, note, actor_id")
      .eq("plot_id", plotId)
      // A stage row made only to hold a plan or days is not a change of status worth listing.
      .or("from_status.not.is.null,to_status.is.null,to_status.neq.not_started")
      .order("seq", { ascending: false })
      .range(0, HISTORY_SHOWN - 1),
    fetchAll((from, to) =>
      supabase
        .from("profiles")
        .select("id, full_name, is_active")
        .order("full_name")
        .order("id")
        .range(from, to),
    ),
  ]);
  if (events.error) fail("the stage history", events.error);

  const { today, works, groupOfWork, estimateRows, programme, schedule } = base;
  const groupById = new Map(base.groupInfos.map((group) => [group.id, group]));

  const lastLabourByGroup = new Map<string, string>();
  for (const log of logs) {
    const group = log.work_item_id ? groupOfWork.get(log.work_item_id) : undefined;
    if (!group) continue;
    const last = lastLabourByGroup.get(group);
    if (!last || log.log_date > last) lastLabourByGroup.set(group, log.log_date);
  }
  const pieceWork = logs
    // Standard work only: rework repeats what the estimate already counts, and additional work is beyond it.
    .flatMap((log) =>
      log.kind === "pw_qty" && log.work_class === "standard" && log.work_item_id
        ? [{ workItemId: log.work_item_id, quantity: log.quantity, uom: log.uom }]
        : [],
    );

  const contractorNames = new Map(
    input.contractors.map((contractor) => [contractor.id, contractor.name]),
  );
  const templateNames = new Map(input.templates.map((template) => [template.id, template.name]));
  const templatesByGroup = new Map<string, string[]>();
  for (const [templateId, groupIds] of input.templateGroups) {
    for (const groupId of groupIds) {
      templatesByGroup.set(groupId, [...(templatesByGroup.get(groupId) ?? []), templateId]);
    }
  }

  const stageLabel = (groupId: string | null) => {
    const group = groupId ? groupById.get(groupId) : null;
    return group ? `${group.code} ${group.name}` : null;
  };
  const sequenceRule = new Map(base.sharedRules.map((rule) => [rule.groupId, rule]));

  const stages: StageView[] = programme.map((stage, index) => {
    const stageWorks = works
      .filter((work) => work.group_id === stage.id && work.is_active)
      .map((work) => ({ id: work.id, label: `${work.code} · ${work.name}` }));
    const checklists = (templatesByGroup.get(stage.id) ?? []).flatMap((templateId) => {
      const name = templateNames.get(templateId);
      if (!name) return [];
      // Newest first already; an older one started before stages existed counts for every stage it inspects.
      const mine = input.checklists.filter(
        (checklist) =>
          checklist.templateId === templateId &&
          (checklist.workGroupId === stage.id || checklist.workGroupId === null),
      );
      const checklist = mine.find((row) => row.status === "open") ?? mine[0] ?? null;
      return [{ templateId, templateName: name, checklist }];
    });
    return {
      ...stage,
      day:
        stage.status === "done"
          ? null
          : dayOfStage({ startedOn: stage.record?.startedOn ?? null }, today),
      contractorName: stage.record?.contractorId
        ? (contractorNames.get(stage.record.contractorId) ?? null)
        : null,
      works: stageWorks,
      progress: stageProgress(stageWorks, estimateRows, pieceWork),
      checklists,
      plan: base.planByGroup.get(stage.id) ?? NO_PLAN,
      forecast: schedule.stages[index],
      follows: {
        own: base.villaFollows.get(stage.id) ?? null,
        sequenceLabel: stageLabel(sequenceRule.get(stage.id)?.followsGroupId ?? null),
        sequenceLink: sequenceRule.get(stage.id)?.link ?? "after",
        inSequence: sequenceRule.has(stage.id),
      },
    };
  });

  const { now, next } = nowAndNext(stages);
  const failedOpenChecklists = input.checklists.filter(
    (checklist) => checklist.status === "open" && checklist.failed > 0,
  ).length;
  const unconfirmed = input.deliveries
    .filter((delivery) => !delivery.confirmedAt && delivery.lines.length > 0)
    .map((delivery) => dayInIndia(delivery.on))
    .sort();
  const late = stages
    .filter((stage) => stage.forecast.overdueDays)
    .sort((a, b) => b.forecast.overdueDays! - a.forecast.overdueDays!)[0];

  const names = new Map(profiles.map((person) => [person.id, person.full_name ?? "—"]));
  const { supervisorId } = base;

  return {
    supervisor: supervisorId ? { id: supervisorId, name: names.get(supervisorId) ?? "—" } : null,
    stages,
    now,
    next,
    health: villaHealth({
      stages,
      lastLabourByGroup,
      failedOpenChecklists,
      late: late ? { stage: late, days: late.forecast.overdueDays! } : null,
      oldestUnconfirmedDelivery: unconfirmed[0] ?? null,
      today,
    }),
    schedule: {
      handover: schedule.handover,
      missingDays: schedule.missingDays,
      baselineHandover: schedule.baselineHandover,
      slip: schedule.slip,
      startOn: base.startOn,
      baselinedAt: base.baselinedAt,
      villaSqft: base.villaSqft,
    },
    history: (events.data ?? []).map((event) => ({
      id: event.id,
      at: event.at,
      stageLabel: stageLabel(event.work_group_id),
      kind: event.kind === "baseline" ? "baseline" : "status",
      fromStatus: event.from_status && isStageStatus(event.from_status) ? event.from_status : null,
      toStatus: event.to_status && isStageStatus(event.to_status) ? event.to_status : null,
      waitingOn: event.waiting_on && isWaitingOn(event.waiting_on) ? event.waiting_on : null,
      note: event.note,
      actorName: event.actor_id ? (names.get(event.actor_id) ?? null) : null,
    })),
    people: profiles
      .filter((person) => person.is_active)
      .map((person) => ({ id: person.id, name: person.full_name ?? "—" })),
    today,
    leftOff: base.leftOff.map(({ id, code, name }) => ({ id, code, name })),
  };
}

/** Today's forecast for one villa, worked out on the server for "Set the first plan" — never taken from the phone. */
export async function getVillaForecast(plotId: string): Promise<{
  startOn: string | null;
  baselinedAt: string | null;
  schedule: VillaSchedule;
}> {
  await requireTool(GRANT);
  const supabase = await createClient();
  const { data: unit, error } = await supabase
    .from("units")
    .select("id")
    .eq("plot_id", plotId)
    .maybeSingle();
  if (error) fail("the villa", error);
  const base = await readProgramme(supabase, plotId, unit?.id ?? null);
  return { startOn: base.startOn, baselinedAt: base.baselinedAt, schedule: base.schedule };
}

/** The sequence as this villa runs it, for refusing an order that would wait on itself. */
export async function getVillaRules(plotId: string): Promise<SequenceRule[]> {
  await requireTool(GRANT);
  const supabase = await createClient();
  const { data: unit, error } = await supabase
    .from("units")
    .select("id")
    .eq("plot_id", plotId)
    .maybeSingle();
  if (error) fail("the villa", error);
  const base = await readProgramme(supabase, plotId, unit?.id ?? null);
  return villaRules(base.sharedRules, base.villaFollows);
}

/** What the stores hold of each item, summed across stores (stock_by_location, open to every signed-in person). */
export async function storeStock(itemIds: string[]): Promise<Map<string, number>> {
  await requireTool(GRANT);
  const held = new Map<string, number>();
  if (itemIds.length === 0) return held;
  const supabase = await createClient();
  const rows = await fetchAll((from, to) =>
    supabase
      .from("stock_by_location")
      .select("item_id, quantity")
      .eq("location_kind", "store")
      .in("item_id", itemIds)
      .order("item_id")
      .range(from, to),
  );
  for (const row of rows) {
    if (!row.item_id || row.quantity === null) continue;
    held.set(row.item_id, (held.get(row.item_id) ?? 0) + row.quantity);
  }
  return held;
}
