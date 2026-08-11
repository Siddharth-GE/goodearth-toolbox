/**
 * The dues arithmetic. Money owed and how late it is — the numbers the
 * founder currently keeps by hand, so the edges matter more than usual.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  allocateReceipts,
  combineSummaries,
  summariseDues,
  type MilestoneInput,
  type ReceiptInput,
} from "./dues";

const TODAY = "2026-08-11";

const schedule = (over: Partial<MilestoneInput>[] = []): MilestoneInput[] =>
  [
    {
      id: "m1",
      stage: "plot",
      sortOrder: 10,
      dueAmount: 1000,
      dueOn: "2026-01-01",
      invoicedOn: "2026-01-01",
    },
    {
      id: "m2",
      stage: "booking",
      sortOrder: 20,
      dueAmount: 2000,
      dueOn: "2026-12-01",
      invoicedOn: null,
    },
    {
      id: "m3",
      stage: "foundation",
      sortOrder: 30,
      dueAmount: null,
      dueOn: null,
      invoicedOn: null,
    },
  ].map((row, i) => ({ ...row, ...(over[i] ?? {}) })) as MilestoneInput[];

const receipt = (over: Partial<ReceiptInput>): ReceiptInput => ({
  id: "r",
  milestoneId: null,
  amount: 0,
  receivedOn: "2026-06-01",
  ...over,
});

test("an empty schedule owes nothing and is not overdue", () => {
  const summary = summariseDues([], [], TODAY);
  assert.equal(summary.scheduled, 0);
  assert.equal(summary.outstanding, 0);
  assert.equal(summary.overdue, 0);
  assert.equal(summary.overdueCount, 0);
  assert.equal(summary.nextDueOn, null);
});

test("a directly allocated receipt settles its own milestone only", () => {
  const rows = allocateReceipts(
    schedule(),
    [receipt({ id: "r1", milestoneId: "m1", amount: 1000 })],
    TODAY,
  );
  assert.equal(rows[0].received, 1000);
  assert.equal(rows[0].outstanding, 0);
  assert.equal(rows[0].isSettled, true);
  assert.equal(rows[1].received, 0);
  assert.equal(rows[1].outstanding, 2000);
});

test("an unallocated receipt spills across milestones, oldest rung first", () => {
  const rows = allocateReceipts(schedule(), [receipt({ id: "r1", amount: 1500 })], TODAY);
  assert.equal(rows[0].received, 1000, "fills the first rung");
  assert.equal(rows[0].isSettled, true);
  assert.equal(rows[1].received, 500, "spills the remainder into the second");
  assert.equal(rows[1].outstanding, 1500);
});

test("a milestone with no amount set absorbs nothing and never settles", () => {
  const rows = allocateReceipts(schedule(), [receipt({ id: "r1", amount: 99_999 })], TODAY);
  const foundation = rows[2];
  assert.equal(foundation.dueAmount, null);
  assert.equal(foundation.received, 0);
  assert.equal(foundation.outstanding, 0);
  assert.equal(foundation.isSettled, false, "unset is not paid");
  assert.equal(foundation.isOverdue, false);
});

test("a past due date with money outstanding is overdue; a future one is not", () => {
  const rows = allocateReceipts(schedule(), [], TODAY);
  assert.equal(rows[0].isOverdue, true, "due 2026-01-01, unpaid");
  assert.equal(rows[1].isOverdue, false, "due 2026-12-01, not yet");
});

test("a milestone due exactly today is not yet late", () => {
  const rows = allocateReceipts(schedule([{ dueOn: TODAY }]), [], TODAY);
  assert.equal(rows[0].isOverdue, false);
});

test("a milestone with no due date is never overdue, however much is owed", () => {
  const rows = allocateReceipts(schedule([{ dueOn: null }]), [], TODAY);
  assert.equal(rows[0].outstanding, 1000);
  assert.equal(rows[0].isOverdue, false);
});

test("paying an overdue milestone clears the overdue, not just the balance", () => {
  const summary = summariseDues(
    schedule(),
    [receipt({ id: "r1", milestoneId: "m1", amount: 1000 })],
    TODAY,
  );
  assert.equal(summary.overdue, 0);
  assert.equal(summary.overdueCount, 0);
});

test("a part payment leaves the remainder overdue, not the whole rung", () => {
  const summary = summariseDues(
    schedule(),
    [receipt({ id: "r1", milestoneId: "m1", amount: 400 })],
    TODAY,
  );
  assert.equal(summary.overdue, 600);
  assert.equal(summary.overdueCount, 1);
});

test("invoiced counts only the rungs someone has actually billed", () => {
  const summary = summariseDues(schedule(), [], TODAY);
  assert.equal(summary.scheduled, 3000);
  assert.equal(summary.invoiced, 1000, "only the plot rung is invoiced");
});

test("overpayment floors outstanding at zero and is reported separately", () => {
  const summary = summariseDues(schedule(), [receipt({ id: "r1", amount: 5000 })], TODAY);
  assert.equal(summary.received, 5000);
  assert.equal(summary.outstanding, 0, "never negative");
  assert.equal(summary.overpaid, 2000);
});

test("received counts every receipt, including ones not yet filed against a rung", () => {
  const summary = summariseDues(
    schedule(),
    [receipt({ id: "r1", milestoneId: "m1", amount: 1000 }), receipt({ id: "r2", amount: 250 })],
    TODAY,
  );
  assert.equal(summary.received, 1250);
  assert.equal(summary.outstanding, 1750);
});

test("nextDueOn is the soonest unsettled rung, skipping ones already paid", () => {
  const summary = summariseDues(
    schedule(),
    [receipt({ id: "r1", milestoneId: "m1", amount: 1000 })],
    TODAY,
  );
  assert.equal(summary.nextDueOn, "2026-12-01");
  assert.equal(summary.nextDueAmount, 2000);
});

test("rows come back in schedule order however they were handed in", () => {
  const shuffled = [...schedule()].reverse();
  const rows = allocateReceipts(shuffled, [], TODAY);
  assert.deepEqual(
    rows.map((r) => r.stage),
    ["plot", "booking", "foundation"],
  );
});

// -------------------------------------------------------------------
// Rolling several plots together
// -------------------------------------------------------------------

test("combining summaries adds the money and keeps the soonest due date", () => {
  const villa17 = summariseDues(schedule(), [], TODAY);
  const villa39 = summariseDues(
    schedule([{ id: "x1", dueAmount: 500, dueOn: "2026-09-01" }, { dueOn: null }]),
    [],
    TODAY,
  );

  const total = combineSummaries([villa17, villa39]);
  assert.equal(total.scheduled, villa17.scheduled + villa39.scheduled);
  assert.equal(total.received, villa17.received + villa39.received);
  assert.equal(total.overdue, villa17.overdue + villa39.overdue);
  assert.equal(total.overdueCount, villa17.overdueCount + villa39.overdueCount);
  // Villa 17's plot rung fell due in January; villa 39's earliest is
  // September. The soonest across both wins, not the first in the list.
  assert.equal(villa39.nextDueOn, "2026-09-01");
  assert.equal(total.nextDueOn, "2026-01-01");
});

test("combining an empty set is all zeroes rather than a crash", () => {
  const total = combineSummaries([]);
  assert.equal(total.scheduled, 0);
  assert.equal(total.outstanding, 0);
  assert.equal(total.nextDueOn, null);
});

/**
 * The bug this pins: rolling up by MERGING two plots' milestones and
 * receipts lets an unallocated receipt on one villa settle the other
 * villa's instalment. Each plot is its own ledger; only the answers add.
 */
