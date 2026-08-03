/**
 * The indent reference is what gets written on paper at a site and read
 * out over the phone, so its exact shape is pinned here — including the
 * one subtle case where the TS mirror and the SQL mint (migration 0019)
 * could drift apart: numbers past 999.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { indentReference } from "./reference";

test("builds IND/<code>/<3-digit number>", () => {
  assert.equal(indentReference("ASHRAM", 1), "IND/ASHRAM/001");
  assert.equal(indentReference("ASHRAM", 42), "IND/ASHRAM/042");
});

test("indent 1000 is IND/X/1000, never truncated to 100", () => {
  // SQL's lpad('1234', 3, '0') TRUNCATES to '123'; the migration guards
  // with greatest(3, length(n)) and this pins the TS mirror to match.
  assert.equal(indentReference("X", 1000), "IND/X/1000");
});

test("spacing and case cannot mint two references for one project", () => {
  assert.equal(indentReference("ashram", 7), indentReference("ASH RAM", 7));
});
