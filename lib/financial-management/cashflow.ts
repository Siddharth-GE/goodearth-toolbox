/**
 * Monthly cash arithmetic for the Cash and Forward screens: dated amounts in, chart models out. Pure.
 * - Dates are ISO strings compared lexically; `today` is an argument.
 * - A month with no movements in the window is a real zero (a zero bar, not a gap): it is a known fact.
 * - An amount with no date is never invented into a month; it is returned separately for the screen to state.
 */

import { ACCENT_TOKEN, chartToken } from "@/lib/charts/palette";
import type { CartesianModel, ChartPoint } from "@/lib/charts/series";
import { monthLabel, shiftMonth } from "@/lib/dates";

/** Money either side of a rounding boundary counts as settled. */
const EPSILON = 0.005;

export type DatedAmount = {
  amount: number;
  /** ISO date or timestamp; null = known amount, unknown month. */
  on: string | null;
};

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export { monthLabel };

export function lastMonths(today: string, count: number): string[] {
  const current = monthKey(today);
  return Array.from({ length: count }, (_, i) => shiftMonth(current, i - (count - 1)));
}

export function nextMonths(today: string, count: number): string[] {
  const current = monthKey(today);
  return Array.from({ length: count }, (_, i) => shiftMonth(current, i));
}

export function sumAmounts(entries: readonly DatedAmount[]): number {
  return entries.reduce((sum, entry) => sum + entry.amount, 0);
}

/** Bucket dated amounts by month. Undated amounts land in `undated`, never a bucket. */
export function bucketMonthly(entries: readonly DatedAmount[]): {
  byMonth: Map<string, number>;
  undated: number;
} {
  const byMonth = new Map<string, number>();
  let undated = 0;
  for (const entry of entries) {
    if (entry.on === null) {
      undated += entry.amount;
      continue;
    }
    const key = monthKey(entry.on);
    byMonth.set(key, (byMonth.get(key) ?? 0) + entry.amount);
  }
  return { byMonth, undated };
}

/** Money in against money out per month: grouped bars, never stacked into one meaningless total. */
export function buildInOutModel(args: {
  inflows: readonly DatedAmount[];
  outflows: readonly DatedAmount[];
  months: readonly string[];
}): CartesianModel {
  const inflows = bucketMonthly(args.inflows).byMonth;
  const outflows = bucketMonthly(args.outflows).byMonth;

  const points: ChartPoint[] = args.months.map((key) => ({
    category: monthLabel(key),
    values: {
      in: inflows.get(key) ?? 0,
      out: outflows.get(key) ?? 0,
    },
  }));

  return {
    kind: "cartesian",
    type: "bar",
    categoryLabel: "Month",
    points,
    series: [
      { id: "in", label: "Money in", color: chartToken(1) },
      { id: "out", label: "Money out", color: chartToken(2) },
    ],
    money: true,
  };
}

export function buildMonthlySeriesModel(args: {
  id: string;
  label: string;
  byMonth: ReadonlyMap<string, number>;
  months: readonly string[];
}): CartesianModel {
  return {
    kind: "cartesian",
    type: "bar",
    categoryLabel: "Month",
    points: args.months.map((key) => ({
      category: monthLabel(key),
      values: { [args.id]: args.byMonth.get(key) ?? 0 },
    })),
    series: [{ id: args.id, label: args.label, color: ACCENT_TOKEN }],
    money: true,
  };
}

export type ForwardMilestone = {
  engagementId: string;
  sortOrder: number;
  /** Null until someone has decided the amount — not the same as zero. */
  dueAmount: number | null;
  dueOn: string | null;
  receivedAmount: number;
};

export type ForwardCollections = {
  byMonth: Map<string, number>;
  overdue: number;
  /** Outstanding on priced rungs with no due date — never invented into a month. */
  unscheduled: number;
  toCome: number;
};

/**
 * What the payment schedules say is still coming, and when. An unallocated receipt settles the
 * oldest unpaid rung first within its engagement: client-relations' dues.ts rule, restated (one
 * tool never imports another's) so this screen and the CRM Dues page cannot disagree.
 */
export function forwardCollections(
  milestones: readonly ForwardMilestone[],
  unallocatedByEngagement: ReadonlyMap<string, number>,
  today: string,
): ForwardCollections {
  const byEngagement = new Map<string, ForwardMilestone[]>();
  for (const milestone of milestones) {
    const list = byEngagement.get(milestone.engagementId) ?? [];
    list.push(milestone);
    byEngagement.set(milestone.engagementId, list);
  }

  const byMonth = new Map<string, number>();
  let overdue = 0;
  let unscheduled = 0;

  for (const [engagementId, rungs] of byEngagement) {
    let pool = unallocatedByEngagement.get(engagementId) ?? 0;
    const ordered = [...rungs].sort((a, b) => a.sortOrder - b.sortOrder);
    for (const rung of ordered) {
      // An unpriced rung is not zero — and absorbs nothing.
      if (rung.dueAmount === null) continue;
      let received = rung.receivedAmount;
      if (pool > 0 && rung.dueAmount - received > EPSILON) {
        const take = Math.min(pool, rung.dueAmount - received);
        received += take;
        pool -= take;
      }
      const outstanding = Math.max(0, rung.dueAmount - received);
      if (outstanding <= EPSILON) continue;

      if (rung.dueOn === null) {
        unscheduled += outstanding;
      } else if (rung.dueOn < today) {
        overdue += outstanding;
      } else {
        const key = monthKey(rung.dueOn);
        byMonth.set(key, (byMonth.get(key) ?? 0) + outstanding);
      }
    }
  }

  let scheduled = 0;
  for (const value of byMonth.values()) scheduled += value;
  return { byMonth, overdue, unscheduled, toCome: scheduled + overdue + unscheduled };
}

/** What still has to be found: expected spend less collections to come less sanctioned money undrawn. Positive = money to raise. */
export function fundingGap(args: {
  remainingSpend: number;
  collectionsToCome: number;
  undrawnSanctioned: number;
}): number {
  return args.remainingSpend - args.collectionsToCome - args.undrawnSanctioned;
}

/** What the money out was made of, month by month, stacked. Streams keep their slots in the order handed in. */
export function buildOutflowStackModel(args: {
  streams: readonly { id: string; label: string; entries: readonly DatedAmount[] }[];
  months: readonly string[];
}): CartesianModel {
  const buckets = args.streams.map((stream) => bucketMonthly(stream.entries).byMonth);

  const points: ChartPoint[] = args.months.map((key) => ({
    category: monthLabel(key),
    values: Object.fromEntries(
      args.streams.map((stream, index) => [stream.id, buckets[index].get(key) ?? 0]),
    ),
  }));

  return {
    kind: "cartesian",
    type: "stacked",
    categoryLabel: "Month",
    points,
    series: args.streams.map((stream, index) => ({
      id: stream.id,
      label: stream.label,
      color: chartToken(index + 1),
    })),
    money: true,
  };
}