test("one villa's unallocated payment never settles another villa's instalment", () => {
  // Villa 17 owes on a rung that is not due yet.
  const villa17: MilestoneInput[] = [
    {
      id: "a1",
      stage: "booking",
      sortOrder: 20,
      dueAmount: 1000,
      dueOn: "2026-12-01",
      invoicedOn: null,
    },
  ];
  // Villa 39 owes on a rung that is already late.
  const villa39: MilestoneInput[] = [
    {
      id: "b1",
      stage: "plot",
      sortOrder: 10,
      dueAmount: 1000,
      dueOn: "2026-01-01",
      invoicedOn: null,
    },
  ];
  // The money arrived against VILLA 17, and nobody has filed it yet.
  const paid = [receipt({ id: "r1", amount: 1000 })];

  const correct = combineSummaries([
    summariseDues(villa17, paid, TODAY),
    summariseDues(villa39, [], TODAY),
  ]);
  assert.equal(correct.overdue, 1000, "villa 39 is still late — that money was not theirs");
  assert.equal(correct.overdueCount, 1);

  // Merging the inputs sorts villa 39's older rung to the front, so villa
  // 17's payment settles it and the late plot vanishes off the dues board.
  const wrong = summariseDues([...villa17, ...villa39], paid, TODAY);
  assert.equal(wrong.overdue, 0, "the bug: villa 39 looks paid");
  assert.notEqual(wrong.overdue, correct.overdue, "which is exactly why merging is refused");
});

test("a rounding-sized shortfall counts as settled, not as a due of half a paisa", () => {
  const rows = allocateReceipts(
    schedule(),
    [receipt({ id: "r1", milestoneId: "m1", amount: 999.999 })],
    TODAY,
  );
  assert.equal(rows[0].isSettled, true);
  assert.equal(rows[0].isOverdue, false);
});
