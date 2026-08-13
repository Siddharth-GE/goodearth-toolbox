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

import { chartToken } from "@/lib/charts/palette";
import type { CartesianModel, ChartPoint } from "@/lib/charts/series";

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
