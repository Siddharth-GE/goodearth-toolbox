/**
 * Bill lines: each refusal in words; a material bill starts from what was
 * received and not yet billed, with the PO's discount and charges shared
 * out by quantity; a work-order bill starts from its works; a daily-wages
 * bill suggests the contractor's last day rates.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  billLineProblem,
  billLinesProblem,
  dayRatesFromLines,
  leftToBill,
  linesFromPo,
  linesFromWorkOrder,
  type BillLineDraft,
  type PoLineForBill,
} from "./lines";
import { rollUpBill } from "./math";
import { lineMoneyOf } from "./lines";

const line = (over: Partial<BillLineDraft> = {}): BillLineDraft => ({
  kind: "other",
  poLineId: null,
  itemId: null,
  labourLogId: null,
  workItemId: null,
  description: "Footing",
  uom: "cum",
  quantity: 2,
  rate: 4000,
  gstPct: 0,
  discountAmount: null,
  otherCharges: null,
  note: null,
  ...over,
});

test("2 cum at ₹4,000 is ₹8,000 — the founder's example", () => {
  assert.equal(rollUpBill([lineMoneyOf(line({ kind: "pw_qty" }))]).total, 8000);
  assert.equal(
    rollUpBill([lineMoneyOf(line({ kind: "pw_lump", quantity: null, rate: 15000 }))]).total,
    15000,
  );
});

test("a line's refusals, in words", () => {
  assert.equal(billLineProblem(line()), undefined);
  assert.match(billLineProblem(line({ description: " " })) ?? "", /description/);
  assert.match(billLineProblem(line({ kind: "material" })) ?? "", /name its material/);
  assert.match(billLineProblem(line({ rate: null })) ?? "", /rate/);
  assert.match(
    billLineProblem(line({ kind: "pw_lump", quantity: null, rate: null })) ?? "",
    /lump sum/,
  );
  assert.match(billLineProblem(line({ quantity: 0 })) ?? "", /quantity/);
  assert.equal(billLineProblem(line({ kind: "pw_lump", quantity: null })), undefined);
  assert.match(billLineProblem(line({ gstPct: 101 })) ?? "", /GST/);
  assert.match(billLineProblem(line({ discountAmount: 9000 })) ?? "", /more than its line/);
  assert.match(billLineProblem(line({ otherCharges: -1 })) ?? "", /negative/);
  assert.match(billLinesProblem([]) ?? "", /at least one/);
});

const poLine = (over: Partial<PoLineForBill> = {}): PoLineForBill => ({
  po_line_id: "pl",
  item_id: "cem",
  item_name: "Cement",
  item_code: "CEM/01",
  uom: "bag",
  ordered: 100,
  received: 60,
  billed: 20,
  rate: 400,
  gst_pct: 18,
  discount_pct: null,
  discount_amount: null,
  other_charges: null,
  ...over,
});

test("a material bill starts from what was received and not yet billed", () => {
  assert.equal(leftToBill(poLine()), 40);
  const [first] = linesFromPo([poLine(), poLine({ po_line_id: "done", received: 20 })]);
  assert.equal(first.quantity, 40);
  assert.equal(first.description, "Cement (CEM/01)");
  assert.equal(first.rate, 400);
  assert.equal(first.gstPct, 18);
  assert.equal(linesFromPo([poLine({ received: 20 })]).length, 0);
});

test("the PO's discount and charges follow the quantity billed", () => {
  const [pct] = linesFromPo([poLine({ discount_pct: 10 })]);
  assert.equal(pct.discountAmount, 1600); // 40 × 400 × 10%
  const [rupees] = linesFromPo([poLine({ discount_amount: 500, other_charges: 1000 })]);
  assert.equal(rupees.discountAmount, 200); // 40 of 100 ordered
  assert.equal(rupees.otherCharges, 400);
});

test("a work-order bill starts from its works", () => {
  const lines = linesFromWorkOrder([
    { work_item_id: "fd", description: "Footing", is_lump_sum: false, uom: "cum", rate: 4000 },
    { work_item_id: null, description: "Porch plaster", is_lump_sum: true, uom: null, rate: 15000 },
  ]);
  assert.equal(lines[0].kind, "pw_qty");
  assert.equal(lines[0].quantity, null);
  assert.equal(lines[1].kind, "pw_lump");
  assert.equal(lines[1].rate, 15000);
});

test("a daily-wages bill suggests the last bill's day rates", () => {
  assert.deepEqual(
    dayRatesFromLines([
      { description: "Masons (man-days)", rate: 950 },
      { description: "Helpers (man-days)", rate: 700 },
      { description: "Masons (man-days)", rate: 900 },
    ]),
    { mason: 950, helper: 700, other: null },
  );
});
