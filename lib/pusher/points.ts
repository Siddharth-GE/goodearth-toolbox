/**
 * Flow points, ranks and the leaderboard — all derived from the event
 * log, none of it typed in or stored.
 *
 * The economy, and why each number is what it is:
 *
 *   +10  push, on time      the ordinary good day
 *    +4  push, late         still moved it; late is not nothing
 *   +25  finish, on time    the payoff, deliberately the biggest
 *   +15  finish, late
 *    +5  honest bounce      SENDING WORK BACK IS REWARDED. Bouncing is
 *                           how a problem surfaces early; a person who
 *                           quietly sits on bad input costs far more
 *                           than the five points.
 *     0  hand-off           an admin moving a baton is not an achievement
 *
 * Bounce points are capped at one per person per trail per IST day. Two
 * colleagues can otherwise bounce one trail back and forth and farm five
 * points a click. The leaderboard also shows a bounce rate beside the
 * total, so farming is visible rather than merely capped — and because a
 * bounce storm is a real signal that an activity's legs are wrong.
 *
 * On-time is NOT computable from one event: it needs the previous event's
 * timestamp and the expected days snapshotted on it. That is why
 * `scoreEvents` takes a whole chain's log and not a flat list.
 *
 * Pure: no I/O, no clock.
 */

import { istDayKey, istDaysBetween } from "./day";
import type { ChainEvent } from "./events";

export const POINTS = {
  pushOnTime: 10,
  pushLate: 4,
  finishOnTime: 25,
  finishLate: 15,
  bounce: 5,
} as const;

/** Thresholds are lifetime totals, ascending. */
export const RANKS: readonly { name: string; min: number }[] = [
  { name: "Runner", min: 0 },
  { name: "Pacer", min: 100 },
  { name: "Courier", min: 250 },
  { name: "Captain", min: 500 },
  { name: "Flowmaster", min: 900 },
];

export type ScoredEvent = {
  chainId: string;
  seq: number;
  actorId: string;
  kind: ChainEvent["kind"];
  occurredAt: string;
  dayKey: string;
  /** Null where on-time is not a meaningful question (bounces, hand-offs). */
  onTime: boolean | null;
  points: number;
};

export function rankFor(points: number): { rank: string; next: string | null; toNext: number } {
  let current = RANKS[0];
  let next: (typeof RANKS)[number] | null = null;
  for (let i = 0; i < RANKS.length; i++) {
    if (points >= RANKS[i].min) {
      current = RANKS[i];
      next = RANKS[i + 1] ?? null;
    }
  }
  return {
    rank: current.name,
    next: next?.name ?? null,
    toNext: next ? next.min - points : 0,
  };
}

/** How far through the current rank, 0–100. A topped-out rank reads 100. */
export function rankProgress(points: number): number {
  let current = RANKS[0];
  let next: (typeof RANKS)[number] | null = null;
  for (let i = 0; i < RANKS.length; i++) {
    if (points >= RANKS[i].min) {
      current = RANKS[i];
      next = RANKS[i + 1] ?? null;
    }
  }
  if (!next) return 100;
  return Math.min(100, Math.round(((points - current.min) / (next.min - current.min)) * 100));
}

/**
 * What a push or finish would be worth right now — for the confirm sheet,
 * so the number shown before the click is the number awarded after it.
 */
export function previewPoints(kind: "push" | "finish", daysInLeg: number, expectedDays: number) {
  const onTime = daysInLeg <= expectedDays;
  const points =
    kind === "finish"
      ? onTime
        ? POINTS.finishOnTime
        : POINTS.finishLate
      : onTime
        ? POINTS.pushOnTime
        : POINTS.pushLate;
  return { onTime, points };
}

/**
 * Score one chain's log. Events must be from a single chain; pass each
 * chain separately so the predecessor lookup stays honest.
 */
