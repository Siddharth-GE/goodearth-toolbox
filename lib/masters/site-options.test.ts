import assert from "node:assert/strict";
import { test } from "node:test";

import { buildSiteOptions, decodeSite } from "./site-options";

const plots = [
  { id: "p1", project_id: "proj", name: "Plot 12", code: "P12" },
  { id: "p2", project_id: "proj", name: "Plot 7", code: null },
  { id: "p9", project_id: "other", name: "Plot 9", code: "P9" },
];

const units = [
  { id: "u1", project_id: "proj", plot_id: "p1", name: "Villa 12A", code: "V12A" },
  { id: "u9", project_id: "other", plot_id: "p9", name: "Villa 9", code: "V9" },
];

test("a unit appears once, labelled with its plot, submitting the unit id", () => {
  const options = buildSiteOptions(units, plots, "proj");
  const pair = options.find((option) => option.value === "unit:u1");
  assert.equal(pair?.label, "Villa 12A — Plot 12");
  assert.equal(pair?.code, "V12A");
});

test("a plot with no unit yet still appears, submitting the plot id", () => {
  const options = buildSiteOptions(units, plots, "proj");
  const bare = options.find((option) => option.value === "plot:p2");
  assert.equal(bare?.label, "Plot 7 — no unit yet");
  assert.equal(bare?.code, null);
});

test("a plot whose unit is listed does not appear twice", () => {
  const options = buildSiteOptions(units, plots, "proj");
  assert.equal(
    options.some((option) => option.value === "plot:p1"),
    false,
  );
  assert.equal(options.length, 2);
});

test("only the chosen project's places are offered; no project, no places", () => {
  const options = buildSiteOptions(units, plots, "other");
  assert.deepEqual(
    options.map((option) => option.value),
    ["unit:u9"],
  );
  assert.deepEqual(buildSiteOptions(units, plots, ""), []);
});

test("decode: exactly one id comes back, and general means neither", () => {
  assert.deepEqual(decodeSite("unit:u1"), { plotId: null, unitId: "u1" });
  assert.deepEqual(decodeSite("plot:p2"), { plotId: "p2", unitId: null });
  assert.deepEqual(decodeSite(""), { plotId: null, unitId: null });
  assert.deepEqual(decodeSite("garbage"), { plotId: null, unitId: null });
});
