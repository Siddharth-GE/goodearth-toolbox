import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { compute, DEFAULT_RULES } from "./core";
import { figureOf, meetingColumns, meetingSheets, totalOf, type View } from "./summary";

type Typed = Record<string, number | null>;
const none: Typed = {
  C: null,
  D: null,
  G: null,
  I: null,
  J: null,
  K: null,
  N: null,
  Q: null,
  R: null,
  T: null,
};
const view = (plot: Typed, villa: Typed): View => ({
  figures: {
    plot: { ...none, ...plot },
    villa: { ...none, ...villa },
    phase3: {
      C: null,
      E: null,
      N: null,
      O: null,
      P: null,
      F: null,
      M: null,
      H: null,
      MTD: null,
      T: 5,
    },
  },
  result: compute({}, DEFAULT_RULES),
});

describe("totalOf", () => {
  it("adds the projects that have a figure and ignores the blank ones", () => {
    assert.equal(totalOf(view({ C: 100 }, {}), "C"), 100);
    assert.equal(totalOf(view({ C: 100 }, { C: 50 }), "C"), 150);
  });
  it("is unknown, not zero, when no project has one", () => {
    assert.equal(totalOf(view({}, {}), "C"), null);
    assert.equal(totalOf(view({}, {}), "F"), null);
  });
});

describe("figureOf", () => {
  it("reads typed cells from the figures and worked-out cells from the result", () => {
    assert.equal(figureOf(view({ G: 7 }, {}), "plot", "G"), 7);
    assert.equal(figureOf(view({}, {}), "plot", "E"), null);
  });
});

describe("the meeting view", () => {
  it("names the period and the target month", () => {
    const labels = meetingColumns("2026-09-01", "2026-10-21").map((c) => c.label);
    assert.ok(labels.includes("September collection"));
    assert.ok(labels.includes("October collection (target)"));
    assert.ok(labels.includes("October collection (MTD)"));
  });
  it("writes a Summary Sheet first, with the Phase 3 row", () => {
    const [summary] = meetingSheets(view({ C: 100 }, {}), {
      periodFrom: "2026-09-01",
      periodTo: "2026-09-30",
      reportDate: "2026-10-21",
    });
    assert.equal(summary.name, "Summary Sheet");
    assert.ok(summary.rows.some((r) => r[1] === "Phase 3"));
  });
});