export function scoreChain(chainId: string, events: readonly ChainEvent[]): ScoredEvent[] {
  const ordered = [...events].sort((a, b) => a.seq - b.seq);
  const out: ScoredEvent[] = [];

  // The last event that put the baton on a leg, with the expected days it
  // was given at the time — the only honest basis for "was that on time".
  let enteredAt: string | null = null;
  let expected = 0;

  for (const e of ordered) {
    const dayKey = istDayKey(e.occurred_at);

    if (e.kind === "started") {
      enteredAt = e.occurred_at;
      expected = e.to_expected_days ?? 0;
      continue;
    }

    if (e.kind === "handed") {
      // Worth nothing, and it does not restart the leg clock.
      out.push({
        chainId,
        seq: e.seq,
        actorId: e.actor_id,
        kind: e.kind,
        occurredAt: e.occurred_at,
        dayKey,
        onTime: null,
        points: 0,
      });
      continue;
    }

    const days = enteredAt === null ? 0 : Math.max(0, istDaysBetween(enteredAt, e.occurred_at));
    const onTime = days <= expected;

    let points = 0;
    let scoredOnTime: boolean | null = onTime;
    if (e.kind === "pushed") {
      points = onTime ? POINTS.pushOnTime : POINTS.pushLate;
    } else if (e.kind === "completed") {
      points = onTime ? POINTS.finishOnTime : POINTS.finishLate;
    } else if (e.kind === "bounced") {
      points = POINTS.bounce;
      // Bouncing is a judgement about the work, not about the clock, so
      // it is never counted in anyone's on-time percentage.
      scoredOnTime = null;
    }

    out.push({
      chainId,
      seq: e.seq,
      actorId: e.actor_id,
      kind: e.kind,
      occurredAt: e.occurred_at,
      dayKey,
      onTime: scoredOnTime,
      points,
    });

    if (e.kind === "pushed" || e.kind === "bounced") {
      enteredAt = e.occurred_at;
      expected = e.to_expected_days ?? 0;
    }
  }

  return capBounces(out);
}

/** At most one scored bounce per (chain, actor, IST day). The rest stay in the log, worth zero. */
function capBounces(scored: ScoredEvent[]): ScoredEvent[] {
  const seen = new Set<string>();
  return scored.map((s) => {
    if (s.kind !== "bounced") return s;
    const key = `${s.chainId}|${s.actorId}|${s.dayKey}`;
    if (seen.has(key)) return { ...s, points: 0 };
    seen.add(key);
    return s;
  });
}

/** Score many chains at once. The key is the chain id. */
export function scoreAll(eventsByChain: ReadonlyMap<string, readonly ChainEvent[]>): ScoredEvent[] {
  return [...eventsByChain].flatMap(([chainId, events]) => scoreChain(chainId, events));
}

export type FlowTotals = {
  actorId: string;
  points: number;
  moves: number;
  bounces: number;
  onTimePct: number | null;
  rank: string;
  rankProgress: number;
};

export function totalsByActor(scored: readonly ScoredEvent[]): Map<string, FlowTotals> {
  const acc = new Map<string, { points: number; moves: number; bounces: number; timed: number; onTime: number }>();

  for (const s of scored) {
    const row = acc.get(s.actorId) ?? { points: 0, moves: 0, bounces: 0, timed: 0, onTime: 0 };
    row.points += s.points;
    if (s.kind !== "handed") row.moves += 1;
    if (s.kind === "bounced") row.bounces += 1;
    if (s.onTime !== null) {
      row.timed += 1;
      if (s.onTime) row.onTime += 1;
    }
    acc.set(s.actorId, row);
  }

  return new Map(
    [...acc].map(([actorId, r]) => [
      actorId,
      {
        actorId,
        points: r.points,
        moves: r.moves,
        bounces: r.bounces,
        // Null, not 100: someone who has never moved a baton has no
        // record, and showing them a perfect score would be a lie.
        onTimePct: r.timed === 0 ? null : Math.round((r.onTime / r.timed) * 100),
        rank: rankFor(r.points).rank,
        rankProgress: rankProgress(r.points),
      },
    ]),
  );
}

/** Only the events inside a window, by IST day — for "this week's flow". */
export function since(scored: readonly ScoredEvent[], fromDayKey: string): ScoredEvent[] {
  return scored.filter((s) => s.dayKey >= fromDayKey);
}
