/**
 * The line formula Purchase Orders and Bills share. What it protects:
 * "2 cum at ₹4,000 shows ₹8,000" (the team's own example), a discount
 * taken before tax, freight added after it, and the CGST/SGST vs IGST
 * split following the vendor's state.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { gstRegime, lineMoney, splitGst } from "./line-money";

test("quantity × rate, the team's example", () => {
  const money = lineMoney({ quantity: 2, rate: 4000, gst_pct: 0 });
  assert.equal(money?.total, 8000);
});

test("a discount comes off before GST; other charges come after it", () => {
  const money = lineMoney({
    quantity: 50,
    rate: 400,
    gst_pct: 18,
    discount_pct: 10,
    other_charges: 500,
  });
  assert.deepEqual(money, {
    gross: 20000,
    discount: 2000,
    taxable: 18000,
    gst: 3240,
    other: 500,
    total: 21740,
  });
});

test("a rupee discount works the same way", () => {
  const money = lineMoney({ quantity: 10, rate: 100, gst_pct: 5, discount_amount: 50 });
  assert.equal(money?.taxable, 950);
  assert.equal(money?.total, 997.5);
});

test("a lump sum has no quantity: the rate is the amount", () => {
  assert.equal(lineMoney({ quantity: null, rate: 15000, gst_pct: 0 })?.total, 15000);
});

test("null is not zero — no rate or no GST % means no amount", () => {
  assert.equal(lineMoney({ quantity: 5, rate: null, gst_pct: 18 }), null);
  assert.equal(lineMoney({ quantity: 5, rate: 10, gst_pct: null }), null);
  assert.equal(lineMoney({ quantity: 5, rate: 0, gst_pct: 0 })?.total, 0, "0 is a real price");
});

test("same state splits CGST + SGST; another state is IGST", () => {
  assert.deepEqual(gstRegime("Kerala", "Kerala"), { interState: false, assumed: false });
  assert.deepEqual(gstRegime(" kerala ", null), { interState: false, assumed: false });
  assert.deepEqual(gstRegime("Puducherry", "Kerala"), { interState: true, assumed: false });
  assert.deepEqual(gstRegime(null, "Kerala"), { interState: false, assumed: true });
  assert.deepEqual(splitGst(3240, false), { cgst: 1620, sgst: 1620, igst: 0 });
  assert.deepEqual(splitGst(3240, true), { cgst: 0, sgst: 0, igst: 3240 });
});
