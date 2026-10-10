import assert from "node:assert/strict";
import { test } from "node:test";

import { pendingOnBill, rollUpBill } from "./math";

test("2 cum at ₹4,000 is ₹8,000 — the team's example", () => {
  assert.equal(rollUpBill([{ quantity: 2, rate: 4000, gst_pct: 0 }]).total, 8000);
});

test("an NMR bill: heads × day rate per trade", () => {
  const totals = rollUpBill([
    { quantity: 12, rate: 950, gst_pct: 0 }, // mason-days
    { quantity: 18, rate: 750, gst_pct: 0 }, // helper-days
  ]);
  assert.equal(totals.total, 12 * 950 + 18 * 750);
});

test("rounded to the paisa as the database stores it", () => {
  const totals = rollUpBill([{ quantity: 3, rate: 33.333, gst_pct: 18 }]);
  assert.equal(totals.taxable, 100);
  assert.equal(totals.gst, 18);
  assert.equal(totals.total, 118);
});

test("a line without a rate is counted, not added as zero", () => {
  const totals = rollUpBill([
    { quantity: 1, rate: 500, gst_pct: 0 },
    { quantity: 1, rate: null, gst_pct: 0 },
  ]);
  assert.equal(totals.total, 500);
  assert.equal(totals.unpricedCount, 1);
});

test("pending: ₹1.5 lakh billed, ₹1 lakh paid leaves ₹50,000 — the team's example", () => {
  assert.equal(pendingOnBill(150000, 100000, 0), 50000);
  assert.equal(pendingOnBill(150000, 100000, 50000), 0);
  assert.equal(pendingOnBill(150000, 160000, 0), 0, "never negative");
});
