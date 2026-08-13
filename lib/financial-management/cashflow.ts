/**
 * Monthly cash arithmetic for the Cash and Forward screens: dated
 * amounts in, chart models out. Pure and tested — the shaping carries
 * the arithmetic, so it lives beside interest.ts rather than in a page.
 *
 * Rules, same doctrine as the rest of the tool:
 *   - Dates are ISO strings compared lexically; `today` is an argument.
 *   - A month with no movements inside the window is a REAL ZERO — no
 *     money moved — so it renders as a zero bar, not a gap. (Reporter's
 *     null-is-a-gap rule is about unknown values; an empty month here is
 *     a known fact.)
 *   - An amount with NO date cannot be bucketed and is never invented
 *     into one — it is returned separately for the screen to state.
 */

import { ACCENT_TOKEN, chartToken } from "@/lib/charts/palette";
import type { CartesianModel, ChartPoint } from "@/lib/charts/series";

/** Money either side of a rounding boundary counts as settled. */
const EPSILON = 0.005;

export type DatedAmount = {
  amount: number;
  /** ISO date or timestamp; null = known amount, unknown month. */
  on: string | null;
};

/** '2026-08-13' (or a timestamp) → '2026-08'. */
export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** '2026-08' → 'Aug 2026'. The axis states the year — a 12-month window always spans two. */
export function monthLabel(key: string): string {
  const month = Number(key.slice(5, 7));
  return `${MONTH_NAMES[month - 1] ?? key} ${key.slice(0, 4)}`;
}

function shiftMonth(key: string, by: number): string {
  const total = Number(key.slice(0, 4)) * 12 + (Number(key.slice(5, 7)) - 1) + by;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** The `count` month keys ending at (and including) today's month. */
export function lastMonths(today: string, count: number): string[] {
  const current = monthKey(today);
  return Array.from({ length: count }, (_, i) => shiftMonth(current, i - (count - 1)));
}

/** The `count` month keys starting at (and including) today's month. */
export function nextMonths(today: string, count: number): string[] {
  const current = monthKey(today);
  return Array.from({ length: count }, (_, i) => shiftMonth(current, i));
}

/** Sum every amount, dated or not. */
export function sumAmounts(entries: readonly DatedAmount[]): number {
  return entries.reduce((sum, entry) => sum + entry.amount, 0);
}

/**
 * Bucket dated amounts by month. Undated amounts land in `undated`,
 * never in a bucket; amounts outside any window still count here — the
 * caller windows separately.
 */
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

/**
 * Money in against money out, one point per month of the window.
 * Grouped bars, not stacked — two opposite-direction flows must never
 * be added into one meaningless total.
 */
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

/** One stream over the window in the brand accent — the single-series rule. */
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
  /** Receipts allocated to this rung, from crm_milestone_facts. */
  receivedAmount: number;
};

export type ForwardCollections = {
  /** Outstanding rung money bucketed by due month (today's month onward). */
  byMonth: Map<string, number>;
  /** Outstanding on rungs whose due date has already passed. */
  overdue: number;
  /** Outstanding on priced rungs with no due date — never invented into a month. */
  unscheduled: number;
  /** Everything above, added up. */
  toCome: number;
};

/**
 * What the payment schedules say is still coming, and when.
 *
 * AN UNALLOCATED RECEIPT SETTLES THE OLDEST UNPAID RUNG FIRST, within
 * its own engagement — client-relations' dues.ts rule, restated here
 * (never imported: one tool never imports another tool's code) so this
 * screen and the CRM Dues page cannot disagree about what is owed.
 * Money often arrives before anyone files it against a rung; ignoring
 * it would show money already in the bank as still to come.
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

/**
 * What still has to be found: remaining expected spend, less the
 * collections still to come, less the sanctioned money not yet drawn.
 * Positive = money to raise; negative = covered on paper.
 */
export function fundingGap(args: {
  remainingSpend: number;
  collectionsToCome: number;
  undrawnSanctioned: number;
}): number {
  return args.remainingSpend - args.collectionsToCome - args.undrawnSanctioned;
}

/**
 * What the money out was made of, month by month — a part-to-whole, so
 * stacked. Streams appear in the order handed in and keep their slots.
 */
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
