/**
 * The core every document number in the toolbox mirrors — indents,
 * estimates, GRNs, stock issues, bills and purchase orders each build
 * their reference from these three functions, so their exact behaviour
 * is pinned here once, including the lpad-truncation case where the TS
 * mirror and the SQL mint could silently drift apart.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { GENERAL_SCOPE, documentReference, normaliseCode, resolveScopeCode } from "./reference";

test("normaliseCode upper-cases and strips whitespace", () => {
  assert.equal(normaliseCode("sr 12"), "SR12");
});

test("normaliseCode leaves already-clean input unchanged", () => {
  assert.equal(normaliseCode("SR12"), "SR12");
});

test("documentReference pads to 3 digits", () => {
  assert.equal(documentReference("IND", ["SR"], 7), "IND/SR/007");
});

test("documentReference keeps 4 digits for 1000+, never truncated to 100", () => {
  assert.equal(documentReference("IND", ["SR"], 1000), "IND/SR/1000");
});

test("documentReference normalises every part", () => {
  assert.equal(documentReference("BILL", ["saa", "v12 a"], 7), "BILL/SAA/V12A/007");
});

test("resolveScopeCode: general always resolves to GEN", () => {
  assert.equal(resolveScopeCode("P12", "V12A", "general"), GENERAL_SCOPE);
  assert.equal(resolveScopeCode(null, null, "general"), GENERAL_SCOPE);
});

test("resolveScopeCode: unit scope uses the normalised unit code", () => {
  assert.equal(resolveScopeCode("P12", "v12 a", "unit"), "V12A");
});

test("resolveScopeCode: plot scope uses the normalised plot code", () => {
  assert.equal(resolveScopeCode("p 12", "V12A", "plot"), "P12");
});

test("resolveScopeCode: a null or blank code resolves to null", () => {
  assert.equal(resolveScopeCode(null, null, "unit"), null);
  assert.equal(resolveScopeCode("  ", null, "plot"), null);
});
