/**
 * Replaying a trail's event log into the state every screen shows.
 *
 * Nothing in here is stored anywhere. Holder, stuck-ness, per-leg actuals
 * and the projected finish are all derived on every read, which is what
 * makes it impossible for them to drift from the log.
 *
 * The primitive is `stintsOf`: one stint is one continuous period during
 * which one person held the baton on one leg. Pair each event with the
 * next, and everything else is arithmetic over that list. A leg visited
 * three times (bounced back twice) has three stints, which is exactly why
 * per-leg actuals cannot be read off a single event.
 *
 * Every stint takes its assignee and expected days from the EVENT, never
 * from the leg row — see the snapshot note in 0036's header. That is what
 * stops a manager stretching a future leg and thereby rewriting whether a
 * push that already happened was on time.
 *
 * Pure: no I/O. "Now" is always passed in.
 */

import { addDays, istDayKey, istDaysBetween } from "./day";
import { type ChainEvent, type Leg, isComplete, isWithClient, lastEvent } from "./events";

export type Stint = {
  legNo: number;
  assigneeId: string;
  /** When the baton landed on this leg. */
  from: string;
  /** When it left, or null if it is still here. */
  to: string | null;
  days: number;
  expectedDays: number;
  overBy: number;
  onTime: boolean;
  /** Still running: this is where the baton is now. */
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
  /**
   * The work is sitting with the client. Deliberately independent of
   * isStuck: a trail can be both, and when it is, cold is the louder
   * fact — the clock does not stop because the client has it.
   */
  isWithClient: boolean;
  withClientSince: string | null;
  withClientDays: number;
  overBy: number;
  bounceCount: number;
  startedAt: string | null;
  finishedAt: string | null;
  totalDays: number;
  /** Sum of expected days across every leg — the plan. */
  plannedDays: number;
  /** Expected days still to burn, from the current leg onwards. */
  remainingDays: number;
  legActuals: LegActual[];
  stints: Stint[];
};

/** Events that put the baton on a leg. A hand-off deliberately is not one. */
function entersLeg(e: ChainEvent): boolean {
  return e.kind === "started" || e.kind === "pushed" || e.kind === "bounced";
}

/**
 * One stint per leg-entering event, closed by the next one (or by `now`).
 *
 * A hand-off changes who is holding the baton without restarting the
 * clock, so it splits the stint in two: the first person's time still
 * counts against them, and the leg's deadline is unmoved. A hand-off can
 * therefore never launder a trail that has already gone cold.
 */
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
    // Days are measured from when the BATON reached the leg, not from
    // when this person took it over — the deadline belongs to the leg.
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
    // The baton can visit a leg more than once; what a reader wants is
    // the total time this leg has consumed, not the latest visit.
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

  // Same answer as the view's `flow` lateral, from the same list of
  // kinds. A hold that a later push, bounce or finish has overtaken is
  // no longer a hold.
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

/**
 * The IST day a trail is expected to be finished by, assuming every
 * remaining leg takes exactly as long as planned. Null once it is done.
 */
export function projectedFinishDay(state: ChainState, now: string): string | null {
  if (state.status === "finished" || state.currentLeg === null) return null;
  // Time already spent on the current leg is sunk; what is left is the
  // rest of its allowance plus every later leg in full.
  const left = Math.max(0, state.remainingDays - state.daysInLeg);
  return addDays(istDayKey(now), left);
}
