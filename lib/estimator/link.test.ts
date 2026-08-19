import assert from "node:assert/strict";
import { test } from "node:test";
import { convertToItemUom, sameUom } from "./link";

test("matching uoms convert 1:1 without a factor", () => {
  assert.deepEqual(convertToItemUom(50, "bag", "bag", null), { qty: 50 });
});

test("uom labels match case-insensitively and trimmed", () => {
  assert.deepEqual(convertToItemUom(50, " Cft", "cft", null), { qty: 50 });
});

test("nos and each are the same unit under two conventions", () => {
  assert.ok(sameUom("nos", "each"));
  assert.deepEqual(convertToItemUom(12, "nos", "each", null), { qty: 12 });
});

test("a factor converts even when labels differ", () => {
  assert.deepEqual(convertToItemUom(2, "cum", "cft", 35.31), { qty: 70.62 });
});

test("an explicit factor wins over a label match", () => {
  // A person who entered a factor meant it; second-guessing them because
  // the labels happen to match would make the stored number a no-op.
  assert.deepEqual(convertToItemUom(10, "bag", "bag", 2), { qty: 20 });
});

test("differing uoms with no factor ask for one instead of guessing", () => {
  assert.deepEqual(convertToItemUom(2, "cum", "cft", null), { needsFactor: true });
});

test("sqm and sqft are NOT treated as convertible by label", () => {
  assert.deepEqual(convertToItemUom(100, "sqm", "sqft", null), { needsFactor: true });
});
