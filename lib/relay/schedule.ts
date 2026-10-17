/**
 * The project schedule. Dates are worked out, never typed: only the start date and each stage's weeks are stored.
 * A stage is weighted by its weeks, so a one-week snag list can't move the bar like a 46-week build.
 * A stage in progress earns partial credit from its finished trails, or the bar sits still then lurches. Pure.
 */

import { addDays, daysBetweenKeys, istDayKey } from "./day";

export type ProjectStage = {
  id: string;
  name: string;
  weeks: number;
  sort_order: number;
};

export type PlannedStage = ProjectStage & {
  /** Week the stage starts, counted from the project start (0-based). */
  weekFrom: number;
  weekTo: number;
  startDay: string;
  endDay: string;
  progress: number;
  trailsTotal: number;
  trailsFinished: number;
  trailsStuck: number;
  trailsQueued: number;
  status: "done" | "current" | "ahead";
};

export type ScheduleSummary = {
  hasSchedule: boolean;
  startDay: string | null;
  endDay: string | null;
  totalWeeks: number;
  planPct: number;
  /** How far the work has actually got, 0–100, weighted by stage length. */
  actualPct: number;
  /** Positive = behind. In weeks, because that is how the plan is written. */
  slipWeeks: number;
  verdict: "ahead" | "on track" | "behind" | "not started";
  currentStageId: string | null;
  stages: PlannedStage[];
  unfiledTrails: number;
};

export function orderStages<T extends ProjectStage>(stages: readonly T[]): T[] {
  return [...stages].sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
}

export type StageTrail = {
  projectStageId: string | null;
  isFinished: boolean;
  isStuck: boolean;
  /** Created but not started: counted as planned work that is NOT done, so laying a set down makes a project read further behind. That is honest. */
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

  // Clamped: 0 before the start, the total after the end.
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

    // "Current" is where the PLAN says today is, not the work; the gap is the point.
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

  // Weighted by weeks: the "actual" half of the comparison.
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
    // A week either way is noise, so it reads "on track".
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

export function slipLabel(summary: ScheduleSummary): string {
  if (!summary.hasSchedule) return "No schedule set yet";
  if (summary.verdict === "not started") return "Has not started yet";
  if (summary.verdict === "on track") return "On track";
  const weeks = Math.abs(summary.slipWeeks);
  const rounded = weeks < 1 ? weeks.toFixed(1) : String(Math.round(weeks));
  const unit = Math.round(weeks) === 1 && weeks >= 1 ? "week" : "weeks";
  return summary.verdict === "behind" ? `${rounded} ${unit} behind` : `${rounded} ${unit} ahead`;
}
