/**
 * The project schedule: turning a start date and a list of week counts
 * into every date anyone sees, and comparing the plan against reality.
 *
 * FOUNDER'S RULE: dates are worked out, never typed. The only stored
 * inputs are a project's start date and each stage's length in weeks.
 * Everything below — when a stage starts, when it ends, how far through
 * the plan today is, how far the work has actually got, and the gap
 * between those two — is calculated on every read.
 *
 * That is why inserting a stage in the middle cannot orphan a date, why
 * no two dates on screen can contradict each other, and why "timings
 * change dynamically" needs no machinery: a trail sitting cold pushes
 * its own finish later every day because the calculation is redone every
 * time someone looks.
 *
 * Two judgements are baked in and worth knowing:
 *
 *   1. A stage is weighted by its WEEKS, not counted as one. Otherwise a
 *      one-week snag list moves the project bar as much as a
 *      forty-six-week construction phase, and the headline number stops
 *      meaning anything.
 *   2. A stage in progress earns PARTIAL credit, from the share of its
 *      trails that are finished. All-or-nothing on stage completion
 *      makes the bar sit still for months and then lurch, which hides
 *      exactly the drift this is meant to show.
 *
 * Pure: no I/O. "Now" is always passed in.
 */

import { addDays, daysBetweenKeys, istDayKey } from "./day";

export type ProjectStage = {
  id: string;
  name: string;
  weeks: number;
  sort_order: number;
};

/** One stage, with its calculated window and how much of it is actually done. */
export type PlannedStage = ProjectStage & {
  /** Week the stage starts, counted from the project start (0-based). */
  weekFrom: number;
  weekTo: number;
  startDay: string;
  endDay: string;
  /** 0–1, from the trails filed under it. */
  progress: number;
  trailsTotal: number;
  trailsFinished: number;
  trailsStuck: number;
  /** Filed and planned, but never started — no clock running on any of them. */
  trailsQueued: number;
  status: "done" | "current" | "ahead";
};

export type ScheduleSummary = {
  hasSchedule: boolean;
  startDay: string | null;
  endDay: string | null;
  totalWeeks: number;
  /** How far through the plan today is, 0–100. */
  planPct: number;
  /** How far the work has actually got, 0–100, weighted by stage length. */
  actualPct: number;
  /** Positive = behind. In weeks, because that is how the plan is written. */
  slipWeeks: number;
  verdict: "ahead" | "on track" | "behind" | "not started";
  /** The stage the plan says we should be in today. */
  currentStageId: string | null;
  stages: PlannedStage[];
  /** Trails in this project that are not filed under any stage. */
  unfiledTrails: number;
};

/** Ordered the way every read orders them: sort_order, then id for a stable tie. */
export function orderStages<T extends ProjectStage>(stages: readonly T[]): T[] {
  return [...stages].sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
}

export type StageTrail = {
  projectStageId: string | null;
  isFinished: boolean;
  isStuck: boolean;
  /**
   * Created but not started. Counted as planned work that is NOT done —
   * which is the honest reading, and worth stating because it surprises.
   *
   * Laying a standard set down on a house makes its project look further
   * behind, and that is correct: the work was always coming, and the
   * flattering number before it was an artefact of the work not being
   * written down. A queued trail that did not count at all would let a
   * house record twelve jobs and still read 100% done.
   */
  isQueued: boolean;
};

export function buildSchedule(
  stages: readonly ProjectStage[],
  trails: readonly StageTrail[],
  startDate: string | null,
  now: string,
): ScheduleSummary {
  const ordered = orderStages(stages);
  const totalWeeks = ordered.reduce((sum, s) => sum + s.weeks, 0);
  const today = istDayKey(now);
  const unfiledTrails = trails.filter((t) => t.projectStageId === null).length;

  if (!startDate || ordered.length === 0) {
    return {
      hasSchedule: false,
      startDay: startDate,
      endDay: null,
      totalWeeks,
      planPct: 0,
      actualPct: 0,
      slipWeeks: 0,
      verdict: "not started",
      currentStageId: null,
      stages: [],
      unfiledTrails,
    };
  }

  // How far through the plan today is, in weeks. Clamped at both ends:
  // before the start it is 0, and past the end it stops at the total
  // rather than reporting a project 140% planned.
  const daysElapsed = daysBetweenKeys(startDate, today);
  const weeksElapsed = Math.min(totalWeeks, Math.max(0, daysElapsed / 7));

  let weekCursor = 0;
  let currentStageId: string | null = null;
  const planned: PlannedStage[] = ordered.map((stage) => {
    const weekFrom = weekCursor;
    const weekTo = weekCursor + stage.weeks;
    weekCursor = weekTo;

    const mine = trails.filter((t) => t.projectStageId === stage.id);
    const finished = mine.filter((t) => t.isFinished).length;
    const progress = mine.length === 0 ? 0 : finished / mine.length;

    // "Current" is where the PLAN says today is — deliberately not where
    // the work is. The distance between those two is the whole point of
    // the overview.
    const isCurrent = weeksElapsed >= weekFrom && weeksElapsed < weekTo;
    if (isCurrent) currentStageId = stage.id;

    return {
      ...stage,
      weekFrom,
      weekTo,
      startDay: addDays(startDate, Math.round(weekFrom * 7)),
      endDay: addDays(startDate, Math.round(weekTo * 7)),
      progress,
      trailsTotal: mine.length,
      trailsFinished: finished,
      trailsStuck: mine.filter((t) => t.isStuck && !t.isFinished).length,
      trailsQueued: mine.filter((t) => t.isQueued).length,
      status: weeksElapsed >= weekTo ? "done" : isCurrent ? "current" : "ahead",
    };
  });

  // Weighted by weeks, so a long stage moves the number more than a
  // short one. This is the "actual" half of the comparison.
  const doneWeeks = planned.reduce((sum, s) => sum + s.progress * s.weeks, 0);

  const planPct = totalWeeks === 0 ? 0 : (weeksElapsed / totalWeeks) * 100;
  const actualPct = totalWeeks === 0 ? 0 : (doneWeeks / totalWeeks) * 100;
  const slipWeeks = weeksElapsed - doneWeeks;

  return {
    hasSchedule: true,
    startDay: startDate,
    endDay: addDays(startDate, Math.round(totalWeeks * 7)),
    totalWeeks,
    planPct: round(planPct),
    actualPct: round(actualPct),
    slipWeeks: round(slipWeeks),
    // A week either way is noise on a schedule measured in weeks, so it
    // reads "on track" rather than crying wolf about half a week.
    verdict:
      daysElapsed < 0
        ? "not started"
        : slipWeeks > 1
          ? "behind"
          : slipWeeks < -1
            ? "ahead"
            : "on track",
    currentStageId,
    stages: planned,
    unfiledTrails,
  };
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

/** "2 weeks behind" / "on track" — the one line a leader reads. */
export function slipLabel(summary: ScheduleSummary): string {
  if (!summary.hasSchedule) return "No schedule set yet";
  if (summary.verdict === "not started") return "Has not started yet";
  if (summary.verdict === "on track") return "On track";
  const weeks = Math.abs(summary.slipWeeks);
  const rounded = weeks < 1 ? weeks.toFixed(1) : String(Math.round(weeks));
  const unit = Math.round(weeks) === 1 && weeks >= 1 ? "week" : "weeks";
  return summary.verdict === "behind" ? `${rounded} ${unit} behind` : `${rounded} ${unit} ahead`;
}
