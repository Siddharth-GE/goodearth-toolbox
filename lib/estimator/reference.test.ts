/**
 * The estimate reference appears on the official document indents pull
 * from, so its exact shape is pinned — including the case where the TS
 * mirror and the SQL mint (migration 0077) could drift: numbers past 999.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { estimateReference } from "./reference";

test("builds EST/<code>/<3-digit number>", () => {
  assert.equal(estimateReference("SAA", 1), "EST/SAA/001");
  assert.equal(estimateReference("SAA", 42), "EST/SAA/042");
});

test("estimate 1000 is EST/X/1000, never truncated to 100", () => {
  assert.equal(estimateReference("X", 1000), "EST/X/1000");
});

test("spacing and case cannot mint two references for one project", () => {
  assert.equal(estimateReference("saa", 7), estimateReference("SA A", 7));
});
