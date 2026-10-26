import assert from "node:assert/strict";
import { test } from "node:test";

import {
  billLineProblem,
  billLinesProblem,
  dayRatesFromLines,
  leftOnWorkOrderLine,
  leftToBill,
  linesFromDelivery,
  linesFromPo,
  linesFromWorkOrder,
  type BillLineDraft,
  type PoLineForBill,
  type WorkOrderLineForBill,
} from "./lines";
import { rollUpBill } from "./math";
import { lineMoneyOf } from "./lines";

const line = (over: Partial<BillLineDraft> = {}): BillLineDraft => ({
  kind: "other",
  poLineId: null,
  itemId: null,
  labourLogId: null,
  labourContractLineId: null,
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

const workLine = (over: Partial<WorkOrderLineForBill> = {}): WorkOrderLineForBill => ({
  id: "wl1",
  work_item_id: "fd",
  description: "Footing",
  is_lump_sum: false,
  quantity: 10,
  uom: "cum",
  rate: 4000,
  billed: 0,
  ...over,
});

test("a work-order bill starts from what is left of each work, naming its line", () => {
  const lines = linesFromWorkOrder([
    workLine(),
    workLine({
      id: "wl2",
      work_item_id: null,
      description: "Porch plaster",
      is_lump_sum: true,
      quantity: null,
      uom: null,
      rate: 15000,
    }),
  ]);
  assert.equal(lines[0].kind, "pw_qty");
  assert.equal(lines[0].quantity, 10);
  assert.equal(lines[0].rate, 4000);
  assert.equal(lines[0].labourContractLineId, "wl1");
  assert.equal(lines[1].kind, "pw_lump");
  assert.equal(lines[1].rate, 15000);
  assert.equal(lines[1].labourContractLineId, "wl2");
});

test("stage by stage: a part-billed line offers the rest, a fully billed one drops out", () => {
  const stage = workLine({
    id: "ss",
    description: "SS.01.00 package",
    quantity: 1800,
    uom: "sqft",
    rate: 27.6,
  });
  // 1800 sqft × ₹27.60 = ₹49,680; ₹20,000 billed leaves ₹29,680, i.e. 1075.362 sqft.
  const [rest] = linesFromWorkOrder([{ ...stage, billed: 20000 }]);
  assert.equal(rest.quantity, 1075.362);
  assert.equal(leftOnWorkOrderLine({ ...stage, billed: 20000 }), 29680);
  assert.deepEqual(linesFromWorkOrder([{ ...stage, billed: 49680 }]), []);
  assert.equal(leftOnWorkOrderLine({ ...stage, billed: 60000 }), 0);

  const lump = workLine({ is_lump_sum: true, quantity: null, rate: 15000, billed: 6000 });
  assert.equal(linesFromWorkOrder([lump])[0].rate, 9000);
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

test("when a bill on the order names no stage, nothing is taken as billed — every line comes to enter", () => {
  const [measured, lump] = linesFromWorkOrder([
    workLine({ billed: null }),
    workLine({
      id: "wl2",
      is_lump_sum: true,
      quantity: null,
      uom: null,
      rate: 15000,
      billed: null,
    }),
  ]);
  assert.equal(leftOnWorkOrderLine(workLine({ billed: null })), null);
  assert.equal(measured.quantity, null);
  assert.equal(measured.labourContractLineId, "wl1");
  assert.equal(lump.rate, 15000);
});

test("a bill for one delivery takes what it brought, never past what is left to bill", () => {
  // 60 received, 20 billed: 40 left. This delivery brought 25 bags of cement and nothing of the sand.
  const lines = linesFromDelivery([poLine(), poLine({ po_line_id: "sand", item_name: "Sand" })], {
    pl: 25,
  });
  assert.deepEqual(
    lines.map((line) => [line.poLineId, line.quantity]),
    [["pl", 25]],
  );
  // A delivery bigger than what is left (an earlier bill took some of it) bills only what is left.
  assert.equal(linesFromDelivery([poLine()], { pl: 55 })[0].quantity, 40);
});
