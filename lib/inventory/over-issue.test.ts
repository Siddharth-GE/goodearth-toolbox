import assert from "node:assert/strict";
import { test } from "node:test";
import { findOverIssues } from "./over-issue";

const takeoff = [
  { materialName: "Cement", uom: "bag", quantity: 120, itemId: "i-cem", itemUomFactor: null },
  { materialName: "M-sand", uom: "cum", quantity: 10, itemId: "i-sand", itemUomFactor: 35.31 },
  { materialName: "Lime", uom: "kg", quantity: 50, itemId: null, itemUomFactor: null },
];
const itemUoms = new Map([
  ["i-cem", "bag"],
  ["i-sand", "cft"],
]);

test("within the estimate stays quiet", () => {
  const drawn = new Map([
    ["i-cem", 100],
    ["i-sand", 300],
  ]);
  assert.deepEqual(findOverIssues(takeoff, drawn, itemUoms), []);
});

test("past the estimate flags with both figures in the material's unit", () => {
  const drawn = new Map([["i-cem", 130]]);
  assert.deepEqual(findOverIssues(takeoff, drawn, itemUoms), [
    { materialName: "Cement", uom: "bag", estimated: 120, drawn: 130 },
  ]);
});

test("the factor converts before comparing", () => {
  // 400 cft ÷ 35.31 ≈ 11.33 cum > 10 cum estimated.
  const drawn = new Map([["i-sand", 400]]);
  const over = findOverIssues(takeoff, drawn, itemUoms);
  assert.equal(over.length, 1);
  assert.equal(over[0].materialName, "M-sand");
  assert.ok(Math.abs(over[0].drawn - 400 / 35.31) < 1e-9);
});

test("no factor and differing units never flags — a guess is worse than a gap", () => {
  const noFactor = [{ ...takeoff[1], itemUomFactor: null }];
  const drawn = new Map([["i-sand", 99999]]);
  assert.deepEqual(findOverIssues(noFactor, drawn, itemUoms), []);
});

test("an unlinked material never flags", () => {
  const drawn = new Map([["i-lime", 9999]]);
  assert.deepEqual(findOverIssues([takeoff[2]], drawn, itemUoms), []);
});
