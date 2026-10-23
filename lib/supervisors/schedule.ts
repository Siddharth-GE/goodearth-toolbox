import { daysBetween, type StageStatus } from "./programme";

// Pure. A villa's schedule (plan.md phase B): every date worked out on read from the site sequence, the villa's start, and each
// stage's days — never stored, except the first plan, which is a copy of one day's forecast. Calendar days: every day counts.

export const SEQUENCE_LINKS = ["after", "alongside"] as const;
export type SequenceLink = (typeof SEQUENCE_LINKS)[number];

export const SEQUENCE_LINK_LABEL: Record<SequenceLink, string> = {
  after: "After it finishes",
  alongside: "Alongside it",
};

export function isSequenceLink(value: string): value is SequenceLink {
  return (SEQUENCE_LINKS as readonly string[]).includes(value);
}

/** The work whose official-estimate quantity is a villa's size: block work up to the lintel, priced per sqft. */
export const SIZE_WORK_CODE = "SS.01.00";

/** Learning starts once this many villas have finished a stage. */
export const LEARN_FROM_VILLAS = 3;

export type SequenceRule = {
  groupId: string;
  /** Null: the villa's first stage, starting on its start date. */
  followsGroupId: string | null;
  link: SequenceLink;
  waitDays: number;
  typicalDays: number | null;
};

export type ScheduleStage = {
  groupId: string;
  status: StageStatus;
  startedOn: string | null;
  finishedOn: string | null;
  /** This villa's own length for the stage, when someone set it. */
  days: number | null;
  pinnedStart: string | null;
  baselineStart: string | null;
  baselineFinish: string | null;
};

export type DaysSource = "own" | "learned" | "typical";

export type StageForecast = {
  groupId: string;
  days: number | null;
  source: DaysSource | null;
  /** How many finished villas the learned days come from. */
  learnedFrom: number | null;
  start: string | null;
  /** The last day of the stage, inclusive. */
  finish: string | null;
  /** A pinned start the chain before it has overtaken: the stage starts later than pinned. */
  pinnedBehind: boolean;
  /** Days the forecast finish sits after the first plan's (negative: ahead). Null without a first plan. */
  slip: number | null;
  /** A stage being worked past its planned finish, by this many days. */
  overdueDays: number | null;
};

export type VillaSchedule = {
  stages: StageForecast[];
  /** The last finish, once every stage has one. */
  handover: string | null;
  /** Stages not done that have no days, so nothing after them has dates. */
  missingDays: number;
  baselineHandover: string | null;
  /** Handover's slip against the first plan's handover. */
  slip: number | null;
};

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

const later = (a: string, b: string) => (a > b ? a : b);

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** A finished stage's length, both ends counted. */
export function stageLength(startedOn: string, finishedOn: string): number {
  return daysBetween(startedOn, finishedOn) + 1;
}

/**
 * Days learned from villas that finished the stage: the middle days per sqft × this villa's size, when this villa and three
 * finished ones have a size; otherwise the middle days of three or more finished villas.
 */
export function learnedDays(
  samples: { days: number; sqft: number | null }[],
  villaSqft: number | null,
): { days: number; villas: number } | null {
  const sized = samples.filter((sample) => sample.sqft !== null && sample.sqft > 0);
  if (villaSqft && sized.length >= LEARN_FROM_VILLAS) {
    const perSqft = median(sized.map((sample) => sample.days / sample.sqft!));
    return { days: Math.max(1, Math.round(perSqft * villaSqft)), villas: sized.length };
  }
  if (samples.length >= LEARN_FROM_VILLAS) {
    return {
      days: Math.max(1, Math.round(median(samples.map((s) => s.days)))),
      villas: samples.length,
    };
  }
  return null;
}

/** First that applies: the villa's own days → learned → typical days, scaled to the villa's size when both sizes are known. */
export function stageDays(input: {
  own: number | null;
  learned: { days: number; villas: number } | null;
  typicalDays: number | null;
  villaSqft: number | null;
  typicalSqft: number | null;
}): { days: number | null; source: DaysSource | null; learnedFrom: number | null } {
  if (input.own) return { days: input.own, source: "own", learnedFrom: null };
  if (input.learned)
    return { days: input.learned.days, source: "learned", learnedFrom: input.learned.villas };
  if (input.typicalDays) {
    const scaled =
      input.villaSqft && input.typicalSqft
        ? Math.max(1, Math.round((input.typicalDays * input.villaSqft) / input.typicalSqft))
        : input.typicalDays;
    return { days: scaled, source: "typical", learnedFrom: null };
  }
  return { days: null, source: null, learnedFrom: null };
}

/**
 * The forecast, stage by stage. Done: its real dates. Working or waiting: from its start, finishing at start + days or today,
 * whichever is later — running long pushes everything after it. Not started: the latest of what it follows (its finish, or its
 * start when alongside) plus wait days, its pinned start, and today. A stage following one this villa does not have follows
 * what that one followed; a stage the sequence does not name follows the stage before it.
 */
