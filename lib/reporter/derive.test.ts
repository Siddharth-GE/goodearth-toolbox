import assert from "node:assert/strict";
import { test } from "node:test";

import { DERIVED, lineValue } from "./derive";

test("line value is quantity × rate × (1 + gst/100) at full precision", () => {
  // 3 × 1234.56 × 1.18 — no rounding until display (lib/format.ts).
  assert.equal(lineValue(3, 1234.56, 18), 3 * 1234.56 * 1.18);
  assert.equal(lineValue(2, 100, 0), 200);
});

test("a null rate propagates null, never 0", () => {
  assert.equal(lineValue(3, null, 18), null);
  assert.equal(lineValue(null, 100, 18), null);
  assert.equal(lineValue(3, undefined, 18), null);
  assert.equal(lineValue(3, Number.NaN, 18), null);
});

test("a null GST means 0% — GST-free is real; unpriced is not free", () => {
  assert.equal(lineValue(3, 100, null), 300);
  assert.equal(lineValue(3, 100, undefined), 300);
});

test("a free line is 0, which is different from unpriced", () => {
  assert.equal(lineValue(3, 0, 18), 0);
});

test("a PO line's value carries its GST; a budget line's does not", () => {
  const row = { quantity: 2, rate: 100, gst_pct: 18, unit_cost: 100, client_rate: 130 };
  assert.equal(DERIVED.po_line_value(row), 2 * 100 * 1.18);
  assert.equal(DERIVED.budget_cost_value(row), 200);
  assert.equal(DERIVED.budget_client_value(row), 260);
});

test("margin value is client minus cost, and unknown when either side is", () => {
  assert.equal(DERIVED.budget_margin_value({ quantity: 2, unit_cost: 100, client_rate: 130 }), 60);
  // An unpriced cost does not make the whole client value "margin".
  assert.equal(DERIVED.budget_margin_value({ quantity: 2, unit_cost: null, client_rate: 130 }), null); // prettier-ignore
  assert.equal(DERIVED.budget_margin_value({ quantity: 2, unit_cost: 100, client_rate: null }), null); // prettier-ignore
  // Selling at cost is a real margin of zero, not a missing one.
  assert.equal(DERIVED.budget_margin_value({ quantity: 2, unit_cost: 100, client_rate: 100 }), 0);
});

test("balance due is due minus received, and unknown when the due is", () => {
  assert.equal(DERIVED.crm_balance_due({ due_amount: 500000, received_amount: 200000 }), 300000);
  // A rung nobody has paid still owes the full due.
  assert.equal(DERIVED.crm_balance_due({ due_amount: 500000, received_amount: 0 }), 500000);
  // No due amount set: the balance is unknown, not "all collected".
  assert.equal(DERIVED.crm_balance_due({ due_amount: null, received_amount: 200000 }), null);
  // Overpayment shows negative — an honest credit, not clamped away.
  assert.equal(DERIVED.crm_balance_due({ due_amount: 100, received_amount: 150 }), -50);
});

test("derived functions ignore junk in the row rather than crashing", () => {
  assert.equal(DERIVED.po_line_value({ quantity: "3", rate: {}, gst_pct: [] }), null);
  assert.equal(DERIVED.po_line_value({}), null);
});
