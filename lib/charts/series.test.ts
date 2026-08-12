/**
 * The data shaping Recharts is handed. Nulls stay null (a gap, never a
 * fabricated zero), wildly different magnitudes split into two charts
 * rather than sharing one flattening scale, and a meter clamps its bar
 * while telling the truth in its caption.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { DATASETS } from "@/lib/reporter/datasets";
import { parseReportSpec } from "@/lib/reporter/spec";
import { runReport, type ReportRow } from "@/lib/reporter/aggregate";

import { ACCENT_TOKEN } from "./palette";
import { buildChartModel, type CartesianModel, type MeterModel, type SplitModel } from "./series";

const dataset = DATASETS.indent_lines;

const labels = {
  measureLabels: {
    "quantity:sum": "Total quantity",
    "quantity:avg": "Average quantity",
    "quantity:count": "Quantity count",
    "item:count_distinct": "Distinct items",
  },
  fieldLabels: { project: "Project", item: "Item" },
  moneyMeasures: [] as string[],
};

const rows: ReportRow[] = [
  { project: "Malhar", item: "Cement", quantity: 10 },
  { project: "Malhar", item: "Sand", quantity: 5 },
  { project: "Chila", item: "Cement", quantity: 20 },
  { project: "Chila", item: "Steel", quantity: null },
];

function model(specRaw: Record<string, unknown>, data = rows) {
  const spec = parseReportSpec({ dataset: "indent_lines", ...specRaw });
  const result = runReport(dataset, spec, data, data.length);
  return { spec, model: buildChartModel({ spec, result, ...labels }) };
}

test("a bar per group, one series per measure, single series in accent", () => {
  const { model: m } = model({
    groupBy: ["project"],
    measures: [{ field: "quantity", agg: "sum" }],
    chart: { type: "bar", category: "project", measures: ["quantity:sum"] },
  });
  const cartesian = m as CartesianModel;
  assert.equal(cartesian.kind, "cartesian");
  assert.equal(cartesian.points.length, 2);
  assert.deepEqual(
    cartesian.series.map((s) => s.color),
    [ACCENT_TOKEN],
  );
  const malhar = cartesian.points.find((p) => p.category === "Malhar");
  assert.equal(malhar?.values["quantity:sum"], 15);
});

test("nulls stay null — a gap, never 0", () => {
  const allNull: ReportRow[] = [
    { project: "P1", quantity: null },
    { project: "P2", quantity: 4 },
  ];
  const { model: m } = model(
    {
      groupBy: ["project"],
      measures: [{ field: "quantity", agg: "sum" }],
      chart: { type: "line", category: "project", measures: ["quantity:sum"] },
    },
    allNull,
  );
  const cartesian = m as CartesianModel;
  const p1 = cartesian.points.find((p) => p.category === "P1");
  assert.equal(p1?.values["quantity:sum"], null);
});

test("a single data point is a valid series; empty input is an empty model", () => {
  const { model: single } = model(
    {
      groupBy: ["project"],
      measures: [{ field: "quantity", agg: "sum" }],
      chart: { type: "bar", category: "project", measures: ["quantity:sum"] },
    },
    [{ project: "Solo", quantity: 3 }],
  );
  assert.equal((single as CartesianModel).points.length, 1);

  const { model: empty } = model(
    {
      groupBy: ["project"],
      measures: [{ field: "quantity", agg: "sum" }],
      chart: { type: "bar", category: "project", measures: ["quantity:sum"] },
    },
    [],
  );
  assert.equal(empty.kind, "empty");
});

test("measures of wildly different magnitude split into charts, never one scale", () => {
  const big: ReportRow[] = [
    { project: "P1", item: "A", quantity: 100_000 },
    { project: "P2", item: "B", quantity: 200_000 },
  ];
  const { model: m } = model(
    {
      groupBy: ["project"],
      measures: [
        { field: "quantity", agg: "sum" },
        { field: "item", agg: "count_distinct" },
      ],
      chart: {
        type: "bar",
        category: "project",
        measures: ["quantity:sum", "item:count_distinct"],
      },
    },
    big,
  );
  assert.equal(m.kind, "split");
  const split = m as SplitModel;
  assert.equal(split.charts.length, 2);
  for (const chart of split.charts) assert.equal(chart.series.length, 1);
});

test("a meter is value over limit, bar clamped, caption honest", () => {
  const { model: m } = model({
    groupBy: ["project"],
    measures: [
      { field: "quantity", agg: "sum" },
      { field: "quantity", agg: "count" },
    ],
    chart: {
      type: "meter",
      category: "project",
      measures: ["quantity:sum", "quantity:count"],
    },
  });
  const meter = m as MeterModel;
  assert.equal(meter.kind, "meter");
  // sum = 35, count = 3 → wildly over 100%.
  assert.equal(meter.value, 35);
  assert.equal(meter.limit, 3);
  assert.ok((meter.pct ?? 0) > 100);
  assert.equal(meter.barPct, 100);
});

test("stacked by two grouping levels: segments are the other level, additive only", () => {
  const { model: m } = model({
    groupBy: ["project", "item"],
    measures: [{ field: "quantity", agg: "sum" }],
    chart: { type: "stacked", category: "project", measures: ["quantity:sum"] },
  });
  const cartesian = m as CartesianModel;
  assert.equal(cartesian.kind, "cartesian");
  assert.equal(cartesian.type, "stacked");
  const ids = cartesian.series.map((s) => s.id);
  assert.ok(ids.includes("Cement") && ids.includes("Sand") && ids.includes("Steel"));
  const malhar = cartesian.points.find((p) => p.category === "Malhar");
  assert.equal(malhar?.values["Cement"], 10);

  // A non-additive measure refuses with a sentence, never a wrong stack.
  const { model: refused } = model({
    groupBy: ["project", "item"],
    measures: [{ field: "quantity", agg: "avg" }],
    chart: { type: "stacked", category: "project", measures: ["quantity:avg"] },
  });
  assert.equal(refused.kind, "empty");
});

test("an inner-level category merges only additive measures", () => {
  const { model: additive } = model({
    groupBy: ["project", "item"],
    measures: [{ field: "quantity", agg: "sum" }],
    chart: { type: "bar", category: "item", measures: ["quantity:sum"] },
  });
  const cartesian = additive as CartesianModel;
  assert.equal(cartesian.kind, "cartesian");
  const cement = cartesian.points.find((p) => p.category === "Cement");
  // 10 from Malhar + 20 from Chila.
  assert.equal(cement?.values["quantity:sum"], 30);

  const { model: refused } = model({
    groupBy: ["project", "item"],
    measures: [{ field: "quantity", agg: "avg" }],
    chart: { type: "bar", category: "item", measures: ["quantity:avg"] },
  });
  assert.equal(refused.kind, "empty");
});
