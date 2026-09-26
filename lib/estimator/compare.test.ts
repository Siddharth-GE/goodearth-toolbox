import assert from "node:assert/strict";
import { test } from "node:test";
import { compareIssuesToEstimate } from "./compare";

const takeoff = [
  { workItemId: "w1", itemId: "i-cem", materialName: "Cement", uom: "bag", quantity: 80 },
  { workItemId: "w2", itemId: "i-sand", materialName: "M-sand", uom: "cft", quantity: 350 },
];

test("issued quantities line up per work and item, in the item's own unit", () => {
  const result = compareIssuesToEstimate(takeoff, [
    { workItemId: "w1", itemId: "i-cem", quantity: 50 },
    { workItemId: "w2", itemId: "i-sand", quantity: 120 },
  ]);
  const cement = result.rows.find((row) => row.workItemId === "w1");
  const sand = result.rows.find((row) => row.workItemId === "w2");
  assert.equal(cement?.issued, 50);
  assert.equal(cement?.over, false);
  assert.equal(sand?.issued, 120);
  assert.equal(result.unmatched.length, 0);
});

test("issuing past the estimate flags over", () => {
  const result = compareIssuesToEstimate(takeoff, [
    { workItemId: "w1", itemId: "i-cem", quantity: 90 },
  ]);
  assert.equal(result.rows.find((row) => row.workItemId === "w1")?.over, true);
});

test("a row frozen before materials were items is shown but never compared", () => {
  const older = { workItemId: "w3", itemId: null, materialName: "Cement", uom: "cft", quantity: 8 };
  const result = compareIssuesToEstimate(
    [older],
    [{ workItemId: "w3", itemId: "i-cem", quantity: 9999 }],
  );
  assert.equal(result.rows[0].issued, null);
  assert.equal(result.rows[0].over, false);
  // What arrived still shows up — as outside the estimate, not nowhere.
  assert.deepEqual(result.unmatched, [{ workItemId: "w3", itemId: "i-cem", quantity: 9999 }]);
});

test("untagged and unknown-work issues land in unmatched, not nowhere", () => {
  const result = compareIssuesToEstimate(takeoff, [
    { workItemId: null, itemId: "i-cem", quantity: 20 },
    { workItemId: "w9", itemId: "i-cem", quantity: 5 },
  ]);
  assert.equal(result.rows.find((row) => row.workItemId === "w1")?.issued, 0);
  // Kept per (work, item): each is its own reconciliation entry (0083).
  assert.deepEqual(result.unmatched, [
    { workItemId: null, itemId: "i-cem", quantity: 20 },
    { workItemId: "w9", itemId: "i-cem", quantity: 5 },
  ]);
});

test("two arrivals for one unplanned (work, item) sum into one entry", () => {
  const result = compareIssuesToEstimate(takeoff, [
    { workItemId: "w9", itemId: "i-cem", quantity: 5 },
    { workItemId: "w9", itemId: "i-cem", quantity: 7 },
  ]);
  assert.deepEqual(result.unmatched, [{ workItemId: "w9", itemId: "i-cem", quantity: 12 }]);
});
