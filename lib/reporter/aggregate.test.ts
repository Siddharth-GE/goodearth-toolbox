/**
 * The arithmetic behind every leadership report. The rule these tests
 * exist to hold: NULLS ARE SKIPPED, NOT ZEROED — an unpriced line and a
 * free line are different things — and a grand total always equals the
 * sum of its subtotals.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { extractRows, runReport, type ReportRow } from "./aggregate";
import { DATASETS } from "./datasets";
import { parseReportSpec } from "./spec";

const dataset = DATASETS.indent_lines;

function spec(overrides: Record<string, unknown>) {
  return parseReportSpec({ dataset: "indent_lines", ...overrides });
}

const rows: ReportRow[] = [
  { project: "Malhar", item: "Cement", quantity: 10, uom: "bag" },
  { project: "Malhar", item: "Cement", quantity: 30, uom: "bag" },
  { project: "Malhar", item: "Sand", quantity: 5, uom: "load" },
  { project: "Chila", item: "Cement", quantity: 20, uom: "bag" },
  { project: "Chila", item: "Steel", quantity: null, uom: "kg" },
];

test("all six aggregates", () => {
  const result = runReport(
    dataset,
    spec({
      groupBy: ["project"],
      measures: [
        { field: "quantity", agg: "sum" },
        { field: "quantity", agg: "avg" },
        { field: "quantity", agg: "min" },
        { field: "quantity", agg: "max" },
        { field: "quantity", agg: "count" },
        { field: "item", agg: "count_distinct" },
      ],
    }),
    rows,
    rows.length,
  );
  assert.equal(result.totals["quantity:sum"], 65);
  assert.equal(result.totals["quantity:avg"], 65 / 4);
  assert.equal(result.totals["quantity:min"], 5);
  assert.equal(result.totals["quantity:max"], 30);
  // count counts values present, so the null steel quantity is not one.
  assert.equal(result.totals["quantity:count"], 4);
  assert.equal(result.totals["item:count_distinct"], 3);
});

test("nulls are skipped, not zeroed", () => {
  const allNull: ReportRow[] = [
    { project: "P", quantity: null },
    { project: "P", quantity: null },
  ];
  const result = runReport(
    dataset,
    spec({ groupBy: ["project"], measures: [{ field: "quantity", agg: "sum" }] }),
    allNull,
    2,
  );
  // A sum over nothing is null — never 0, which would read as "free".
  assert.equal(result.totals["quantity:sum"], null);
  assert.equal(result.groups?.[0].measures["quantity:sum"], null);

  const mixed = runReport(
    dataset,
    spec({ groupBy: ["project"], measures: [{ field: "quantity", agg: "avg" }] }),
    [...allNull, { project: "P", quantity: 6 }],
    3,
  );
  // The average of {null, null, 6} is 6, not 2.
  assert.equal(mixed.totals["quantity:avg"], 6);
});

test("grand total equals the sum of subtotals, two levels deep", () => {
  const result = runReport(
    dataset,
    spec({ groupBy: ["project", "item"], measures: [{ field: "quantity", agg: "sum" }] }),
    rows,
    rows.length,
  );
  const groups = result.groups!;
  const outerSum = groups.reduce((acc, g) => acc + (g.measures["quantity:sum"] ?? 0), 0);
  assert.equal(outerSum, result.totals["quantity:sum"]);

  for (const outer of groups) {
    const childSum = (outer.children ?? []).reduce(
      (acc, child) => acc + (child.measures["quantity:sum"] ?? 0),
      0,
    );
    assert.equal(childSum, outer.measures["quantity:sum"] ?? 0);
    for (const child of outer.children ?? []) {
      assert.equal(child.keys.length, 2);
      assert.equal(child.keys[0], outer.keys[0]);
    }
  }
});

test("empty input is an empty result, not a crash", () => {
  const result = runReport(
    dataset,
    spec({ groupBy: ["project"], measures: [{ field: "quantity", agg: "sum" }] }),
    [],
    0,
  );
  assert.deepEqual(result.detail, []);
  assert.deepEqual(result.groups, []);
  assert.equal(result.totals["quantity:sum"], null);
  assert.equal(result.truncated, false);
});

test("detail is sorted, cut to the limit, and says so", () => {
  const many: ReportRow[] = Array.from({ length: 25 }, (_, i) => ({
    project: "P",
    quantity: i + 1,
  }));
  const result = runReport(
    dataset,
    spec({ sort: [{ field: "quantity", dir: "desc" }], limit: 10 }),
    many,
    25,
  );
  assert.equal(result.detail.length, 10);
  assert.equal(result.detail[0].quantity, 25);
  assert.equal(result.truncated, true);
  assert.equal(result.matched, 25);
});

test("sorting groups by a measure orders by the number, nulls last", () => {
  const result = runReport(
    dataset,
    spec({
      groupBy: ["project"],
      measures: [{ field: "quantity", agg: "sum" }],
      sort: [{ field: "quantity", dir: "desc" }],
    }),
    rows,
    rows.length,
  );
  const keys = result.groups!.map((g) => g.keys[0]);
  assert.deepEqual(keys, ["Malhar", "Chila"]);
});

test("extractRows flattens embeds, tolerates array-wrapped to-ones, nulls the rest", () => {
  const raw = [
    {
      quantity: 4,
      uom: "bag",
      note: null,
      created_at: "2026-08-01T00:00:00Z",
      items: { name: "Cement", code: "CEM-1" },
      indents: {
        reference: "IND-7",
        status: "approved",
        stage: null,
        required_by: null,
        project_id: "p1",
        projects: [{ name: "Malhar" }],
        units: null,
      },
    },
  ];
  const [row] = extractRows(dataset, raw);
  assert.equal(row.item, "Cement");
  assert.equal(row.project, "Malhar");
  assert.equal(row.indent, "IND-7");
  assert.equal(row.unit, null);
  assert.equal(row.stage, null);
  assert.equal(row.quantity, 4);
});
