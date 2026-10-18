/**
 * Replays a trail's event log into the state every screen shows; nothing is stored.
 * A stint is one person holding the baton on one leg. Stints take assignee and days from the
 * EVENT, never the leg row, so editing a future leg can't rewrite a past push (0036 header). Pure.
 */

import { addDays, istDayKey, istDaysBetween } from "./day";
import { type ChainEvent, type Leg, isComplete, isWithClient, lastEvent } from "./events";

export type Stint = {
  legNo: number;
  assigneeId: string;
  from: string;
  to: string | null;
  days: number;
  expectedDays: number;
  overBy: number;
  onTime: boolean;
  open: boolean;
};

export type LegActual = {
  legNo: number;
  /** How many times the baton has been on this leg — >1 means it bounced back. */
  visits: number;
  daysSoFar: number;
  expectedDays: number;
  overBy: number;
  status: "done" | "current" | "ahead";
};

export type ChainState = {
  status: "running" | "finished";
  currentLeg: number | null;
  holderId: string | null;
  /** When the baton landed on the current leg — the last LEG-ENTERING event. */
  enteredAt: string | null;
  expectedDays: number;
  daysInLeg: number;
  isStuck: boolean;
  /** With the client. Independent of isStuck; when both, cold is the louder fact. */
  isWithClient: boolean;
  withClientSince: string | null;
  withClientDays: number;
  overBy: number;
  bounceCount: number;
  startedAt: string | null;
  finishedAt: string | null;
  totalDays: number;
  plannedDays: number;
  remainingDays: number;
  legActuals: LegActual[];
  stints: Stint[];
};

/** Events that put the baton on a leg. A hand-off deliberately is not one. */
function entersLeg(e: ChainEvent): boolean {
  return e.kind === "started" || e.kind === "pushed" || e.kind === "bounced";
}

/** One stint per leg-entering event. A hand-off splits a stint without restarting the clock, so it can't launder a cold trail. */
export function stintsOf(events: readonly ChainEvent[], now: string): Stint[] {
  const ordered = [...events].sort((a, b) => a.seq - b.seq);
  const stints: Stint[] = [];

  let legNo: number | null = null;
  let enteredAt: string | null = null;
  let expected = 0;
  let holder: string | null = null;
  let holderSince: string | null = null;

  const close = (at: string, open: boolean) => {
    if (legNo === null || holder === null || holderSince === null || enteredAt === null) return;
    // Days run from when the BATON reached the leg; the deadline belongs to the leg.
    const days = Math.max(0, istDaysBetween(enteredAt, at));
    stints.push({
      legNo,
      assigneeId: holder,
      from: holderSince,
      to: open ? null : at,
      days,
      expectedDays: expected,
      overBy: Math.max(0, days - expected),
      onTime: days <= expected,
      open,
    });
  };

  for (const e of ordered) {
    if (entersLeg(e)) {
      close(e.occurred_at, false);
      legNo = e.to_leg;
      enteredAt = e.occurred_at;
      expected = e.to_expected_days ?? 0;
      holder = e.to_assignee_id;
      holderSince = e.occurred_at;
    } else if (e.kind === "handed") {
      close(e.occurred_at, false);
      holder = e.to_assignee_id;
      holderSince = e.occurred_at;
    } else if (e.kind === "completed") {
      close(e.occurred_at, false);
      legNo = null;
      holder = null;
      holderSince = null;
      enteredAt = null;
    }
  }

  close(now, true);
  return stints;
}

export function replayChain(
  events: readonly ChainEvent[],
  legs: readonly Leg[],
  now: string,
): ChainState {
  const ordered = [...events].sort((a, b) => a.seq - b.seq);
  const last = lastEvent(ordered);
  const finished = isComplete(last);
  const stints = stintsOf(ordered, now);
  const byLeg = [...legs].sort((a, b) => a.leg_no - b.leg_no);

  const open = stints.find((s) => s.open) ?? null;
  const currentLeg = finished ? null : (open?.legNo ?? null);

  const legActuals: LegActual[] = byLeg.map((leg) => {
    const mine = stints.filter((s) => s.legNo === leg.leg_no);
    // Total time the leg has consumed across visits, not the latest visit.
    const daysSoFar = mine.reduce((sum, s) => sum + s.days, 0);
    const expectedDays = mine.at(-1)?.expectedDays ?? leg.expected_days;
    return {
      legNo: leg.leg_no,
      visits: mine.length,
      daysSoFar,
      expectedDays,
      overBy: Math.max(0, daysSoFar - expectedDays),
      status: finished
        ? "done"
        : currentLeg === null
          ? "ahead"
          : leg.leg_no < currentLeg
            ? "done"
            : leg.leg_no === currentLeg
              ? "current"
              : "ahead",
    };
  });

  const startedAt = ordered[0]?.occurred_at ?? null;
  const finishedAt = finished ? (last?.occurred_at ?? null) : null;
  const plannedDays = byLeg.reduce((sum, l) => sum + l.expected_days, 0);
  const remainingDays =
    currentLeg === null
      ? 0
      : byLeg.filter((l) => l.leg_no >= currentLeg).reduce((s, l) => s + l.expected_days, 0);

  const daysInLeg = open?.days ?? 0;
  const expectedDays = open?.expectedDays ?? 0;

  // Same as the view's flow lateral: a hold overtaken by a push, bounce or finish is no longer a hold.
  const withClient = !finished && isWithClient(ordered);
  const heldAt = withClient
    ? (ordered.filter((e) => e.kind === "client_held").at(-1)?.occurred_at ?? null)
    : null;

  return {
    status: finished ? "finished" : "running",
    currentLeg,
    holderId: finished ? null : (open?.assigneeId ?? null),
    enteredAt: open?.from ?? null,
    expectedDays,
    daysInLeg,
    isStuck: !finished && open !== null && daysInLeg > expectedDays,
    isWithClient: withClient,
    withClientSince: heldAt,
    withClientDays: heldAt ? Math.max(0, istDaysBetween(heldAt, now)) : 0,
    overBy: open ? open.overBy : 0,
    bounceCount: ordered.filter((e) => e.kind === "bounced").length,
    startedAt,
    finishedAt,
    totalDays: startedAt ? Math.max(0, istDaysBetween(startedAt, finishedAt ?? now)) : 0,
    plannedDays,
    remainingDays,
    legActuals,
    stints,
  };
}

/** The IST day the trail is expected done if every remaining leg takes its plan. Null once done. */
export function projectedFinishDay(state: ChainState, now: string): string | null {
  if (state.status === "finished" || state.currentLeg === null) return null;
  // Time already spent on the current leg is sunk.
  const left = Math.max(0, state.remainingDays - state.daysInLeg);
  return addDays(istDayKey(now), left);
}
