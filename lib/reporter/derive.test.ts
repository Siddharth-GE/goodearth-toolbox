import assert from "node:assert/strict";
import { test } from "node:test";

import { lineValue } from "./derive";

test("line value is quantity × rate × (1 + gst/100) at full precision", () => {
  // 3 × 1234.56 × 1.18 — no rounding until display (lib/format.ts).
  assert.equal(lineValue(3, 1234.56, 18), 3 * 1234.56 * 1.18);
  assert.equal(lineValue(2, 100, 0), 200);
});

test("a null rate propagates null, never 0", () => {
  assert.equal(lineValue(3, null, 18), null);
  assert.equal(lineValue(null, 100, 18), null);
  assert.equal(lineValue(3, undefined, 18), null);
  assert.equal(lineValue(3, Number.NaN, 18), null);
});

test("a null GST means 0% — GST-free is real; unpriced is not free", () => {
  assert.equal(lineValue(3, 100, null), 300);
  assert.equal(lineValue(3, 100, undefined), 300);
});

test("a free line is 0, which is different from unpriced", () => {
  assert.equal(lineValue(3, 0, 18), 0);
});
