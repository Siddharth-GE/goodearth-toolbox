import assert from "node:assert/strict";
import { test } from "node:test";

import { plotNumber } from "./plot-number";

test("a plot's number, as the tracker printed it", () => {
  assert.equal(plotNumber("P10", "Plot 10"), "10");
  assert.equal(plotNumber("P22-23", "Plot 22 & 23"), "22-23");
  assert.equal(plotNumber("SW-03", "Plot 3"), "SW-03");
  assert.equal(plotNumber(null, "Villa 7"), "7");
  assert.equal(plotNumber("  ", "Plot 9"), "9");
  assert.equal(plotNumber(null, "Plot"), "Plot");
});
