// chargeAmount must agree with the generated column in 0115.
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  chargeAmount,
  gstBreakdown,
  isSettled,
  nightsBetween,
  stayMoney,
  taxableOf,
} from "./money";

test("the rate card's rates are before GST: ₹3,800 a night + 5% is ₹3,990", () => {
  assert.equal(chargeAmount({ qty: 1, rate: 3800, gstPct: 5, rateIncludesGst: false }), 3990);
  assert.equal(chargeAmount({ qty: 2, rate: 3800, gstPct: 5, rateIncludesGst: false }), 7980);
  assert.equal(chargeAmount({ qty: 2, rate: 500, gstPct: 5, rateIncludesGst: false }), 1050);
});

test("an OTA's figure, entered GST-inclusive, stays as typed", () => {
  assert.equal(chargeAmount({ qty: 1, rate: 3496, gstPct: 5, rateIncludesGst: true }), 3496);
  assert.equal(taxableOf(3496, 5), 3329.52);
});

test("paise survive: no early rounding to rupees", () => {
  assert.equal(chargeAmount({ qty: 3, rate: 333.33, gstPct: 18, rateIncludesGst: false }), 1179.99);
  assert.equal(chargeAmount({ qty: 1, rate: 199.99, gstPct: 5, rateIncludesGst: false }), 209.99);
});

test("billed, collected, settled and pending", () => {
  const money = stayMoney({
    chargeAmounts: [7980, 1050],
    otaCommission: 500,
    discount: 30,
    receipts: [5000, 2000],
    settlements: [],
  });
  assert.deepEqual(money, {
    charged: 9030,
    billed: 8500,
    collected: 7000,
    settled: 0,
    pending: 1500,
  });
});

test("an internal stay closed by a cross-charge is settled", () => {
  const money = stayMoney({
    chargeAmounts: [10605],
    otaCommission: 0,
    discount: 0,
    receipts: [],
    settlements: [10605],
  });
  assert.equal(money.pending, 0);
  assert.equal(isSettled(money.pending), true);
});

test("half-rupee roundings from the sheet count as settled; a rupee does not", () => {
  assert.equal(isSettled(0.5), true);
  assert.equal(isSettled(-0.5), true);
  assert.equal(isSettled(1), false);
});

test("the tax summary: per rate, halves that add up to the GST", () => {
  const rows = gstBreakdown([
    { amount: 3990, gstPct: 5 },
    { amount: 1050, gstPct: 5 },
    { amount: 2124, gstPct: 18 },
    { amount: 0.03, gstPct: 5 },
  ]);
  assert.equal(rows.length, 2);
  const [five, eighteen] = rows;
  assert.equal(five.gstPct, 5);
  assert.equal(five.amount, 5040.03);
  assert.equal(Math.round((five.taxable + five.cgst + five.sgst) * 100), 504003);
  assert.equal(eighteen.taxable, 1800);
  assert.equal(eighteen.cgst, 162);
  assert.equal(eighteen.sgst, 162);
});

test("nights: a day visit is none, and a month boundary counts right", () => {
  assert.equal(nightsBetween("2026-11-06", "2026-11-06"), 0);
  assert.equal(nightsBetween("2026-11-06", "2026-11-08"), 2);
  assert.equal(nightsBetween("2026-10-31", "2026-11-02"), 2);
});
