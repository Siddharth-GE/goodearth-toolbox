import assert from "node:assert/strict";
import { test } from "node:test";

import {
  batchLabel,
  differsFromPo,
  issueValue,
  lineAmount,
  placesOnReceipts,
  planBatches,
  recordedDraws,
  sumAmounts,
  type Batch,
} from "./batches";

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

test("an issue's recorded draws, with what no batch covered as the tail", () => {
  const drawn = [{ receiptLineId: "b1", label: "GRN/SAA/001-1", quantity: 30, rate: 345 }];
  assert.deepEqual(recordedDraws(30, drawn), drawn, "fully covered: no tail");
  assert.deepEqual(recordedDraws(35.5, drawn).at(-1), {
    receiptLineId: null,
    label: "No batch",
    quantity: 5.5,
    rate: null,
  });
  assert.deepEqual(recordedDraws(0.3, [{ ...drawn[0], quantity: 0.1 + 0.2 }]).length, 1);
});

test("a line's place counts within its own receipt, in the order given", () => {
  const places = placesOnReceipts([
    { id: "a1", receiptId: "A" },
    { id: "b1", receiptId: "B" },
    { id: "a2", receiptId: "A" },
  ]);
  assert.deepEqual([places.get("a1"), places.get("a2"), places.get("b1")], [0, 1, 0]);
});

test("a rate or GST changed from the PO's is flagged; the PO's own is not", () => {
  const po = { rate: 380, gstPct: 18, poRate: 380, poGstPct: 18 };
  assert.equal(differsFromPo(po), false);
  assert.equal(differsFromPo({ ...po, rate: 395 }), true);
  assert.equal(differsFromPo({ ...po, gstPct: 28 }), true);
});

test("an amount with no rate or no GST is unknown, and so is any total over it", () => {
  assert.deepEqual(lineAmount(10, 380, 18), { taxable: 3800, gst: 684, total: 4484 });
  assert.deepEqual(lineAmount(10, null, 18), { taxable: null, gst: null, total: null });
  assert.deepEqual(lineAmount(10, 380, null), { taxable: 3800, gst: null, total: null });
  assert.deepEqual(sumAmounts([lineAmount(10, 380, 18), lineAmount(2, 100, 0)]), {
    taxable: 4000,
    gst: 684,
    total: 4684,
  });
  assert.deepEqual(sumAmounts([lineAmount(10, 380, 18), lineAmount(2, 100, null)]), {
    taxable: 4000,
    gst: null,
    total: null,
  });
  assert.deepEqual(sumAmounts([]), { taxable: 0, gst: 0, total: 0 });
});
