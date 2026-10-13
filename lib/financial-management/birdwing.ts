/**
 * Birdwing in Financial Management — the consolidated page's eight tiles
 * and its charts, worked out from 0117's month and expense facts. Pure:
 * birdwing-queries.ts reads, this shapes, the page draws.
 *
 *   billed value      Σ charges − OTA commission − discount
 *   collected         Σ receipts
 *   pending           billed − collected − cross-charged − written off
 *   result on billed  billed − expenses       result on cash  collected − expenses
 *   occupancy (est.)  room-nights ÷ (rooms × days), over complete months
 *   average room rate room revenue ÷ room-nights
 *
 * A month still running counts in the money but not in occupancy or the
 * room rate (its nights are not all slept yet); a month not yet begun
 * counts in nothing.
 */
import { ACCENT_TOKEN, chartToken } from "@/lib/charts/palette";
import type { CartesianModel } from "@/lib/charts/series";

export type BirdwingMonth = {
  month: string;
  daysInMonth: number;
  rooms: number;
  stays: number;
  roomNights: number;
  roomNightsEstimated: boolean;
  roomRevenue: number;
  charged: number;
  otaCommission: number;
  discount: number;
  billed: number;
  billedGuest: number;
  billedInternal: number;
  collected: number;
  crossCharged: number;
  writtenOff: number;
  pending: number;
  pendingGuest: number;
  pendingInternal: number;
  expenses: number;
};

export type BirdwingTiles = {
  billed: number;
  charged: number;
  commissionAndDiscount: number;
  collected: number;
  collectedShare: number | null;
  pending: number;
  pendingGuest: number;
  pendingInternal: number;
  crossCharged: number;
  expenses: number;
  resultBilled: number;
  resultCash: number;
  /** Null until a complete month has rooms to fill. */
  occupancy: number | null;
  occupancyRoomNights: number;
  occupancyCapacity: number;
  occupancyEstimated: boolean;
  /** Null while no room-night has been sold. */
  averageRoomRate: number | null;
  monthCount: number;
};

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const sum = (rows: BirdwingMonth[], pick: (row: BirdwingMonth) => number) =>
  round2(rows.reduce((total, row) => total + pick(row), 0));

