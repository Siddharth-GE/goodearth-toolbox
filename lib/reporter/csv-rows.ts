// Pure: rows in, CSV strings out. Mirrors the screen, except it carries EVERY matched line
// (queries.ts runSpecForCsv lifts the row limit). Values go in raw (unformatted numbers, YYYY-MM-DD
// dates) so Excel can add and sort them.

import { csvResponse, csvRow, safeFilename } from "@/lib/csv";

import type { ReportResult, ReportValue } from "./aggregate";
import type { DatasetDef, FieldType } from "./datasets";
import { measureLabel } from "./labels";
import { measureId, type ReportSpec } from "./spec";
import { todayInIndia } from "@/lib/format";

export function reportCsvFilename(dataset: DatasetDef, today: string): string {
  return `Goodearth-Report-${safeFilename(dataset.label)}-${safeFilename(today)}.csv`;
}

function cellValue(type: FieldType, value: ReportValue): string | number {
  if (value === null) return "";
  if (type === "date") return String(value).slice(0, 10);
  if (type === "bool") return value === true ? "Yes" : "No";
  return typeof value === "number" ? value : String(value);
}

/** measureLabels come from measureLabel(), so table, chart and CSV name columns alike. */
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
        // Matches the screen: the outer row is the whole group.
        ...(twoLevel ? ["All"] : []),
        group.rowCount,
        ...measureCells(group.measures),
      ]),
    );
    for (const child of group.children ?? []) {
      rows.push(
        csvRow([
          // Repeated here so sorting or pivoting the file doesn't strand child rows.
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

export function reportCsvResponse(
  dataset: DatasetDef,
  spec: ReportSpec,
  result: ReportResult,
): Response {
  const rows = reportCsvRows(
    dataset,
    spec,
    result,
    Object.fromEntries(
      spec.measures.map((measure) => [
        measureId(measure),
        measureLabel(dataset.fields[measure.field].label, measure.agg),
      ]),
    ),
  );
  const today = todayInIndia();
  return csvResponse(rows, reportCsvFilename(dataset, today));
}
