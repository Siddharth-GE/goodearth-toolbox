/**
 * Both references are written on paper — a GRN number goes on the file
 * the challan is stapled into — so their exact shape is pinned here,
 * including the lpad-truncation case where the TS mirror and the SQL
 * mint (migration 0023) could silently drift apart.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { grnReference, issueReference } from "./reference";

test("builds GRN/<project>/<3-digit number>", () => {
  assert.equal(grnReference("SAA", 1), "GRN/SAA/001");
  assert.equal(grnReference("SAA", 42), "GRN/SAA/042");
});

test("builds ISS/<project>/<3-digit number>", () => {
  assert.equal(issueReference("SAA", 1), "ISS/SAA/001");
  assert.equal(issueReference("SAA", 999), "ISS/SAA/999");
});

test("number 1000 keeps all four digits, never truncated to 100", () => {
  assert.equal(grnReference("X", 1000), "GRN/X/1000");
  assert.equal(issueReference("X", 1000), "ISS/X/1000");
});

test("spacing and case cannot mint two references for one project", () => {
  assert.equal(grnReference("saa", 7), grnReference("SA A", 7));
  assert.equal(issueReference("saa", 7), issueReference("SA A", 7));
});
