import assert from "node:assert/strict";
import { test } from "node:test";

import { clientRate, isFullyPriced, lineAmount, lineCost, rollUp } from "./math";

test("client rate adds the margin to the cost", () => {
  assert.equal(clientRate(100, 25), 125);
  assert.equal(clientRate(2400, 12.5), 2700);
});

test("a zero margin charges exactly cost", () => {
  // Some lines pass through at cost: the quote shows the cost, not nothing.
  assert.equal(clientRate(1000, 0), 1000);
});

test("a missing cost stays missing rather than becoming zero", () => {
  // Guards against an unpriced line reading as free on a client quote.
  assert.equal(clientRate(null, 20), null);
  assert.equal(clientRate(100, null), null);
  assert.equal(lineCost({ quantity: 5, unit_cost: null, margin_pct: 20 }), null);
  assert.equal(lineAmount({ quantity: 5, unit_cost: null, margin_pct: 20 }), null);
});

test("line amount uses the budget quantity, not the designer's", () => {
  // The budget quantity is what is charged; there is no designer quantity in this module, by design.
  const line = { quantity: 12, unit_cost: 500, margin_pct: 10 };
  assert.equal(lineAmount(line), 12 * 550);
});

test("roll-ups skip unpriced lines instead of counting them as free", () => {
  const totals = rollUp([
    { quantity: 2, unit_cost: 100, margin_pct: 10 },
    { quantity: 1, unit_cost: null, margin_pct: 10 },
    { quantity: 3, unit_cost: 200, margin_pct: 0 },
  ]);

  assert.equal(totals.cost, 2 * 100 + 3 * 200);
  assert.equal(totals.client, 2 * 110 + 3 * 200);
  assert.equal(totals.lineCount, 3);
  assert.equal(totals.pricedCount, 2);
  assert.equal(totals.pendingCount, 1);
});

test("a cost without a margin stays pending, in both totals or neither", () => {
  // Only reachable while a line is being typed: migration 0017 forbids saving a cost without a margin.
  const totals = rollUp([
    { quantity: 2, unit_cost: 100, margin_pct: 10 },
    { quantity: 5, unit_cost: 300, margin_pct: null },
  ]);

  assert.equal(totals.cost, 2 * 100);
  // Same path as rollUp: full precision, so float epsilon is part of the expected value.
  assert.equal(totals.client, 2 * clientRate(100, 10)!);
  assert.equal(totals.pricedCount, 1);
  assert.equal(totals.pendingCount, 1);
});

test("an empty budget has no margin percentage rather than zero", () => {
  const totals = rollUp([]);
  assert.equal(totals.cost, 0);
  assert.equal(totals.marginPct, null);
});

test("totals sum unrounded values so the total matches its lines", () => {
  // Rounding per line then summing gives 300; the correct answer is 301.
  const lines = [
    { quantity: 1, unit_cost: 100.4, margin_pct: 0 },
    { quantity: 1, unit_cost: 100.4, margin_pct: 0 },
    { quantity: 1, unit_cost: 100.4, margin_pct: 0 },
  ];
  const totals = rollUp(lines);
  assert.equal(Math.round(totals.cost), 301);
});

test("a budget is fully priced only when every line has a cost", () => {
  assert.equal(isFullyPriced([{ quantity: 1, unit_cost: 10, margin_pct: 0 }]), true);
  assert.equal(
    isFullyPriced([
      { quantity: 1, unit_cost: 10, margin_pct: 0 },
      { quantity: 1, unit_cost: null, margin_pct: 0 },
    ]),
    false,
  );
  // A budget with no lines is not fully priced: nothing to approve.
  assert.equal(isFullyPriced([]), false);
});

test("a free line counts as priced", () => {
  // Zero is a real price. Only null means unpriced.
  assert.equal(isFullyPriced([{ quantity: 1, unit_cost: 0, margin_pct: 50 }]), true);
  assert.equal(rollUp([{ quantity: 4, unit_cost: 0, margin_pct: 50 }]).pendingCount, 0);
});
