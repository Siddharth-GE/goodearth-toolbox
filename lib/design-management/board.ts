/**
 * The design board's rules, pure (root plan.md, twelfth piece) — where a
 * villa sits, its rail, how it is doing, what Pass on offers, and the
 * history read as sentences.
 *
 * The founder, 2026-10-17: "the stage that a house is in is marked by the
 * latest stage even tho revisions may happen backwards". So a villa sits
 * at the FURTHEST board stage whose step has started; an earlier stage
 * sent back for revision shows on its card, and never moves it back.
 * Nothing here is stored — it is worked out from the steps each render,
 * so it can never disagree with them.
 *
 * Dates are ISO strings, `today` passed in; nothing here reads a clock.
 */
import { actionBucket, daysBetween, type BucketInput } from "@/lib/next-steps/rules";

export type StepStatus =
  "not_started" | "working" | "with_client" | "waiting" | "revising" | "done";

export type Tone = "plain" | "info" | "warning" | "danger" | "success";

/** In the order the status chips show them. Not started is the undo. */
export const STEP_STATUSES: readonly { value: StepStatus; label: string; tone: Tone }[] = [
  { value: "working", label: "Working", tone: "info" },
  { value: "with_client", label: "With the client", tone: "warning" },
  { value: "waiting", label: "Waiting on others", tone: "warning" },
  { value: "revising", label: "Revising", tone: "danger" },
  { value: "done", label: "Done", tone: "success" },
  { value: "not_started", label: "Not started", tone: "plain" },
];

export function stepStatus(value: string): { value: StepStatus; label: string; tone: Tone } {
  return STEP_STATUSES.find((status) => status.value === value) ?? STEP_STATUSES[5];
}

export function isStepStatus(value: string): value is StepStatus {
  return STEP_STATUSES.some((status) => status.value === value);
}

/** A column of the board: a design stage switched onto it, in the list's order. */
export type BoardStage = { id: string; name: string };

export type StepLite = { stageId: string; status: string };

export type RailSegment = { stageId: string; name: string; status: StepStatus };

/** One segment per board stage, in order; a stage with no step is not started. */
export function railOf(stages: readonly BoardStage[], steps: readonly StepLite[]): RailSegment[] {
  const byStage = new Map(steps.map((step) => [step.stageId, step.status]));
  return stages.map((stage) => ({
    stageId: stage.id,
    name: stage.name,
    status: stepStatus(byStage.get(stage.id) ?? "not_started").value,
  }));
}

export type Place = {
  /** Position of the furthest started board stage; -1 when nothing has started. */
  index: number;
  /** Every board stage done. */
  complete: boolean;
};

export function placeOf(stages: readonly BoardStage[], steps: readonly StepLite[]): Place {
  const rail = railOf(stages, steps);
  let index = -1;
  rail.forEach((segment, at) => {
    if (segment.status !== "not_started") index = at;
  });
  return {
    index,
    complete: rail.length > 0 && rail.every((segment) => segment.status === "done"),
  };
}

/**
 * The stages Pass on offers from `fromStageId`. Passing on moves a villa
 * forward from where it sits, so only the stage it sits at offers it —
 * done or not, since a finished stage waiting to be handed on is the
 * point. Every later board stage can take it (the board is not a straight
 * line), the next one first. An earlier stage under revision finishes with
 * Done, and going back is Send back, never a pass.
 */
export function passTargets(
  stages: readonly BoardStage[],
  steps: readonly StepLite[],
  fromStageId: string,
): BoardStage[] {
  const from = stages.findIndex((stage) => stage.id === fromStageId);
  if (from === -1 || from !== placeOf(stages, steps).index) return [];
  return stages.slice(from + 1);
}

// ---------------------------------------------------------------------
// How a villa is doing
// ---------------------------------------------------------------------

export type VillaHealth =
  "overdue" | "revising" | "pass_on" | "nobody" | "stale" | "on_track" | "complete";

export const VILLA_HEALTH: Record<VillaHealth, { label: string; tone: Tone }> = {
  overdue: { label: "Overdue action", tone: "danger" },
  revising: { label: "Revising", tone: "danger" },
  pass_on: { label: "Ready to pass on", tone: "warning" },
  nobody: { label: "Nobody on it", tone: "warning" },
  stale: { label: "Not updated in 2 weeks", tone: "warning" },
  on_track: { label: "On track", tone: "success" },
  complete: { label: "Design complete", tone: "success" },
};

