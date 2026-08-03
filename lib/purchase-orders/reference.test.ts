/**
 * The PO reference is what a vendor sees on paper and quotes back on
 * their invoice, so its exact shape is pinned here — including the
 * lpad-truncation case where the TS mirror and the SQL mint (migration
 * 0021) could drift apart, and the scope-resolution order (unit before
 * plot before GEN) that decides which code enters the number.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { GENERAL_SCOPE, poReference, resolveScopeCode } from "./reference";

test("builds PO/<project>/<scope>/<3-digit number>", () => {
  assert.equal(poReference("SAA", "V12A", 1), "PO/SAA/V12A/001");
  assert.equal(poReference("SAA", "GEN", 42), "PO/SAA/GEN/042");
});

test("PO 1000 is PO/X/GEN/1000, never truncated to 100", () => {
  assert.equal(poReference("X", "GEN", 1000), "PO/X/GEN/1000");
});

test("spacing and case cannot mint two references for one scope", () => {
  assert.equal(poReference("saa", "v12a", 7), poReference("SAA", "V12 A", 7));
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