export function forecastVilla(input: {
  /** The villa's stages, in programme order. */
  stages: ScheduleStage[];
  sequence: SequenceRule[];
  startOn: string | null;
  today: string;
  /** Each stage's days, already chosen (stageDays). */
  daysByGroup: Map<string, ReturnType<typeof stageDays>>;
  /** Whether the villa has a first plan; slips are read only then. */
  baselined: boolean;
}): VillaSchedule {
  const { stages, startOn, today } = input;
  const ruleByGroup = new Map(input.sequence.map((rule) => [rule.groupId, rule]));
  const stageByGroup = new Map(stages.map((stage) => [stage.groupId, stage]));
  const memo = new Map<string, { start: string | null; finish: string | null }>();
  const visiting = new Set<string>();

  // Where a stage the villa does not have would have started: zero length, no wait of its own.
  const anchor = (groupId: string): string | null => {
    const rule = ruleByGroup.get(groupId);
    if (!rule) return null;
    return follow(rule.followsGroupId, rule.link);
  };

  // The earliest a stage can start, from the one it follows.
  const follow = (followsGroupId: string | null, link: SequenceLink): string | null => {
    if (!followsGroupId) return startOn;
    if (stageByGroup.has(followsGroupId)) {
      const before = dates(followsGroupId);
      if (link === "alongside") return before.start;
      return before.finish ? addDays(before.finish, 1) : null;
    }
    if (visiting.has(followsGroupId)) return null;
    visiting.add(followsGroupId);
    const at = anchor(followsGroupId);
    visiting.delete(followsGroupId);
    return at;
  };

  const chainStart = (stage: ScheduleStage): string | null => {
    const rule = ruleByGroup.get(stage.groupId);
    if (rule) {
      const from = follow(rule.followsGroupId, rule.link);
      return from ? addDays(from, rule.waitDays) : null;
    }
    const index = stages.findIndex((entry) => entry.groupId === stage.groupId);
    return follow(index > 0 ? stages[index - 1].groupId : null, "after");
  };

  const dates = (groupId: string): { start: string | null; finish: string | null } => {
    const known = memo.get(groupId);
    if (known) return known;
    if (visiting.has(groupId)) return { start: null, finish: null };
    visiting.add(groupId);
    const stage = stageByGroup.get(groupId)!;
    const days = input.daysByGroup.get(groupId)?.days ?? null;
    let result: { start: string | null; finish: string | null };
    if (stage.status === "done") {
      result = { start: stage.startedOn, finish: stage.finishedOn };
    } else if (stage.startedOn) {
      result = {
        start: stage.startedOn,
        finish: days ? later(addDays(stage.startedOn, days - 1), today) : null,
      };
    } else {
      const chain = chainStart(stage);
      const floor = stage.pinnedStart ? later(stage.pinnedStart, today) : today;
      const start = chain ? later(chain, floor) : stage.pinnedStart ? floor : null;
      result = { start, finish: start && days ? addDays(start, days - 1) : null };
    }
    visiting.delete(groupId);
    memo.set(groupId, result);
    return result;
  };

  const forecasts: StageForecast[] = stages.map((stage) => {
    const { start, finish } = dates(stage.groupId);
    const chosen = input.daysByGroup.get(stage.groupId) ?? {
      days: null,
      source: null,
      learnedFrom: null,
    };
    const notStarted = stage.status !== "done" && !stage.startedOn;
    const chain = notStarted && stage.pinnedStart ? chainStart(stage) : null;
    const working = stage.status !== "done" && stage.startedOn !== null;
    const planned =
      working && chosen.days
        ? input.baselined && stage.baselineFinish
          ? stage.baselineFinish
          : addDays(stage.startedOn!, chosen.days - 1)
        : null;
    const overdue = planned ? daysBetween(planned, today) : 0;
    return {
      groupId: stage.groupId,
      ...chosen,
      start,
      finish,
      pinnedBehind: Boolean(chain && stage.pinnedStart && chain > stage.pinnedStart),
      slip:
        input.baselined && stage.baselineFinish && finish
          ? daysBetween(stage.baselineFinish, finish)
          : null,
      overdueDays: overdue > 0 ? overdue : null,
    };
  });

  const finishes = forecasts.map((stage) => stage.finish);
  const handover =
    finishes.length > 0 && finishes.every(Boolean) ? (finishes as string[]).reduce(later) : null;
  const baselineFinishes = stages.map((stage) => stage.baselineFinish);
  const baselineHandover =
    input.baselined && baselineFinishes.length > 0 && baselineFinishes.every(Boolean)
      ? (baselineFinishes as string[]).reduce(later)
      : null;

  return {
    stages: forecasts,
    handover,
    missingDays: forecasts.filter(
      (forecast, index) => stages[index].status !== "done" && forecast.days === null,
    ).length,
    baselineHandover,
    slip: handover && baselineHandover ? daysBetween(baselineHandover, handover) : null,
  };
}

/** "12 days behind the first plan", "3 days ahead", "on the first plan". */
export function describeSlip(days: number): string {
  if (days === 0) return "on the first plan";
  const count = Math.abs(days);
  return `${count} ${count === 1 ? "day" : "days"} ${days > 0 ? "behind" : "ahead of"} the first plan`;
}

/** Why the first plan cannot be set yet, or null when it can. */
export function firstPlanBlocker(
  schedule: Pick<VillaSchedule, "missingDays" | "handover">,
  startOn: string | null,
): string | null {
  if (!startOn) return "Set the villa's start date first.";
  if (schedule.missingDays > 0)
    return `${schedule.missingDays} ${schedule.missingDays === 1 ? "stage has" : "stages have"} no days yet — set typical days under Sequence, or the stage's own.`;
  if (!schedule.handover) return "Some stages have no dates yet.";
  return null;
}
