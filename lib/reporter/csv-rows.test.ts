/**
 * What actually lands in the spreadsheet. The rules worth holding: raw
 * numbers so Excel can add a column up, ISO dates so Excel reads them
 * as dates, and a grouped export that carries the same subtotals and
 * grand total the screen shows.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { runReport, type ReportRow } from "./aggregate";
import { reportCsvFilename, reportCsvRows } from "./csv-rows";
import { DATASETS } from "./datasets";
import { parseReportSpec } from "./spec";

const dataset = DATASETS.indent_lines;

function spec(overrides: Record<string, unknown>) {
  return parseReportSpec({ dataset: "indent_lines", ...overrides });
}

const rows: ReportRow[] = [
  { project: "Malhar", item: "Cement", quantity: 10, uom: "bag", requested_on: "2026-08-01T06:30:00Z" }, // prettier-ignore
  { project: "Malhar", item: "Sand", quantity: 5, uom: "load", requested_on: "2026-08-02T06:30:00Z" }, // prettier-ignore
  { project: "Chila", item: "Cement", quantity: 20, uom: "bag", requested_on: null },
];

/** Cells of a CSV line, unquoted — every cell is quoted, so this is safe. */
function cells(line: string): string[] {
  return line.split(",").map((cell) => cell.slice(1, -1));
}

test("an ungrouped report exports its columns, with raw numbers and ISO dates", () => {
  const lines = reportCsvRows(
    dataset,
    spec({ columns: ["project", "item", "quantity", "requested_on"], limit: 1000 }),
    runReport(dataset, spec({ columns: ["project", "item", "quantity", "requested_on"] }), rows, 3),
    {},
  );
  assert.deepEqual(cells(lines[0]), ["Project", "Item", "Quantity", "Requested on"]);
  // The quantity is a bare number, not "10.000" or "₹10" — a formatted
  // column does not add up in Excel.
  assert.ok(lines.some((line) => cells(line).includes("10")));
  // The timestamp is cut to the date; the missing one is an empty cell.
  assert.ok(lines.some((line) => cells(line).includes("2026-08-01")));
  assert.deepEqual(cells(lines[3]).slice(2), ["20", ""]);
  assert.equal(lines.length, 4);
});

test("a grouped report exports subtotals and a grand total", () => {
  const grouped = spec({
    groupBy: ["project"],
    measures: [{ field: "quantity", agg: "sum" }],
    sort: [{ field: "quantity", dir: "desc" }],
  });
  const lines = reportCsvRows(dataset, grouped, runReport(dataset, grouped, rows, 3), {
    "quantity:sum": "Total quantity",
  });
  assert.deepEqual(cells(lines[0]), ["Project", "Lines", "Total quantity"]);
  assert.deepEqual(cells(lines[1]), ["Chila", "1", "20"]);
  assert.deepEqual(cells(lines[2]), ["Malhar", "2", "15"]);
  // The last line is the grand total over every matched row, and it
  // equals the sum of the group rows above it.
  assert.deepEqual(cells(lines[3]), ["All lines", "3", "35"]);
});

test("two-level grouping repeats the outer key on every child row", () => {
  const grouped = spec({
    groupBy: ["project", "item"],
    measures: [{ field: "quantity", agg: "sum" }],
  });
  const lines = reportCsvRows(dataset, grouped, runReport(dataset, grouped, rows, 3), {
    "quantity:sum": "Total quantity",
  });
  assert.deepEqual(cells(lines[0]), ["Project", "Item", "Lines", "Total quantity"]);
  const malhar = lines.map(cells).filter((cell) => cell[0] === "Malhar");
  assert.deepEqual(malhar[0], ["Malhar", "All", "2", "15"]);
  // Every child carries its project — sorting the file cannot strand it.
  assert.deepEqual(
    malhar.slice(1).map((cell) => cell[1]),
    ["Cement", "Sand"],
  );
  assert.deepEqual(cells(lines[lines.length - 1]), ["All lines", "", "3", "35"]);
});

test("a measure with nothing to add stays empty, never 0", () => {
  const grouped = spec({
    groupBy: ["project"],
    measures: [{ field: "quantity", agg: "sum" }],
  });
  const empty: ReportRow[] = [{ project: "Malhar", quantity: null }];
  const lines = reportCsvRows(dataset, grouped, runReport(dataset, grouped, empty, 1), {});
  // An empty cell reads as "nothing was priced"; a 0 would read as free.
  assert.deepEqual(cells(lines[1]), ["Malhar", "1", ""]);
});

test("an empty report is a header row and a total, not a crash", () => {
  const plain = spec({ columns: ["project", "item"] });
  assert.deepEqual(reportCsvRows(dataset, plain, runReport(dataset, plain, [], 0), {}).length, 1);

  const grouped = spec({ groupBy: ["project"], measures: [{ field: "quantity", agg: "sum" }] });
  const lines = reportCsvRows(dataset, grouped, runReport(dataset, grouped, [], 0), {});
  assert.equal(lines.length, 2);
  assert.deepEqual(cells(lines[1]), ["All lines", "0", ""]);
});

test("the filename cannot carry a path separator or a quote", () => {
  assert.equal(reportCsvFilename(dataset, "2026-08-12"), "Goodearth-Report-Indent-lines-2026-08-12.csv"); // prettier-ignore
  assert.equal(
    reportCsvFilename({ ...dataset, label: '../etc/"passwd' }, "2026-08-12"),
    "Goodearth-Report-etc-passwd-2026-08-12.csv",
  );
});
