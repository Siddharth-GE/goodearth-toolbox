/**
 * PO money math. The cases that matter: null-is-not-zero (an unpriced
 * line must stay OUT of every total, not enter one as free), the
 * both-or-neither rule for half-priced lines, GST grouped by slab for
 * the PDF's totals box, and full precision until display.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isFullyPriced,
  lineChargesProblem,
  lineFigures,
  lineGst,
  lineTaxable,
  lineTotal,
  rollUpPo,
  summaryRows,
} from "./math";

const priced = { quantity: 10, rate: 250, gst_pct: 18 };
const zeroGst = { quantity: 4, rate: 100, gst_pct: 0 };
const noRate = { quantity: 5, rate: null, gst_pct: 18 };
const noGst = { quantity: 5, rate: 100, gst_pct: null };

test("line amounts: taxable, gst, total", () => {
  assert.equal(lineTaxable(priced), 2500);
  assert.equal(lineGst(priced), 450);
  assert.equal(lineTotal(priced), 2950);
});

test("a 0% slab is a real price, not a missing one", () => {
  assert.equal(lineGst(zeroGst), 0);
  assert.equal(lineTotal(zeroGst), 400);
});

test("null is not zero — an unpriced line has no amount", () => {
  assert.equal(lineTaxable(noRate), null);
  assert.equal(lineGst(noRate), null);
  assert.equal(lineTotal(noRate), null);
  // A rate without a slab is still unpriced: half a price is no price.
  assert.equal(lineGst(noGst), null);
  assert.equal(lineTotal(noGst), null);
});

test("roll-up counts pending lines instead of adding nothing silently", () => {
  const totals = rollUpPo([priced, zeroGst, noRate, noGst]);
  assert.equal(totals.taxable, 2900);
  assert.equal(totals.gst, 450);
  assert.equal(totals.grand, 3350);
  assert.equal(totals.lineCount, 4);
  assert.equal(totals.pricedCount, 2);
  assert.equal(totals.pendingCount, 2);
});

test("gst grouped by slab for the totals box", () => {
  const totals = rollUpPo([priced, zeroGst, { quantity: 2, rate: 500, gst_pct: 18 }]);
  assert.equal(totals.gstBySlab.get(18), 450 + 180);
  assert.equal(totals.gstBySlab.get(0), 0);
  assert.equal(totals.gstBySlab.size, 2);
});

test("fully priced means every line has both rate and slab", () => {
  assert.equal(isFullyPriced([priced, zeroGst]), true);
  assert.equal(isFullyPriced([priced, noGst]), false);
  assert.equal(isFullyPriced([]), false);
});

test("a PO line's discount and freight reach the totals, and GST splits by state", () => {
  const lines = [
    { quantity: 50, rate: 400, gst_pct: 18, discount_pct: 10, other_charges: 500 },
    { quantity: 10, rate: 100, gst_pct: 5, discount_amount: 50 },
  ];
  const kerala = rollUpPo(lines, false);
  assert.equal(kerala.gross, 21000);
  assert.equal(kerala.discount, 2050);
  assert.equal(kerala.taxable, 18950);
  assert.equal(kerala.gst, 3240 + 47.5);
  assert.equal(kerala.cgst, (3240 + 47.5) / 2);
  assert.equal(kerala.igst, 0);
  assert.equal(kerala.other, 500);
  assert.equal(kerala.grand, 18950 + 3287.5 + 500);
  assert.equal(lineTotal(lines[0]), 21740);

  const outOfState = rollUpPo(lines, true);
  assert.equal(outOfState.igst, 3287.5);
  assert.equal(outOfState.cgst + outOfState.sgst, 0);
});

test("one line's figures carry its own GST split", () => {
  const line = { quantity: 50, rate: 400, gst_pct: 18, discount_pct: 10, other_charges: 500 };
  assert.deepEqual(lineFigures(line, false), {
    taxable: 18000,
    gst: 3240,
    cgst: 1620,
    sgst: 1620,
    igst: 0,
    other: 500,
    total: 21740,
  });
  assert.equal(lineFigures(line, true)?.igst, 3240);
  assert.equal(lineFigures(noRate, false), null);
});

test("the totals box: discount rows only when there is a discount, GST split per slab", () => {
  const plain = summaryRows(rollUpPo([priced, zeroGst]), false);
  assert.deepEqual(
    plain.map((row) => row.label),
    ["Subtotal", "CGST 9%", "SGST 9%", "GST total"],
  );
  assert.equal(plain[0].amount, 2900);
  assert.equal(plain[1].amount, 225);

  const lines = [
    { quantity: 50, rate: 400, gst_pct: 18, discount_pct: 10, other_charges: 500 },
    { quantity: 10, rate: 100, gst_pct: 5, discount_amount: 50 },
  ];
  const kerala = summaryRows(rollUpPo(lines, false), false);
  assert.deepEqual(
    kerala.map((row) => row.label),
    [
      "Subtotal",
      "Less discount",
      "Taxable value",
      "CGST 2.5%",
      "SGST 2.5%",
      "CGST 9%",
      "SGST 9%",
      "GST total",
      "Other charges",
    ],
  );
  assert.equal(kerala[1].amount, 2050);
  assert.equal(kerala[3].amount, 47.5 / 2);

  const outOfState = summaryRows(rollUpPo(lines, true), true);
  assert.deepEqual(
    outOfState.map((row) => row.label),
    [
      "Subtotal",
      "Less discount",
      "Taxable value",
      "IGST 5%",
      "IGST 18%",
      "GST total",
      "Other charges",
    ],
  );
  assert.equal(outOfState[4].amount, 3240);
});

test("a line's discount and charges are checked before the database refuses them", () => {
  const line = { quantity: 10, rate: 100, gst_pct: 18 };
  assert.equal(lineChargesProblem(line), undefined);
  assert.equal(lineChargesProblem({ ...line, discount_pct: 10, other_charges: 0 }), undefined);
  assert.match(
    lineChargesProblem({ ...line, discount_pct: 5, discount_amount: 5 }) ?? "",
    /not both/,
  );
  assert.match(lineChargesProblem({ ...line, discount_pct: 100 }) ?? "", /under 100%/);
  assert.match(lineChargesProblem({ ...line, discount_pct: -1 }) ?? "", /under 100%/);
  assert.match(lineChargesProblem({ ...line, discount_amount: -1 }) ?? "", /negative/);
  assert.match(lineChargesProblem({ ...line, discount_amount: 1001 }) ?? "", /more than the line/);
  assert.equal(lineChargesProblem({ ...line, discount_amount: 1000 }), undefined);
  // Without a rate the line has no worth yet, so any discount waits.
  assert.equal(lineChargesProblem({ ...line, rate: null, discount_amount: 5000 }), undefined);
  assert.match(lineChargesProblem({ ...line, other_charges: -5 }) ?? "", /negative/);
  assert.match(lineChargesProblem({ ...line, other_charges: Number.NaN }) ?? "", /negative/);
});
