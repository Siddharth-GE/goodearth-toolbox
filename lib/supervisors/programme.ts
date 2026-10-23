import { formatDate } from "@/lib/format";

// Pure. A villa's programme (0137): its stages in site order, what is happening now and next, and
// its health. Derived on every read — a villa's position is never stored (the Design Management rule).

export const STAGE_STATUSES = ["not_started", "working", "waiting", "done"] as const;
export type StageStatus = (typeof STAGE_STATUSES)[number];

export const WAITING_ON = ["material", "labour", "inspection", "client", "other"] as const;
export type WaitingOn = (typeof WAITING_ON)[number];

export const STAGE_STATUS_LABEL: Record<StageStatus, string> = {
  not_started: "Not started",
  working: "Working",
  waiting: "Waiting",
  done: "Done",
};

export const WAITING_ON_LABEL: Record<WaitingOn, string> = {
  material: "Material",
  labour: "Labour",
  inspection: "Inspection",
  client: "Client",
  other: "Something else",
};

export function isStageStatus(value: string): value is StageStatus {
  return (STAGE_STATUSES as readonly string[]).includes(value);
}

export function isWaitingOn(value: string): value is WaitingOn {
  return (WAITING_ON as readonly string[]).includes(value);
}

export type GroupInfo = {
  id: string;
  code: string;
  name: string;
  categoryName: string;
  /** Category order, then group order: where a stage the sequence does not name goes. */
  order: number;
};

export type SequenceEntry = { groupId: string; position: number };

export type StageRecord = {
  id: string;
  groupId: string;
  status: StageStatus;
  statusChangedAt: string;
  waitingOn: WaitingOn | null;
  waitingNote: string | null;
  startedOn: string | null;
  finishedOn: string | null;
  contractorId: string | null;
};

export type ProgrammeStage = GroupInfo & {
  /** Null until something has happened on the stage. */
  record: StageRecord | null;
  status: StageStatus;
};

/**
 * The villa's stages: the sequence's stages its official estimate covers (every one when it has no
 * official estimate), any other stage the estimate covers, and any stage something already happened on.
 * Sequence order first, the rest by the works list's order.
 */
export function buildProgramme(input: {
  groups: GroupInfo[];
  sequence: SequenceEntry[];
  /** Null when the villa has no official estimate. */
  estimateGroupIds: Set<string> | null;
  records: StageRecord[];
}): ProgrammeStage[] {
  const groupById = new Map(input.groups.map((group) => [group.id, group]));
  const recordByGroup = new Map(input.records.map((record) => [record.groupId, record]));
  const position = new Map(input.sequence.map((entry) => [entry.groupId, entry.position]));

  const ids = new Set<string>();
  for (const entry of input.sequence) {
    if (!input.estimateGroupIds || input.estimateGroupIds.has(entry.groupId))
      ids.add(entry.groupId);
  }
  for (const id of input.estimateGroupIds ?? []) ids.add(id);
  for (const record of input.records) ids.add(record.groupId);

  return [...ids]
    .flatMap((id) => {
      const group = groupById.get(id);
      if (!group) return [];
      const record = recordByGroup.get(id) ?? null;
      return [{ ...group, record, status: record?.status ?? "not_started" }];
    })
    .sort((a, b) => {
      const pa = position.get(a.id);
      const pb = position.get(b.id);
      if (pa !== undefined && pb !== undefined) return pa - pb;
      if (pa !== undefined) return -1;
      if (pb !== undefined) return 1;
      return a.order - b.order;
    });
}

/** Now: every stage working or waiting. Next: the first stages not started, in order. */
export function nowAndNext(
  stages: ProgrammeStage[],
  nextCount = 2,
): { now: ProgrammeStage[]; next: ProgrammeStage[] } {
  return {
    now: stages.filter((stage) => stage.status === "working" || stage.status === "waiting"),
    next: stages.filter((stage) => stage.status === "not_started").slice(0, nextCount),
  };
}

/** Calendar days from one "YYYY-MM-DD" to another. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** "Day 6" of a stage: its start day is day 1. Null before it starts. */
export function dayOfStage(stage: { startedOn: string | null }, today: string): number | null {
  if (!stage.startedOn) return null;
  return Math.max(1, daysBetween(stage.startedOn, today) + 1);
}

export const HEALTH_RULES = { waitingDays: 3, idleDays: 5, deliveryDays: 2 } as const;

export type HealthKind =
  "waiting" | "idle" | "failed_check" | "delivery" | "on_track" | "not_started" | "finished";

export type Health = { kind: HealthKind; label: string; detail: string | null };

