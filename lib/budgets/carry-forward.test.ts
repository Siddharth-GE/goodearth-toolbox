/**
 * Carry-forward rules.
 *
 * These are the cases that decide whether the budget team opens R3 and
 * sees two lines waiting or two hundred — which is the difference between
 * a tool people use and a tool people abandon.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { planCarryForward, type PreviousBudgetLine } from "./carry-forward";

const priced = (line_key: string, overrides: Partial<PreviousBudgetLine> = {}): PreviousBudgetLine => ({
  line_key,
  quantity: 10,
  expected_vendor_id: "vendor-1",
  unit_cost: 500,
  margin_pct: 20,
  notes: null,
  ...overrides,
});

test("an unchanged line keeps the budget team's quantity, not the designer's", () => {
  // The designer said 10; the team measured 12 and priced against that.
  // The design hasn't moved, so 12 is still the right number.
  const plan = planCarryForward({
    previousBudgetLines: [priced("a", { quantity: 12 })],
    previousSelectionLines: [{ line_key: "a", quantity: 10 }],
    currentSelectionLines: [{ line_key: "a", quantity: 10 }],
  });

  assert.equal(plan.lines.length, 1);
  assert.equal(plan.lines[0].quantity, 12);
  assert.equal(plan.lines[0].unit_cost, 500);
  assert.equal(plan.lines[0].needs_review, false);
  assert.equal(plan.carried, 1);
  assert.equal(plan.needsReview, 0);
});

test("a designer's quantity change wins over the team's old measurement", () => {
  // The room got bigger. The team's 12 running feet is now stale, so the
  // designer's new figure is taken and the line is flagged — but the cost
  // per unit is still good, so it isn't sent back to zero.
  const plan = planCarryForward({
    previousBudgetLines: [priced("a", { quantity: 12 })],
    previousSelectionLines: [{ line_key: "a", quantity: 10 }],
    currentSelectionLines: [{ line_key: "a", quantity: 18 }],
  });

  assert.equal(plan.lines[0].quantity, 18);
  assert.equal(plan.lines[0].unit_cost, 500);
  assert.equal(plan.lines[0].needs_review, true);
  assert.equal(plan.needsReview, 1);
  assert.equal(plan.carried, 0);
});

test("a new line carries nothing forward", () => {
  const plan = planCarryForward({
    previousBudgetLines: [priced("a")],
    previousSelectionLines: [{ line_key: "a", quantity: 10 }],
    currentSelectionLines: [
      { line_key: "a", quantity: 10 },
      { line_key: "b", quantity: 4 },
    ],
  });

  // No row for "b": the pricing screen shows it anyway, from the
  // revision's own lines, with the product's default margin.
  assert.deepEqual(
    plan.lines.map((line) => line.line_key),
    ["a"],
  );
  assert.equal(plan.fresh, 1);
});

test("a removed line does not appear in the new budget", () => {
  const plan = planCarryForward({
    previousBudgetLines: [priced("a"), priced("gone")],
    previousSelectionLines: [
      { line_key: "a", quantity: 10 },
      { line_key: "gone", quantity: 2 },
    ],
    currentSelectionLines: [{ line_key: "a", quantity: 10 }],
  });

  assert.equal(plan.lines.length, 1);
  assert.equal(plan.lines[0].line_key, "a");
});

test("a line that was never priced still counts as work remaining", () => {
  // Its vendor and margin come forward as a convenience, but with no cost
  // it must not be reported as if it were settled.
  const plan = planCarryForward({
    previousBudgetLines: [priced("a", { unit_cost: null })],
    previousSelectionLines: [{ line_key: "a", quantity: 10 }],
    currentSelectionLines: [{ line_key: "a", quantity: 10 }],
  });

  assert.equal(plan.lines[0].margin_pct, 20);
  assert.equal(plan.lines[0].unit_cost, null);
  assert.equal(plan.carried, 0);
  assert.equal(plan.fresh, 1);
});

test("the realistic case: 200 lines, two of them touched", () => {
  // The whole reason line_key exists. If this ever regresses, the budget
  // team is being asked to re-price an entire villa because a designer
  // changed one light fitting.
  const previousSelectionLines = Array.from({ length: 200 }, (_, index) => ({
    line_key: `line-${index}`,
    quantity: 5,
  }));
  const previousBudgetLines = previousSelectionLines.map((line) => priced(line.line_key, { quantity: 5 }));

  const currentSelectionLines = [
    ...previousSelectionLines.slice(0, 199),
    // One quantity changed, and one brand-new item.
    { line_key: "line-199", quantity: 9 },
    { line_key: "brand-new", quantity: 1 },
  ];

  const plan = planCarryForward({ previousBudgetLines, previousSelectionLines, currentSelectionLines });

  assert.equal(plan.carried, 199);
  assert.equal(plan.needsReview, 1);
  assert.equal(plan.fresh, 1);
});

test("the first budget for a unit carries nothing", () => {
  const plan = planCarryForward({
    previousBudgetLines: [],
    previousSelectionLines: [],
    currentSelectionLines: [{ line_key: "a", quantity: 3 }],
  });

  assert.deepEqual(plan.lines, []);
  assert.equal(plan.fresh, 1);
  assert.equal(plan.carried, 0);
});