/** "2026-10-01" → "Oct 26". */
export function shortMonth(month: string): string {
  return new Date(`${month.slice(0, 7)}-01T00:00:00Z`).toLocaleDateString("en-IN", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}

/** The months that have begun, oldest first. */
export function monthsSoFar(rows: BirdwingMonth[], today: string): BirdwingMonth[] {
  const current = `${today.slice(0, 7)}-01`;
  return rows.filter((row) => row.month <= current).sort((a, b) => (a.month < b.month ? -1 : 1));
}

export function birdwingTiles(rows: BirdwingMonth[], today: string): BirdwingTiles {
  const months = monthsSoFar(rows, today);
  const current = `${today.slice(0, 7)}-01`;
  const complete = months.filter((row) => row.month < current);

  const billed = sum(months, (row) => row.billed);
  const collected = sum(months, (row) => row.collected);
  const expenses = sum(months, (row) => row.expenses);
  const roomNights = sum(complete, (row) => row.roomNights);
  const capacity = complete.reduce((total, row) => total + row.rooms * row.daysInMonth, 0);
  // The room rate over the same complete months as occupancy — the
  // consolidated page's window.
  const roomRevenue = sum(complete, (row) => row.roomRevenue);

  return {
    billed,
    charged: sum(months, (row) => row.charged),
    commissionAndDiscount: sum(months, (row) => row.otaCommission + row.discount),
    collected,
    collectedShare: billed > 0 ? collected / billed : null,
    pending: sum(months, (row) => row.pending),
    pendingGuest: sum(months, (row) => row.pendingGuest),
    pendingInternal: sum(months, (row) => row.pendingInternal),
    crossCharged: sum(months, (row) => row.crossCharged),
    expenses,
    resultBilled: round2(billed - expenses),
    resultCash: round2(collected - expenses),
    occupancy: capacity > 0 ? roomNights / capacity : null,
    occupancyRoomNights: roomNights,
    occupancyCapacity: capacity,
    occupancyEstimated: complete.some((row) => row.roomNightsEstimated),
    averageRoomRate: roomNights > 0 ? round2(roomRevenue / roomNights) : null,
    monthCount: months.length,
  };
}

/** Billed, collected and spent, month by month. */
export function moneyByMonthModel(months: BirdwingMonth[]): CartesianModel {
  return {
    kind: "cartesian",
    type: "bar",
    categoryLabel: "Month",
    points: months.map((row) => ({
      category: shortMonth(row.month),
      values: { billed: row.billed, collected: row.collected, expenses: row.expenses },
    })),
    series: [
      { id: "billed", label: "Billed value", color: chartToken(1) },
      { id: "collected", label: "Collected", color: chartToken(2) },
      { id: "expenses", label: "Expenses", color: chartToken(3) },
    ],
    money: true,
  };
}

/** Who the rooms were for: paying guests against Goodearth's own use. */
export function segmentSplitModel(months: BirdwingMonth[]): CartesianModel {
  return {
    kind: "cartesian",
    type: "stacked",
    categoryLabel: "Month",
    points: months.map((row) => ({
      category: shortMonth(row.month),
      values: { guest: row.billedGuest, internal: row.billedInternal },
    })),
    series: [
      { id: "guest", label: "Paying guests", color: chartToken(1) },
      { id: "internal", label: "Goodearth's own use", color: chartToken(2) },
    ],
    money: true,
  };
}

/** The month's result on billed value, one series in the accent. */
export function resultModel(months: BirdwingMonth[]): CartesianModel {
  return {
    kind: "cartesian",
    type: "bar",
    categoryLabel: "Month",
    points: months.map((row) => ({
      category: shortMonth(row.month),
      values: { result: round2(row.billed - row.expenses) },
    })),
    series: [{ id: "result", label: "Billed − expenses", color: ACCENT_TOKEN }],
    money: true,
  };
}

/** Occupancy as a percentage of the rooms' nights, complete months only. */
export function occupancyModel(months: BirdwingMonth[], today: string): CartesianModel {
  const current = `${today.slice(0, 7)}-01`;
  return {
    kind: "cartesian",
    type: "bar",
    categoryLabel: "Month",
    points: months.map((row) => {
      const capacity = row.rooms * row.daysInMonth;
      return {
        category: shortMonth(row.month),
        values: {
          occupancy:
            row.month < current && capacity > 0
              ? Math.round((row.roomNights / capacity) * 1000) / 10
              : null,
        },
      };
    }),
    series: [{ id: "occupancy", label: "Occupancy, %", color: ACCENT_TOKEN }],
    money: false,
  };
}

/**
 * Where the money went, by head and month: the heads in order of their
 * total, eight at most — the rest fold into "Other" (DESIGN.md's ceiling).
 */
export function expenseStackModel(
  lines: { month: string; head: string; amount: number }[],
  months: BirdwingMonth[],
): CartesianModel {
  const totals = new Map<string, number>();
  for (const line of lines) totals.set(line.head, (totals.get(line.head) ?? 0) + line.amount);
  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([head]) => head);
  const kept = ranked.length > 8 ? ranked.slice(0, 7) : ranked;
  const folded = ranked.length > 8;
  const keyOf = (head: string) => (kept.includes(head) ? head : "Other");

  const byMonth = new Map<string, Record<string, number>>();
  for (const line of lines) {
    const values = byMonth.get(line.month) ?? {};
    const key = keyOf(line.head);
    values[key] = round2((values[key] ?? 0) + line.amount);
    byMonth.set(line.month, values);
  }
  const ids = folded ? [...kept, "Other"] : kept;
  return {
    kind: "cartesian",
    type: "stacked",
    categoryLabel: "Month",
    points: months.map((row) => {
      const values = byMonth.get(row.month) ?? {};
      return {
        category: shortMonth(row.month),
        values: Object.fromEntries(ids.map((id) => [id, values[id] ?? 0])),
      };
    }),
    series: ids.map((id, index) => ({ id, label: id, color: chartToken(index + 1) })),
    money: true,
  };
}
