/**
 * parseReportSpec is the whole validation boundary between the browser
 * and the database — a hand-edited URL, a hostile payload and a report
 * saved before a rename all land here. These tests are the proof that
 * nothing a user typed survives into a select, a filter column or an
 * order clause.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { DATASETS, DEFAULT_DATASET } from "./datasets";
import {
  DEFAULT_LIMIT,
  MAX_GROUP_BY,
  MAX_LIMIT,
  MAX_MEASURES,
  MIN_LIMIT,
  decodeSpecParam,
  defaultSpec,
  describeSpecLoss,
  encodeSpec,
  measureId,
  parseReportSpec,
  specFromParam,
} from "./spec";

const knownKeys = new Set(Object.keys(DATASETS[DEFAULT_DATASET].fields));

test("garbage in, safe empty spec out — never a throw", () => {
  for (const raw of [null, undefined, 42, "spec", [], { dataset: 9 }]) {
    const spec = parseReportSpec(raw);
    assert.equal(spec.dataset, DEFAULT_DATASET);
    assert.deepEqual(spec.columns, DATASETS[DEFAULT_DATASET].defaultColumns);
    assert.deepEqual(spec.filters, []);
    assert.deepEqual(spec.groupBy, []);
  }
});

test("an unknown dataset falls back and the loss is said", () => {
  const raw = { dataset: "vendor_secrets" };
  assert.equal(parseReportSpec(raw).dataset, DEFAULT_DATASET);
  assert.ok(describeSpecLoss(raw).some((line) => line.includes("no longer exists")));
});

test("hostile strings never survive", () => {
  const junk = "x".repeat(10_000);
  const spec = parseReportSpec({
    dataset: "indent_lines",
    columns: ["rate); drop table bills", "*", "a,b", "__proto__", junk, "item"],
    filters: [
      { field: "note); delete from bills", op: "contains", value: "x" },
      { field: "note", op: "contains", value: junk },
      { field: "__proto__", op: "eq", value: 1 },
    ],
    groupBy: ["*", "__proto__"],
    sort: [{ field: "a,b", dir: "asc" }],
  });
  for (const column of spec.columns) assert.ok(knownKeys.has(column), column);
  for (const filter of spec.filters) {
    assert.ok(knownKeys.has(filter.field));
    assert.ok(String(filter.value).length <= 200);
  }
  assert.deepEqual(spec.groupBy, []);
  assert.deepEqual(spec.sort, []);
});

test("an illegal op for a field's type is dropped, and said", () => {
  const raw = {
    dataset: "indent_lines",
    filters: [
      { field: "quantity", op: "contains", value: 5 },
      { field: "quantity", op: "gte", value: 5 },
    ],
  };
  const spec = parseReportSpec(raw);
  assert.deepEqual(spec.filters, [{ field: "quantity", op: "gte", value: 5 }]);
  assert.ok(describeSpecLoss(raw).some((line) => line.includes("Quantity")));
});

test("a lookup field takes an id with eq, never free text ops", () => {
  const spec = parseReportSpec({
    dataset: "indent_lines",
    filters: [
      { field: "project", op: "eq", value: "3f2f7f5e-0000-0000-0000-000000000000" },
      { field: "project", op: "contains", value: "Malhar" },
    ],
  });
  assert.equal(spec.filters.length, 1);
  assert.equal(spec.filters[0].op, "eq");
});

test("dropdown fields refuse contains — choices, never typing", () => {
  const spec = parseReportSpec({
    dataset: "indent_lines",
    filters: [
      { field: "item", op: "contains", value: "cement" },
      { field: "item", op: "eq", value: "OPC 53 Grade Cement" },
      { field: "status", op: "neq", value: "draft" },
      { field: "note", op: "contains", value: "urgent" }, // note filters nothing
    ],
  });
  assert.deepEqual(spec.filters, [
    { field: "item", op: "eq", value: "OPC 53 Grade Cement" },
    { field: "status", op: "neq", value: "draft" },
  ]);
});

test("limit is clamped and groupBy capped at two", () => {
  assert.equal(parseReportSpec({ limit: 10_000_000 }).limit, MAX_LIMIT);
  assert.equal(parseReportSpec({ limit: -5 }).limit, MIN_LIMIT);
  assert.equal(parseReportSpec({ limit: "everything" }).limit, DEFAULT_LIMIT);

  const spec = parseReportSpec({
    dataset: "indent_lines",
    groupBy: ["project", "item", "uom", "status"],
  });
  assert.equal(spec.groupBy.length, MAX_GROUP_BY);
});

test("measures validate field+aggregate pairs and cap at eight", () => {
  const spec = parseReportSpec({
    dataset: "indent_lines",
    measures: [
      { field: "quantity", agg: "sum" },
      { field: "quantity", agg: "sum" }, // duplicate collapses
      { field: "quantity", agg: "avg" },
      { field: "quantity", agg: "min" },
      { field: "quantity", agg: "max" },
      { field: "quantity", agg: "count" },
      { field: "project", agg: "count_distinct" },
      { field: "unit", agg: "count_distinct" },
      { field: "indent", agg: "count_distinct" },
      { field: "item", agg: "count_distinct" },
      { field: "uom", agg: "sum" }, // illegal: text has no sum
      { field: "note", agg: "count" }, // illegal: note declares none
    ],
  });
  assert.equal(spec.measures.length, MAX_MEASURES);
  assert.ok(!spec.measures.some((m) => m.field === "uom" || m.field === "note"));
});

test("a chart whose category is not in groupBy is dropped, not rendered wrong", () => {
  const raw = {
    dataset: "indent_lines",
    groupBy: ["project"],
    measures: [{ field: "quantity", agg: "sum" }],
    chart: { type: "bar", category: "item", measures: ["quantity:sum"] },
  };
  assert.equal(parseReportSpec(raw).chart, null);
  assert.ok(describeSpecLoss(raw).some((line) => line.includes("chart")));

  const kept = parseReportSpec({
    ...raw,
    chart: { type: "bar", category: "project", measures: ["quantity:sum"] },
  });
  assert.deepEqual(kept.chart, { type: "bar", category: "project", measures: ["quantity:sum"] });
});

test("a meter keeps exactly one measure", () => {
  const spec = parseReportSpec({
    dataset: "indent_lines",
    groupBy: ["project"],
    measures: [
      { field: "quantity", agg: "sum" },
      { field: "quantity", agg: "avg" },
    ],
    chart: { type: "meter", category: "project", measures: ["quantity:sum", "quantity:avg"] },
  });
  assert.deepEqual(spec.chart?.measures, ["quantity:sum"]);
});

test("a v1 spec still parses after a later version adds fields", () => {
  const spec = parseReportSpec({
    schemaVersion: 1,
    dataset: "indent_lines",
    columns: ["item", "quantity"],
    someFutureThing: { nested: true },
  });
  assert.deepEqual(spec.columns, ["item", "quantity"]);
});

test("the URL round trip is lossless, and a mangled param is just null", () => {
  const spec = parseReportSpec({
    dataset: "indent_lines",
    columns: ["item", "quantity"],
    filters: [{ field: "item", op: "eq", value: "കല്ല്" }],
    groupBy: ["item"],
    measures: [{ field: "quantity", agg: "sum" }],
    sort: [{ field: "quantity", dir: "desc" }],
  });
  const decoded = specFromParam(encodeSpec(spec));
  assert.deepEqual(decoded, spec);

  assert.equal(decodeSpecParam(undefined), null);
  assert.equal(decodeSpecParam("!!!not-base64!!!"), null);
  assert.equal(decodeSpecParam("x".repeat(30_000)), null);
  assert.equal(specFromParam("!!!not-base64!!!"), null);
});

test("defaultSpec opens with the dataset's own columns and sort", () => {
  const spec = defaultSpec("indent_lines");
  assert.deepEqual(spec.columns, DATASETS.indent_lines.defaultColumns);
  assert.deepEqual(spec.sort, DATASETS.indent_lines.defaultSort);
  assert.equal(defaultSpec("nope").dataset, DEFAULT_DATASET);
});

test("measureId is the one spelling everything shares", () => {
  assert.equal(measureId({ field: "quantity", agg: "sum" }), "quantity:sum");
});