/** The health chips on the board, in the order they filter. */
export const HEALTH_FILTERS: readonly VillaHealth[] = [
  "overdue",
  "revising",
  "pass_on",
  "nobody",
  "stale",
];

export type HealthInput = {
  place: Place;
  /** The status of the stage it sits at. */
  currentStatus: StepStatus | null;
  /** Any earlier stage sent back and not yet done again. */
  revising: boolean;
  /** People on the stage it sits at. */
  peopleOnCurrent: number;
  /** The latest change to any of its steps or actions. */
  lastTouched: string | null;
};

/**
 * Null for a villa with nothing started — it has nothing to be late on.
 * An overdue action outranks everything, as on every action list; then a
 * revision under way; then a finished stage nobody has passed on.
 */
export function villaHealth(
  villa: HealthInput,
  actions: readonly BucketInput[],
  today: string,
): VillaHealth | null {
  if (villa.place.index === -1) return null;
  const open = actions.filter((action) => action.status !== "done");
  if (open.some((action) => actionBucket(action, today) === "overdue")) return "overdue";
  if (villa.revising || villa.currentStatus === "revising") return "revising";
  if (villa.place.complete) return "complete";
  if (villa.currentStatus === "done") return "pass_on";
  if (villa.peopleOnCurrent === 0) return "nobody";
  if (villa.lastTouched && daysBetween(villa.lastTouched.slice(0, 10), today) > 14) return "stale";
  return "on_track";
}

/** "1st", "2nd", "3rd", "4th" … for "Revising Design · 2nd time". */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

/** What a revising stage's chip says: the stage, and the time round when it is not the first. */
export function revisingLabel(stageName: string, revisions: number): string {
  return revisions > 1
    ? `Revising ${stageName} · ${ordinal(revisions)} time`
    : `Revising ${stageName}`;
}

/** Send-backs per step, counted from the history. */
export function revisionCounts(
  events: readonly { stepId: string; kind: string; toStatus: string | null }[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const event of events) {
    if (event.kind === "status" && event.toStatus === "revising") {
      counts.set(event.stepId, (counts.get(event.stepId) ?? 0) + 1);
    }
  }
  return counts;
}

// ---------------------------------------------------------------------
// The history, as sentences
// ---------------------------------------------------------------------

export type HistoryEvent = {
  seq: number;
  at: string;
  kind: string;
  fromStatus: string | null;
  toStatus: string | null;
  stageName: string;
  personName: string | null;
  actorId: string | null;
  actorName: string | null;
  reason: string | null;
};

/** One move in a few words: "started Permit", "put Anu on WD". */
export function eventPhrase(event: HistoryEvent): string {
  const stage = event.stageName;
  if (event.kind === "person_added") return `put ${event.personName ?? "someone"} on ${stage}`;
  if (event.kind === "person_removed") return `took ${event.personName ?? "someone"} off ${stage}`;
  const from = event.fromStatus;
  switch (event.toStatus) {
    case "working":
      if (!from || from === "not_started") return `started ${stage}`;
      if (from === "done") return `opened ${stage} again`;
      if (from === "revising") return `${stage} revision under way again`;
      return `${stage} back to working`;
    case "with_client":
      return `${stage} is with the client`;
    case "waiting":
      return `${stage} is waiting on others`;
    case "revising":
      return `sent ${stage} back for revision`;
    case "done":
      return `marked ${stage} done`;
    case "not_started":
      return `took back the start of ${stage}`;
    default:
      return `changed ${stage}`;
  }
}

export type HistoryLine = {
  key: number;
  at: string;
  actorName: string | null;
  phrases: string[];
  reasons: string[];
};

/**
 * Events made in one move — a pass is a stage done, the next started and
 * its people put on, all in one transaction and so at one `at` — read as
 * one line. Newest first.
 */
export function historyLines(events: readonly HistoryEvent[]): HistoryLine[] {
  const ordered = [...events].sort((a, b) => a.seq - b.seq);
  const lines: HistoryLine[] = [];
  for (const event of ordered) {
    const last = lines[lines.length - 1];
    const reason = event.kind === "status" && event.toStatus === "revising" ? event.reason : null;
    if (last && last.at === event.at && last.actorName === event.actorName) {
      last.phrases.push(eventPhrase(event));
      if (reason) last.reasons.push(reason);
    } else {
      lines.push({
        key: event.seq,
        at: event.at,
        actorName: event.actorName,
        phrases: [eventPhrase(event)],
        reasons: reason ? [reason] : [],
      });
    }
  }
  return lines.reverse();
}
