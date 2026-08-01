/**
 * The first tests in this repo.
 *
 * CLAUDE.md is explicit that no test framework was a conscious tradeoff
 * until a tool arrived with real calculation logic worth testing. Budgets
 * is that tool, so this uses node:test through tsx — already a dependency
 * — rather than adding Jest or Vitest for one file. `npm test`.
 *
 * Scope is deliberately narrow: lib/budgets/math.ts only. Pure functions,
 * no database, no mocks. The cases below are the ones where being wrong
 * costs real money.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { clientRate, isFullyPriced, lineAmount, lineCost, rollUp } from "./math";

test("client rate adds the margin to the cost", () => {
  assert.equal(clientRate(100, 25), 125);
  assert.equal(clientRate(2400, 12.5), 2700);
});

test("a zero margin charges exactly cost", () => {
  // Not a rounding artefact and not an error state: some lines are passed
  // through at cost, and the quote must show the cost, not nothing.
  assert.equal(clientRate(1000, 0), 1000);
});

test("a missing cost stays missing rather than becoming zero", () => {
  // The failure this guards against: an unpriced line quietly reading as
  // free on a client quote.
  assert.equal(clientRate(null, 20), null);
  assert.equal(clientRate(100, null), null);
  assert.equal(lineCost({ quantity: 5, unit_cost: null, margin_pct: 20 }), null);
  assert.equal(lineAmount({ quantity: 5, unit_cost: null, margin_pct: 20 }), null);
});

test("line amount uses the budget quantity, not the designer's", () => {
  // The budget team's measured quantity is what gets charged for. There is
  // no designer quantity in this module at all, by design — if one ever
  // appears here, that is the bug.
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
  // The number that stops someone approving a budget that isn't finished.
  assert.equal(totals.pendingCount, 1);
});

test("an empty budget has no margin percentage rather than zero", () => {
  const totals = rollUp([]);
  assert.equal(totals.cost, 0);
  assert.equal(totals.marginPct, null);
});

test("totals sum unrounded values so the total matches its lines", () => {
  // Three lines that each round down individually. Rounding per line and
  // then summing gives 300; the correct answer is 301.
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
  // A budget with no lines is not "fully priced" — there is nothing to
  // approve, and letting it through would produce an empty quote.
  assert.equal(isFullyPriced([]), false);
});

test("a free line counts as priced", () => {
  // Zero is a real price. Only null means unpriced.
  assert.equal(isFullyPriced([{ quantity: 1, unit_cost: 0, margin_pct: 50 }]), true);
  assert.equal(rollUp([{ quantity: 4, unit_cost: 0, margin_pct: 50 }]).pendingCount, 0);
});

// Formatting moved to lib/format.ts and is tested in lib/format.test.ts,
// alongside the other ways the same figure gets written.
