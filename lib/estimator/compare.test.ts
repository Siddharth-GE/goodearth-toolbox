import assert from "node:assert/strict";
import { test } from "node:test";
import { compareIssuesToEstimate } from "./compare";

const takeoff = [
  { workItemId: "w1", materialId: "cement", materialName: "Cement", uom: "bag", quantity: 80 },
  { workItemId: "w2", materialId: "sand", materialName: "M-sand", uom: "cum", quantity: 10 },
];
const links = [
  { materialId: "cement", itemId: "i-cem", itemUom: "bag", factor: null },
  { materialId: "sand", itemId: "i-sand", itemUom: "cft", factor: 35.31 },
];

test("issued quantities line up per work, converted into the material's unit", () => {
  const result = compareIssuesToEstimate(takeoff, links, [
    { workItemId: "w1", itemId: "i-cem", quantity: 50 },
    { workItemId: "w2", itemId: "i-sand", quantity: 353.1 },
  ]);
  const cement = result.rows.find((row) => row.workItemId === "w1");
  const sand = result.rows.find((row) => row.workItemId === "w2");
  assert.equal(cement?.issued, 50);
  assert.equal(cement?.over, false);
  assert.ok(Math.abs((sand?.issued ?? 0) - 10) < 1e-9);
  assert.equal(result.unmatched.length, 0);
});

test("issuing past the estimate flags over", () => {
  const result = compareIssuesToEstimate(takeoff, links, [
    { workItemId: "w1", itemId: "i-cem", quantity: 90 },
  ]);
  assert.equal(result.rows.find((row) => row.workItemId === "w1")?.over, true);
});

test("no factor and differing units reports raw, never flags", () => {
  const noFactor = [{ materialId: "sand", itemId: "i-sand", itemUom: "cft", factor: null }];
  const result = compareIssuesToEstimate([takeoff[1]], noFactor, [
    { workItemId: "w2", itemId: "i-sand", quantity: 9999 },
  ]);
  const row = result.rows[0];
  assert.equal(row.issued, null);
  assert.deepEqual(row.issuedRaw, { quantity: 9999, uom: "cft" });
  assert.equal(row.over, false);
});

test("untagged and unknown-work issues land in unmatched, not nowhere", () => {
  const result = compareIssuesToEstimate(takeoff, links, [
    { workItemId: null, itemId: "i-cem", quantity: 20 },
    { workItemId: "w9", itemId: "i-cem", quantity: 5 },
  ]);
  assert.equal(result.rows.find((row) => row.workItemId === "w1")?.issued, 0);
  // Kept per (work, item): each is its own reconciliation entry (0083).
  assert.deepEqual(result.unmatched, [
    { workItemId: null, itemId: "i-cem", quantity: 25 - 5 },
    { workItemId: "w9", itemId: "i-cem", quantity: 5 },
  ]);
});

test("two arrivals for one unplanned (work, item) sum into one entry", () => {
  const result = compareIssuesToEstimate(takeoff, links, [
    { workItemId: "w9", itemId: "i-cem", quantity: 5 },
    { workItemId: "w9", itemId: "i-cem", quantity: 7 },
  ]);
  assert.deepEqual(result.unmatched, [{ workItemId: "w9", itemId: "i-cem", quantity: 12 }]);
});
