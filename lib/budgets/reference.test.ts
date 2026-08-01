/**
 * The quotation reference is the client-facing identity of a document —
 * the string someone reads back on the phone — so its exact shape is
 * pinned here.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { quoteReference } from "./reference";

test("builds QT/<unit>/R<n>-V<v>", () => {
  assert.equal(quoteReference("Plot 6", 2, 1), "QT/PLOT6/R2-V1");
});

test("re-approval after a re-open changes the reference", () => {
  // The whole reason the version exists (migration 0012): the corrected
  // quotation must never carry the same reference as the one already sent.
  assert.notEqual(quoteReference("Plot 6", 2, 1), quoteReference("Plot 6", 2, 2));
});

test("spacing and case cannot mint two references for one unit", () => {
  assert.equal(quoteReference("plot 6", 0, 1), quoteReference("PLOT  6", 0, 1));
});
