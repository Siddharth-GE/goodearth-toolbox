/**
 * The bill reference is what accounts writes on the paper invoice and
 * quotes in payment records, so its exact shape is pinned here —
 * including the lpad-truncation case where the TS mirror and the SQL
 * mint (migration 0025) could drift apart, and the scope-resolution
 * order (unit before plot before GEN) that decides which code enters
 * the number.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { GENERAL_SCOPE, billReference, resolveScopeCode } from "./reference";

test("builds BILL/<project>/<scope>/<3-digit number>", () => {
  assert.equal(billReference("SAA", "V12A", 1), "BILL/SAA/V12A/001");
  assert.equal(billReference("SAA", "GEN", 42), "BILL/SAA/GEN/042");
});

test("bill 1000 is BILL/X/GEN/1000, never truncated to 100", () => {
  assert.equal(billReference("X", "GEN", 1000), "BILL/X/GEN/1000");
});

test("spacing and case cannot mint two references for one scope", () => {
  assert.equal(billReference("saa", "v12a", 7), billReference("SAA", "V12 A", 7));
});

test("scope resolution: unit's code when for a unit, plot's when for a plot", () => {
  assert.equal(resolveScopeCode("P12", "V12A", "unit"), "V12A");
  assert.equal(resolveScopeCode("P12", "V12A", "plot"), "P12");
  assert.equal(resolveScopeCode("P12", "V12A", "general"), GENERAL_SCOPE);
});

test("a missing code resolves to null — the refusal screens warn on", () => {
  assert.equal(resolveScopeCode(null, null, "unit"), null);
  assert.equal(resolveScopeCode("  ", null, "plot"), null);
  // General never needs a code.
  assert.equal(resolveScopeCode(null, null, "general"), GENERAL_SCOPE);
});