export const HEALTH_TONE: Record<HealthKind, "danger" | "warning" | "success" | "neutral"> = {
  waiting: "danger",
  idle: "warning",
  failed_check: "danger",
  delivery: "warning",
  on_track: "success",
  not_started: "neutral",
  finished: "success",
};

/**
 * First match wins: waiting more than 3 days · no labour on a working stage for 5 days · an open
 * checklist with a failed check · a delivery unconfirmed for 2 days · on track. Past its planned
 * finish joins once the schedule exists (phase B).
 */
export function villaHealth(input: {
  stages: ProgrammeStage[];
  /** The newest labour day per stage (group id → "YYYY-MM-DD"). */
  lastLabourByGroup: Map<string, string>;
  failedOpenChecklists: number;
  /** The oldest unconfirmed delivery's date, or null. */
  oldestUnconfirmedDelivery: string | null;
  today: string;
}): Health {
  const { stages, today } = input;
  const label = (stage: ProgrammeStage) => `${stage.code} ${stage.name}`;

  const waiting = stages
    .filter((stage) => stage.status === "waiting" && stage.record)
    .map((stage) => ({
      stage,
      days: daysBetween(stage.record!.statusChangedAt.slice(0, 10), today),
    }))
    .filter((entry) => entry.days > HEALTH_RULES.waitingDays)
    .sort((a, b) => b.days - a.days)[0];
  if (waiting) {
    const on = waiting.stage.record!.waitingOn;
    return {
      kind: "waiting",
      label: `Waiting ${waiting.days} days`,
      detail: `${label(waiting.stage)}${on ? ` · on ${WAITING_ON_LABEL[on].toLowerCase()}` : ""}`,
    };
  }

  const idle = stages
    .filter((stage) => stage.status === "working" && stage.record?.startedOn)
    .map((stage) => {
      const last = input.lastLabourByGroup.get(stage.id) ?? stage.record!.startedOn!;
      return { stage, days: daysBetween(last, today) };
    })
    .filter((entry) => entry.days >= HEALTH_RULES.idleDays)
    .sort((a, b) => b.days - a.days)[0];
  if (idle) {
    return {
      kind: "idle",
      label: `No labour for ${idle.days} days`,
      detail: label(idle.stage),
    };
  }

  if (input.failedOpenChecklists > 0) {
    return {
      kind: "failed_check",
      label: "Failed check",
      detail:
        input.failedOpenChecklists === 1
          ? "An open checklist has a failed check"
          : `${input.failedOpenChecklists} open checklists have a failed check`,
    };
  }

  if (
    input.oldestUnconfirmedDelivery &&
    daysBetween(input.oldestUnconfirmedDelivery, today) >= HEALTH_RULES.deliveryDays
  ) {
    return {
      kind: "delivery",
      label: "Delivery to confirm",
      detail: `Waiting since ${formatDate(input.oldestUnconfirmedDelivery)}`,
    };
  }

  if (stages.length > 0 && stages.every((stage) => stage.status === "done")) {
    return { kind: "finished", label: "Every stage done", detail: null };
  }
  if (stages.every((stage) => stage.status === "not_started")) {
    return { kind: "not_started", label: "Not started", detail: null };
  }
  return { kind: "on_track", label: "On track", detail: null };
}

export type WorkProgress = {
  workItemId: string;
  label: string;
  logged: number;
  estimated: number | null;
  uom: string;
};

/**
 * Piece-work by quantity logged against the official estimate, work by work, in the work's unit.
 * A log in another unit than the estimate's is left out rather than added to the wrong figure.
 */
export function stageProgress(
  works: { id: string; label: string }[],
  estimate: { workItemId: string; quantity: number; uom: string | null }[],
  logs: { workItemId: string; quantity: number | null; uom: string | null }[],
): WorkProgress[] {
  const same = (a: string | null, b: string | null) =>
    (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
  return works.flatMap((work) => {
    const planned = estimate.filter((row) => row.workItemId === work.id);
    const done = logs.filter((log) => log.workItemId === work.id && log.quantity !== null);
    if (planned.length === 0 && done.length === 0) return [];
    const uom = planned[0]?.uom ?? done[0]?.uom ?? "";
    const estimated = planned.length
      ? planned.filter((row) => same(row.uom, uom)).reduce((sum, row) => sum + row.quantity, 0)
      : null;
    const logged = done
      .filter((log) => same(log.uom, uom))
      .reduce((sum, log) => sum + (log.quantity ?? 0), 0);
    return [{ workItemId: work.id, label: work.label, logged, estimated, uom }];
  });
}
