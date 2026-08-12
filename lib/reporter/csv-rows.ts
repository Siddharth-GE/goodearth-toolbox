/**
 * A run report as CSV lines. PURE — rows in, strings out — so what
 * lands in someone's spreadsheet is covered by `npm test` rather than
 * by opening a download and squinting at it.
 *
 * It mirrors what is on screen: a grouped report exports its groups,
 * subtotals and grand total; an ungrouped one exports its columns. The
 * one deliberate difference is that the CSV carries EVERY matched line,
 * not the first N — the row limit is a screen setting, and a
 * spreadsheet is where someone goes for the lot. The caller runs the
 * spec with the limit lifted (queries.ts `runSpecForCsv`).
 *
 * Values go in raw, not formatted: numbers unformatted so Excel can add
 * a column up, dates as YYYY-MM-DD so Excel reads them as dates.
 * `formatMoney` and friends are for screens, and a column of formatted
 * money does not tally.
 */

import { csvRow, safeFilename } from "@/lib/csv";

import type { ReportResult, ReportValue } from "./aggregate";
import type { DatasetDef, FieldType } from "./datasets";
import { measureId, type ReportSpec } from "./spec";

/**
 * "Goodearth-Report-Indent-lines-2026-08-12.csv". `today` is passed in
 * rather than read from the clock, so this stays pure and testable.
 */
export function reportCsvFilename(dataset: DatasetDef, today: string): string {
  return `Goodearth-Report-${safeFilename(dataset.label)}-${safeFilename(today)}.csv`;
}

/** One cell's value, ready for csvRow. Null becomes an empty cell. */
function cellValue(type: FieldType, value: ReportValue): string | number {
  if (value === null) return "";
  if (type === "date") return String(value).slice(0, 10);
  if (type === "bool") return value === true ? "Yes" : "No";
  return typeof value === "number" ? value : String(value);
}

/**
 * @param measureLabels measure id -> heading, built by the caller from
 *   the same `measureLabel()` the table and chart use, so the three
 *   never disagree about what a column is called.
 */
export function reportCsvRows(
  dataset: DatasetDef,
  spec: ReportSpec,
  result: ReportResult,
  measureLabels: Record<string, string>,
): string[] {
  const measureCells = (values: Record<string, number | null>) =>
    spec.measures.map((measure) => values[measureId(measure)] ?? "");
  const measureHeadings = spec.measures.map(
    (measure) => measureLabels[measureId(measure)] ?? measure.field,
  );

  if (!result.groups) {
    const rows = [csvRow(result.columns.map((key) => dataset.fields[key].label))];
    for (const row of result.detail) {
      rows.push(
        csvRow(result.columns.map((key) => cellValue(dataset.fields[key].type, row[key] ?? null))),
      );
    }
    return rows;
  }

  const twoLevel = spec.groupBy.length === 2;
  const outerType = dataset.fields[spec.groupBy[0]].type;
  const rows = [
    csvRow([
      dataset.fields[spec.groupBy[0]].label,
      ...(twoLevel ? [dataset.fields[spec.groupBy[1]].label] : []),
      "Lines",
      ...measureHeadings,
    ]),
  ];

  for (const group of result.groups) {
    rows.push(
      csvRow([
        cellValue(outerType, group.keys[0]),
        // "All" matches the screen: the outer row is the whole group,
        // not one of its children.
        ...(twoLevel ? ["All"] : []),
        group.rowCount,
        ...measureCells(group.measures),
      ]),
    );
    for (const child of group.children ?? []) {
      rows.push(
        csvRow([
          // The screen leaves this cell blank under its group; a
          // spreadsheet repeats it, so sorting or pivoting the file
          // does not strand the child rows.
          cellValue(outerType, group.keys[0]),
          cellValue(dataset.fields[spec.groupBy[1]].type, child.keys[1]),
          child.rowCount,
          ...measureCells(child.measures),
        ]),
      );
    }
  }

  rows.push(
    csvRow([
      "All lines",
      ...(twoLevel ? [""] : []),
      result.matched,
      ...measureCells(result.totals),
    ]),
  );
  return rows;
}
