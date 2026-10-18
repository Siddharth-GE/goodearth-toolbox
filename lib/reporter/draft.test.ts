// What "Run report" sends: blank filters dropped, values typed by field, the chart kept only when it
// can stand on the grouping and measures.
import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_DATASET } from "./datasets";
import { buildDraftSpec, toUiFilters, type DraftState } from "./draft";
import { builderDataset, defaultSpec, measureId } from "./spec";

const dataset = builderDataset(DEFAULT_DATASET);
const spec = defaultSpec(DEFAULT_DATASET);
const numeric = dataset.fields.find(
  (f) => f.type === "number" && f.ops.length > 0 && f.aggregates.length > 0,
);
const groupable = dataset.fields.find((f) => f.groupable);
const bool = dataset.fields.find((f) => f.type === "bool" && f.ops.length > 0);

const blank: DraftState = {
  columns: spec.columns,
  filters: [],
  groupBy: [],
  measures: [],
  sort: spec.sort,
  limit: spec.limit,
  chart: { type: "", category: "", measures: [], emphasis: "" },
};

test("an untouched draft round-trips the default spec", () => {
  assert.deepEqual(buildDraftSpec(spec, dataset, blank), spec);
});

test("blank filter rows are dropped and number values become numbers", () => {
  assert.ok(numeric);
  const out = buildDraftSpec(spec, dataset, {
    ...blank,
    filters: [
      { field: numeric.key, op: numeric.ops[0], value: "  " },
      { field: numeric.key, op: numeric.ops[0], value: "12" },
    ],
  });
  assert.deepEqual(out.filters, [{ field: numeric.key, op: numeric.ops[0], value: 12 }]);
});

test("a bool filter's text becomes a boolean", () => {
  if (!bool) return;
  const out = buildDraftSpec(spec, dataset, {
    ...blank,
    filters: [{ field: bool.key, op: bool.ops[0], value: "true" }],
  });
  assert.equal(out.filters[0]?.value, true);
});

test("the chart is dropped without a grouping or a measure, and keeps only live measures", () => {
  assert.ok(numeric && groupable);
  const measure = { field: numeric.key, agg: numeric.aggregates[0] };
  const id = measureId(measure);
  const chart = { type: "bar" as const, category: "", measures: [id, "gone"], emphasis: "" };

  assert.equal(buildDraftSpec(spec, dataset, { ...blank, chart }).chart, null);
  assert.equal(
    buildDraftSpec(spec, dataset, { ...blank, groupBy: [groupable.key], chart }).chart,
    null,
  );

  const out = buildDraftSpec(spec, dataset, {
    ...blank,
    groupBy: [groupable.key],
    measures: [measure],
    chart,
  });
  assert.equal(out.chart?.type, "bar");
  assert.equal(out.chart?.category, groupable.key);
  assert.deepEqual(out.chart?.measures, [id]);
});

test("toUiFilters stringifies each filter value for the form", () => {
  assert.ok(numeric);
  const filtered = { ...spec, filters: [{ field: numeric.key, op: numeric.ops[0], value: 5 }] };
  assert.deepEqual(toUiFilters(filtered), [{ field: numeric.key, op: numeric.ops[0], value: "5" }]);
});
