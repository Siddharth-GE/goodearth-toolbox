import assert from "node:assert/strict";
import { test } from "node:test";

import { batchLabel, issueValue, planBatches, type Batch } from "./batches";

const batches: Batch[] = [
  {
    receiptLineId: "b2",
    label: "GRN/SAA/002-1",
    receivedAt: "2026-10-07",
    quantity: 20,
    rate: 360,
  },
  {
    receiptLineId: "b1",
    label: "GRN/SAA/001-1",
    receivedAt: "2026-10-06",
    quantity: 30,
    rate: 345,
  },
];

test("a batch is named by its receipt and its place on it", () => {
  assert.equal(batchLabel("GRN/SAA/012", 0), "GRN/SAA/012-1");
});

test("oldest first — the database's trial: 40 takes 30 from the older, 10 from the newer", () => {
  assert.deepEqual(
    planBatches(batches, 40).map((draw) => [draw.label, draw.quantity]),
    [
      ["GRN/SAA/001-1", 30],
      ["GRN/SAA/002-1", 10],
    ],
  );
});

test("the store-keeper's chosen batch goes first", () => {
  assert.deepEqual(
    planBatches(batches, 25, "b2").map((draw) => [draw.label, draw.quantity]),
    [
      ["GRN/SAA/002-1", 20],
      ["GRN/SAA/001-1", 5],
    ],
  );
});

test("more than the batches hold is drawn from stock before batches, with no rate", () => {
  const draws = planBatches(batches, 60);
  assert.deepEqual(draws.at(-1), {
    receiptLineId: null,
    label: "No batch",
    quantity: 10,
    rate: null,
  });
  assert.equal(issueValue(draws), null, "an unknown part makes the value unknown, not lower");
  assert.equal(issueValue(planBatches(batches, 40)), 30 * 345 + 10 * 360);
});
