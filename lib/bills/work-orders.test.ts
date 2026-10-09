/**
 * Work orders: a line is a quantity at a rate or a lump sum, the value
 * is the lines' sum to paise (as the database writes it), and every
 * refusal is said in words first.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  workOrderLineAmount,
  workOrderLineProblem,
  workOrderProblem,
  workOrderTotal,
  type WorkOrderLineInput,
} from "./work-orders";

const measured: WorkOrderLineInput = {
  workItemId: "fd15",
  description: "Footing",
  isLumpSum: false,
  quantity: 2,
  uom: "cum",
  rate: 4000,
};
const lump: WorkOrderLineInput = {
  workItemId: null,
  description: "Porch plaster",
  isLumpSum: true,
  quantity: null,
  uom: null,
  rate: 15000,
};

test("a line is quantity × rate, or the lump sum itself", () => {
  assert.equal(workOrderLineAmount(measured), 8000);
  assert.equal(workOrderLineAmount(lump), 15000);
  assert.equal(workOrderLineAmount({ ...measured, rate: null }), null);
  assert.equal(workOrderLineAmount({ ...measured, quantity: null }), null);
});

test("the value is the lines' sum to paise", () => {
  assert.equal(workOrderTotal([measured, lump]), 23000);
  assert.equal(workOrderTotal([{ ...measured, quantity: 1.333, rate: 3 }]), 4);
  assert.equal(workOrderTotal([]), 0);
});

test("a line's shape is checked in words", () => {
  assert.equal(workOrderLineProblem(measured), undefined);
  assert.equal(workOrderLineProblem(lump), undefined);
  assert.match(workOrderLineProblem({ ...measured, description: " " }) ?? "", /description/);
  assert.match(workOrderLineProblem({ ...measured, rate: -1 }) ?? "", /rate/);
  assert.match(workOrderLineProblem({ ...lump, rate: null }) ?? "", /lump sum/);
  assert.match(workOrderLineProblem({ ...measured, quantity: 0 }) ?? "", /quantity/);
  assert.match(workOrderLineProblem({ ...measured, uom: null }) ?? "", /unit/);
});

test("an order needs a contractor, a project, a description and works worth something", () => {
  const order = { vendorId: "v", projectId: "p", description: "Masonry", lines: [measured] };
  assert.equal(workOrderProblem(order), undefined);
  assert.match(workOrderProblem({ ...order, vendorId: "" }) ?? "", /contractor/);
  assert.match(workOrderProblem({ ...order, projectId: "" }) ?? "", /project/);
  assert.match(workOrderProblem({ ...order, description: "" }) ?? "", /covers/);
  assert.match(workOrderProblem({ ...order, lines: [] }) ?? "", /at least one/);
  assert.match(
    workOrderProblem({ ...order, lines: [{ ...lump, rate: 0 }] }) ?? "",
    /more than zero/,
  );
});
