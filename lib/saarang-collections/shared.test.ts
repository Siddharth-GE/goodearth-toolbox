import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isFigureCell, previousMonth } from "./shared";

describe("previousMonth", () => {
  it("is the whole month before", () => {
    assert.deepEqual(previousMonth("2026-10-21"), { from: "2026-09-01", to: "2026-09-30" });
    assert.deepEqual(previousMonth("2026-03-05"), { from: "2026-02-01", to: "2026-02-28" });
  });
  it("crosses the year", () => {
    assert.deepEqual(previousMonth("2027-01-10"), { from: "2026-12-01", to: "2026-12-31" });
  });
});

describe("isFigureCell", () => {
  it("allows only the hand-typed cells", () => {
    assert.ok(isFigureCell("plot", "C"));
    assert.ok(isFigureCell("phase3", "MTD"));
    assert.ok(!isFigureCell("plot", "MTD"));
    assert.ok(!isFigureCell("plot", "E"));
    assert.ok(!isFigureCell("other", "C"));
  });
});
