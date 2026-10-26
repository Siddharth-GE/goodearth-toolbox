import { addDays } from "./schedule";
import type { StageStatus, WaitingOn } from "./programme";

// Pure. The week ahead across villas (plan.md phase E), from each villa's forecast: what starts this week and in the next two,
// what is waiting, which villas are behind their first plan, and which contractors are booked on more than one villa at once.

export const THIS_WEEK_DAYS = 7;
export const AHEAD_DAYS = 21;

export type PlannedStage = {
  plotId: string;
  plotName: string;
  villaName: string;
  groupId: string;
  code: string;
  name: string;
  status: StageStatus;
  startedOn: string | null;
  start: string | null;
  finish: string | null;
  days: number | null;
  contractorId: string | null;
  waitingOn: WaitingOn | null;
};

export type BehindVilla = {
  plotId: string;
  plotName: string;
  villaName: string;
  handover: string;
  slip: number;
};

const byStart = (a: PlannedStage, b: PlannedStage) =>
  (a.start ?? "").localeCompare(b.start ?? "") || a.plotName.localeCompare(b.plotName);

/**
 * One villa's stages as the look ahead sees them: an untouched stage before the furthest one begun is left out, as the
 * villa page's Next up leaves it out — nobody marked it, and the forecast would start it today, every day.
 */
export function stagesAhead(stages: PlannedStage[]): PlannedStage[] {
  const furthest = stages.findLastIndex((stage) => stage.status !== "not_started");
  return stages.filter((stage, index) => stage.status !== "not_started" || index > furthest);
}

/** Stages not begun, by when the forecast starts them: within 7 days, then the 14 after. Waiting stages on their own. */
export function lookAhead(stages: PlannedStage[], today: string) {
  const weekEnd = addDays(today, THIS_WEEK_DAYS - 1);
  const aheadEnd = addDays(today, AHEAD_DAYS - 1);
  // Waiting before it began is in Waiting (and in Now on its villa), not here.
  const upcoming = stages.filter((stage) => stage.status === "not_started" && stage.start !== null);
  return {
    thisWeek: upcoming.filter((stage) => stage.start! <= weekEnd).sort(byStart),
    nextTwoWeeks: upcoming
      .filter((stage) => stage.start! > weekEnd && stage.start! <= aheadEnd)
      .sort(byStart),
    waiting: stages.filter((stage) => stage.status === "waiting").sort(byStart),
  };
}

export type ContractorLoad = {
  contractorId: string;
  stages: PlannedStage[];
  villas: number;
  /** The first day any of these stages runs, from today. */
  from: string;
  /** Two of its stages on different villas run on the same days. */
  clash: boolean;
};

/**
 * Each contractor's stages running in the next three weeks; a clash is two villas' stages overlapping in time. A stage with no
 * days has no finish, so it is taken to run to the end of the three weeks — a clash shown rather than one missed.
 */
export function contractorLoads(stages: PlannedStage[], today: string): ContractorLoad[] {
  const aheadEnd = addDays(today, AHEAD_DAYS - 1);
  const end = (stage: PlannedStage) => stage.finish ?? aheadEnd;
  const live = stages.filter(
    (stage) =>
      stage.contractorId &&
      stage.status !== "done" &&
      stage.start !== null &&
      stage.start <= aheadEnd &&
      end(stage) >= today,
  );
  const byContractor = new Map<string, PlannedStage[]>();
  for (const stage of live) {
    const list = byContractor.get(stage.contractorId!);
    if (list) list.push(stage);
    else byContractor.set(stage.contractorId!, [stage]);
  }
  return [...byContractor.entries()]
    .map(([contractorId, list]) => {
      const sorted = [...list].sort(byStart);
      const clash = sorted.some((a, index) =>
        sorted
          .slice(index + 1)
          .some((b) => a.plotId !== b.plotId && a.start! <= end(b) && b.start! <= end(a)),
      );
      const first = sorted[0].start!;
      return {
        contractorId,
        stages: sorted,
        villas: new Set(sorted.map((stage) => stage.plotId)).size,
        from: first > today ? first : today,
        clash,
      };
    })
    .sort(
      (a, b) =>
        Number(b.clash) - Number(a.clash) || b.villas - a.villas || a.from.localeCompare(b.from),
    );
}
