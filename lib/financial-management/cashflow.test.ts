/**
 * The monthly bucketing behind the Cash and Forward screens. The rules
 * that matter: an empty month is a real zero bar, an undated amount is
 * never invented into a month, and the buckets always reconcile with
 * the plain sum.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  bucketMonthly,
  buildInOutModel,
  buildOutflowStackModel,
  forwardCollections,
  fundingGap,
  lastMonths,
  monthLabel,
  nextMonths,
  sumAmounts,
  type DatedAmount,
  type ForwardMilestone,
} from "./cashflow";

const TODAY = "2026-08-13";

test("lastMonths ends at the current month and walks the year boundary", () => {
  const months = lastMonths(TODAY, 12);
  assert.equal(months.length, 12);
  assert.equal(months[0], "2025-09");
  assert.equal(months[11], "2026-08");
});

test("nextMonths starts at the current month", () => {
  const months = nextMonths(TODAY, 3);
  assert.deepEqual(months, ["2026-08", "2026-09", "2026-10"]);
});

test("undated amounts count in the total but never land in a month", () => {
  const entries: DatedAmount[] = [
    { amount: 1000, on: "2026-08-01" },
    { amount: 500, on: null },
  ];
  const { byMonth, undated } = bucketMonthly(entries);
  assert.equal(byMonth.get("2026-08"), 1000);
  assert.equal(undated, 500);
  assert.equal(sumAmounts(entries), 1500);
});

test("a timestamp buckets by its date part", () => {
  const { byMonth } = bucketMonthly([{ amount: 700, on: "2026-03-31T18:45:00.000Z" }]);
  assert.equal(byMonth.get("2026-03"), 700);
});

test("an empty month inside the window is a zero bar, not a gap", () => {
  const model = buildInOutModel({
    inflows: [{ amount: 1000, on: "2026-06-10" }],
    outflows: [],
    months: ["2026-06", "2026-07", "2026-08"],
  });
  assert.equal(model.points.length, 3);
  assert.deepEqual(model.points[1].values, { in: 0, out: 0 });
  assert.equal(model.points[0].values.in, 1000);
});

test("in and out stay separate series — never summed", () => {
  const model = buildInOutModel({
    inflows: [{ amount: 1000, on: "2026-08-01" }],
    outflows: [{ amount: 400, on: "2026-08-05" }],
    months: ["2026-08"],
  });
  assert.deepEqual(model.points[0].values, { in: 1000, out: 400 });
  assert.equal(model.series.length, 2);
  assert.equal(model.type, "bar");
});

test("the buckets reconcile with the plain sum inside the window", () => {
  const entries: DatedAmount[] = [
    { amount: 100, on: "2026-07-01" },
    { amount: 250, on: "2026-07-30" },
    { amount: 75, on: "2026-08-02" },
  ];
  const model = buildInOutModel({
    inflows: entries,
    outflows: [],
    months: ["2026-07", "2026-08"],
  });
  const charted = model.points.reduce((sum, point) => sum + (point.values.in ?? 0), 0);
  assert.equal(charted, sumAmounts(entries));
});

test("the outflow stack keeps streams in hand-in order with stable colours", () => {
  const model = buildOutflowStackModel({
    streams: [
      { id: "bills", label: "Bills paid", entries: [{ amount: 900, on: "2026-08-01" }] },
      { id: "repayments", label: "Repayments", entries: [] },
      { id: "interest", label: "Interest", entries: [{ amount: 100, on: "2026-08-20" }] },
    ],
    months: ["2026-08"],
  });
  assert.equal(model.type, "stacked");
  assert.deepEqual(
    model.series.map((series) => series.id),
    ["bills", "repayments", "interest"],
  );
  assert.deepEqual(model.points[0].values, { bills: 900, repayments: 0, interest: 100 });
});

test("month labels always carry the year", () => {
  assert.equal(monthLabel("2026-01"), "Jan 2026");
  assert.equal(monthLabel("2025-12"), "Dec 2025");
});

const rung = (over: Partial<ForwardMilestone>): ForwardMilestone => ({
  engagementId: "e1",
  sortOrder: 10,
  dueAmount: 1000,
  dueOn: "2026-09-01",
  receivedAmount: 0,
  ...over,
});

test("forward collections split into months, overdue and unscheduled", () => {
  const result = forwardCollections(
    [
      rung({ sortOrder: 10, dueOn: "2026-05-01" }),
      rung({ sortOrder: 20, dueOn: "2026-09-15", dueAmount: 2000 }),
      rung({ sortOrder: 30, dueOn: null, dueAmount: 500 }),
      rung({ sortOrder: 40, dueAmount: null, dueOn: null }),
    ],
    new Map(),
    TODAY,
  );
  assert.equal(result.overdue, 1000);
  assert.equal(result.byMonth.get("2026-09"), 2000);
  assert.equal(result.unscheduled, 500);
  assert.equal(result.toCome, 3500);
});

test("an unallocated receipt settles the oldest unpaid rung of its own engagement", () => {
  const result = forwardCollections(
    [
      rung({ sortOrder: 10, dueOn: "2026-05-01" }),
      rung({ sortOrder: 20, dueOn: "2026-09-15" }),
      rung({ engagementId: "e2", sortOrder: 10, dueOn: "2026-05-01" }),
    ],
    new Map([["e1", 1200]]),
    TODAY,
  );
  // e1's pool clears its overdue rung and takes 200 off September;
  // e2's identical overdue rung is untouched — its own ledger.
  assert.equal(result.overdue, 1000);
  assert.equal(result.byMonth.get("2026-09"), 800);
});

test("a settled rung and a rung due later today's month both land where they should", () => {
  const result = forwardCollections(
    [
      rung({ sortOrder: 10, dueOn: "2026-08-20" }),
      rung({ sortOrder: 20, dueOn: "2026-08-01", receivedAmount: 1000 }),
    ],
    new Map(),
    TODAY,
  );
  // Due later this month is coming, not overdue; the fully-received rung
  // vanishes from every figure.
  assert.equal(result.byMonth.get("2026-08"), 1000);
  assert.equal(result.overdue, 0);
  assert.equal(result.toCome, 1000);
});

test("the funding gap subtracts what is coming and what is undrawn", () => {
  const gap = fundingGap({
    remainingSpend: 10_000,
    collectionsToCome: 6000,
    undrawnSanctioned: 3000,
  });
  assert.equal(gap, 1000);
  assert.ok(
    fundingGap({ remainingSpend: 5000, collectionsToCome: 6000, undrawnSanctioned: 0 }) < 0,
  );
});
