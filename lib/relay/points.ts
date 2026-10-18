/**
 * Flow points, ranks and the leaderboard, derived from the event log.
 * Sending work back (a bounce) is rewarded because it surfaces problems early; hand-offs score 0.
 * Bounce points cap at one per person per trail per IST day so colleagues can't farm them.
 * On-time needs the previous event, so scoreEvents takes a whole chain's log. Pure.
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

/** What a push or finish is worth now, so the confirm sheet matches the award. */
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

/** Score one chain's log. Pass chains separately so the predecessor lookup stays honest. */
export function scoreChain(chainId: string, events: readonly ChainEvent[]): ScoredEvent[] {
  const ordered = [...events].sort((a, b) => a.seq - b.seq);
  const out: ScoredEvent[] = [];

  // The last leg-entering event and its expected days then: the honest basis for "on time".
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
      // Bouncing judges the work, not the clock: never in on-time %.
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

/** Score many chains at once, keyed by chain id. NOT WIRED TO A SCREEN YET, NOT DEAD CODE: the leaderboard will read it. */
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
  const acc = new Map<
    string,
    { points: number; moves: number; bounces: number; timed: number; onTime: number }
  >();

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
        // Null, not 100: no record is not a perfect one.
        onTimePct: r.timed === 0 ? null : Math.round((r.onTime / r.timed) * 100),
        rank: rankFor(r.points).rank,
        rankProgress: rankProgress(r.points),
      },
    ]),
  );
}

export function since(scored: readonly ScoredEvent[], fromDayKey: string): ScoredEvent[] {
  return scored.filter((s) => s.dayKey >= fromDayKey);
}
