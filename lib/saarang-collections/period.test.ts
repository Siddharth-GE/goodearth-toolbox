import assert from "node:assert/strict";
import { test } from "node:test";

import { compute, DEFAULT_RULES, type Datasets } from "./core";
import { periodOf } from "./period";

const datasets: Datasets = {
  plot_payments: {
    rows: [
      ["PR-1", "2026-09-30", "A", "", "SAARANG COLLECTION", 100, 0],
      ["PR-2", "2026-10-01", "B", "", "SAARANG COLLECTION", 200, 50],
      ["PR-3", "2026-10-27", "C", "", "SAARANG COLLECTION", 300, 0],
      ["PR-4", "2026-10-28", "D", "", "SAARANG COLLECTION", 400, 0],
    ],
  },
  plot_milestones: {
    rows: [
      ["SAARANG-PLOT-01", "A", "On Booking", "2026-10-05", 1000, 0, 0, "Completed", ""],
      ["SAARANG-PLOT-01", "A", "On Sale Deed", "2026-10-20", 2000, 0, 0, "Not Started", ""],
      ["SAARANG-PLOT-02", "B", "On Booking", "2026-11-01", 4000, 0, 0, "Completed", ""],
      ["SAARANG-PLOT-03", "C", "On Booking", "", 8000, 0, 0, "Completed", ""],
    ],
  },
  plot_outstanding: {
    rows: [
      ["SAARANG-PLOT-01", "Overdue", "2026-09-01", "2026-10-10", "INV-1", "A", 500, 500],
      ["SAARANG-PLOT-02", "Overdue", "2026-08-01", "2026-09-10", "INV-2", "B", 700, 700],
    ],
  },
};
const october = { from: "2026-10-01", to: "2026-10-27" };

test("a period counts only the rows Zoho dates inside it, both ends included", () => {
  const whole = compute(datasets, DEFAULT_RULES).plot;
  const period = periodOf(whole, october);
  assert.equal(period.values.F, 500);
  assert.equal(period.values.L, 50);
  assert.equal(period.values.P, 1000);
  assert.equal(period.values.S, 3000);
  assert.equal(period.values.M, 500);
  assert.equal(period.unitsOwing, 1);
  assert.deepEqual(
    period.detail.F?.rows.map((cells) => cells[0]),
    ["PR-2", "PR-3"],
  );
});

test("an undated milestone is left out of the period and says why", () => {
  const period = periodOf(compute(datasets, DEFAULT_RULES).plot, october);
  const undated = period.detail.P?.left.find((row) => row.cells[0] === "SAARANG-PLOT-03");
  assert.equal(undated?.why, "No due date in Zoho");
  assert.ok(period.detail.P?.left.some((row) => row.why === "Not completed"));
});

test("a report not uploaded stays unknown in the period, never 0", () => {
  const period = periodOf(compute({}, DEFAULT_RULES).villa, october);
  assert.deepEqual(period.values, { F: null, L: null, P: null, S: null, M: null });
  assert.equal(period.unitsOwing, null);
});

test("the whole-project figures are not changed by looking at a period", () => {
  const whole = compute(datasets, DEFAULT_RULES).plot;
  periodOf(whole, october);
  assert.equal(whole.values.F, 1000);
});
