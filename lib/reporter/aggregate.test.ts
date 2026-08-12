/**
 * The arithmetic behind every leadership report. The rule these tests
 * exist to hold: NULLS ARE SKIPPED, NOT ZEROED — an unpriced line and a
 * free line are different things — and a grand total always equals the
 * sum of its subtotals.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { extractRows, identityKey, runReport, type ReportRow } from "./aggregate";
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

test("a distinct count counts things, not labels", () => {
  // Five armchairs share the name "Armchair" and are told apart by item
  // code — and one has no code at all, which is why codes are not the
  // identity either. Counting names says 2; counting items says 4.
  const armchair = (id: string, code: string | null): ReportRow => ({
    project: "Malhar",
    item: id === "i4" ? "Cement" : "Armchair",
    [identityKey("item")]: id,
    item_code: code,
    [identityKey("item_code")]: id,
  });
  const armchairs: ReportRow[] = [
    armchair("i1", "ARM-1"),
    armchair("i2", "ARM-2"),
    armchair("i3", null),
    armchair("i4", "CEM-1"),
  ];
  const result = runReport(
    dataset,
    spec({
      groupBy: ["project"],
      measures: [
        { field: "item", agg: "count_distinct" },
        { field: "item_code", agg: "count_distinct" },
      ],
    }),
    armchairs,
    armchairs.length,
  );
  assert.equal(result.totals["item:count_distinct"], 4);
  // The blank code is still one item — counting codes would say 3.
  assert.equal(result.totals["item_code:count_distinct"], 4);
  assert.equal(result.groups?.[0].measures["item:count_distinct"], 4);
});

test("extractRows carries identity ids beside the names it displays", () => {
  const raw = [
    {
      item_id: "i1",
      quantity: 1,
      items: { name: "Armchair", code: "ARM-1" },
      indents: { project_id: "p1", unit_id: null, projects: { name: "Malhar" }, units: null },
    },
    {
      item_id: "i2",
      quantity: 1,
      items: { name: "Armchair", code: "ARM-2" },
      indents: {
        project_id: "p1",
        unit_id: "u9",
        projects: { name: "Malhar" },
        units: { name: "Villa 6" },
      },
    },
  ];
  const extracted = extractRows(dataset, raw);
  assert.equal(extracted[0].item, "Armchair");
  assert.equal(extracted[0]["#id:item"], "i1");
  assert.equal(extracted[1]["#id:item"], "i2");
  assert.equal(extracted[0]["#id:unit"], null);
  assert.equal(extracted[1]["#id:unit"], "u9");

  const result = runReport(
    dataset,
    spec({ measures: [{ field: "item", agg: "count_distinct" }] }),
    extracted,
    2,
  );
  // Two rows, one name, two items.
  assert.equal(result.totals["item:count_distinct"], 2);
});

test("a field with no identityPath still counts its own values", () => {
  // The indent reference IS the identity, so nothing changes for it.
  const result = runReport(
    dataset,
    spec({ measures: [{ field: "indent", agg: "count_distinct" }] }),
    [{ indent: "IND-1" }, { indent: "IND-1" }, { indent: "IND-2" }, { indent: null }],
    4,
  );
  assert.equal(result.totals["indent:count_distinct"], 2);
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
