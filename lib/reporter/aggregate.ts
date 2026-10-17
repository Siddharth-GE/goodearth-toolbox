// Grouping and aggregation in TypeScript, not SQL: PostgREST can't GROUP BY, and the SQL options
// bypass RLS. Rules the tests lock: nulls are skipped, never zeroed; count_distinct counts identity
// ids, not labels.

import type { Aggregate, DatasetDef } from "./datasets";
import { DERIVED } from "./derive";
import { measureId, type ReportSpec } from "./spec";

export type ReportValue = string | number | boolean | null;
export type ReportRow = Record<string, ReportValue>;

export type GroupRow = {
  keys: ReportValue[];
  /** Aggregated values keyed by measure id ("field:agg"). */
  measures: Record<string, number | null>;
  rowCount: number;
  children: GroupRow[] | null;
};

export type ReportResult = {
  columns: string[];
  detail: ReportRow[];
  /** Rows the filters matched — what totals are computed over. */
  matched: number;
  truncated: boolean;
  /** Present when the spec groups; replaces the detail view. */
  groups: GroupRow[] | null;
  totals: Record<string, number | null>;
  /**
   * Sum of each number column over EVERY matched row, nulls skipped. Quantity columns stay null
   * (see mixedUnitColumns): bags and loads don't add.
   */
  columnTotals: Record<string, number | null>;
  mixedUnitColumns: string[];
};

function valueAtPath(row: unknown, path: string): ReportValue {
  let current: unknown = row;
  for (const part of path.split(".")) {
    if (current === null || current === undefined || typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[part];
    // A to-one embed can arrive as a one-element array.
    if (Array.isArray(current)) current = current[0];
  }
  if (current === undefined || current === null) return null;
  if (
    typeof current === "string" ||
    typeof current === "boolean" ||
    (typeof current === "number" && Number.isFinite(current))
  ) {
    return current;
  }
  return null;
}

// The "#" prefix can't collide with a field key (lowercase identifiers, enforced by
// datasets.test.ts).
export function identityKey(fieldKey: string): string {
  return `#id:${fieldKey}`;
}

// Fields with an identityPath also carry their id under identityKey(field), for count_distinct;
// never displayed.
export function extractRows(dataset: DatasetDef, raw: unknown[]): ReportRow[] {
  const fields = Object.entries(dataset.fields);
  // Derived fields run after every column field; a derived field never reads another derived one.
  const columnFields = fields.filter(([, field]) => !field.derive);
  const derivedFields = fields.filter(([, field]) => field.derive);
  return raw.map((row) => {
    const flat: ReportRow = {};
    for (const [key, field] of columnFields) {
      flat[key] = valueAtPath(row, field.path);
      if (field.identityPath) flat[identityKey(key)] = valueAtPath(row, field.identityPath);
    }
    for (const [key, field] of derivedFields) {
      const compute = DERIVED[field.derive!];
      flat[key] = compute ? compute(flat) : null;
    }
    return flat;
  });
}

function aggregateValues(values: ReportValue[], agg: Aggregate): number | null {
  if (agg === "count") {
    return values.filter((v) => v !== null).length;
  }
  if (agg === "count_distinct") {
    return new Set(values.filter((v) => v !== null)).size;
  }
  const numbers = values.filter((v): v is number => typeof v === "number");
  if (numbers.length === 0) return null;
  switch (agg) {
    case "sum":
      return numbers.reduce((a, b) => a + b, 0);
    case "avg":
      return numbers.reduce((a, b) => a + b, 0) / numbers.length;
    case "min":
      return Math.min(...numbers);
    case "max":
      return Math.max(...numbers);
  }
}

// Only a distinct count reads the identity; the "in" check lets test rows without it use the
// display value.
function sourceKey(dataset: DatasetDef, row: ReportRow, field: string, agg: Aggregate): string {
  if (agg !== "count_distinct" || !dataset.fields[field]?.identityPath) return field;
  const id = identityKey(field);
  return id in row ? id : field;
}

function measuresOver(
  dataset: DatasetDef,
  rows: ReportRow[],
  spec: ReportSpec,
): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const measure of spec.measures) {
    out[measureId(measure)] = aggregateValues(
      rows.map((row) => row[sourceKey(dataset, row, measure.field, measure.agg)] ?? null),
      measure.agg,
    );
  }
  return out;
}

function compareValues(a: ReportValue, b: ReportValue): number {
  // Nulls last, whichever direction — a missing value is never "first".
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  return String(a).localeCompare(String(b));
}

function sortDetail(rows: ReportRow[], spec: ReportSpec): ReportRow[] {
  if (spec.sort.length === 0) return rows;
  return [...rows].sort((a, b) => {
    for (const { field, dir } of spec.sort) {
      const cmp = compareValues(a[field] ?? null, b[field] ?? null);
      if (cmp !== 0) return dir === "desc" ? -cmp : cmp;
    }
    return 0;
  });
}

function sortGroups(groups: GroupRow[], spec: ReportSpec, keyIndex: number): GroupRow[] {
  // A sort entry naming a measure orders groups by it; naming the group's field orders by key.
  const entry = spec.sort.find(
    (s) => s.field === spec.groupBy[keyIndex] || spec.measures.some((m) => m.field === s.field),
  );
  const sorted = [...groups];
  if (entry && entry.field !== spec.groupBy[keyIndex]) {
    const measure = spec.measures.find((m) => m.field === entry.field);
    if (measure) {
      const id = measureId(measure);
      sorted.sort((a, b) => {
        const cmp = compareValues(a.measures[id] ?? null, b.measures[id] ?? null);
        return entry.dir === "desc" ? -cmp : cmp;
      });
      return sorted;
    }
  }
  sorted.sort((a, b) => {
    const cmp = compareValues(a.keys[keyIndex] ?? null, b.keys[keyIndex] ?? null);
    return entry && entry.field === spec.groupBy[keyIndex] && entry.dir === "desc" ? -cmp : cmp;
  });
  return sorted;
}

function groupRows(dataset: DatasetDef, rows: ReportRow[], spec: ReportSpec): GroupRow[] {
  const [outerField, innerField] = spec.groupBy;

  const outerMap = new Map<ReportValue, ReportRow[]>();
  for (const row of rows) {
    const key = row[outerField] ?? null;
    const bucket = outerMap.get(key);
    if (bucket) bucket.push(row);
    else outerMap.set(key, [row]);
  }

  const outers: GroupRow[] = [];
  for (const [key, bucket] of outerMap) {
    let children: GroupRow[] | null = null;
    if (innerField) {
      const innerMap = new Map<ReportValue, ReportRow[]>();
      for (const row of bucket) {
        const innerKey = row[innerField] ?? null;
        const innerBucket = innerMap.get(innerKey);
        if (innerBucket) innerBucket.push(row);
        else innerMap.set(innerKey, [row]);
      }
      children = [];
      for (const [innerKey, innerRows] of innerMap) {
        children.push({
          keys: [key, innerKey],
          measures: measuresOver(dataset, innerRows, spec),
          rowCount: innerRows.length,
          children: null,
        });
      }
      children = sortGroups(children, spec, 1);
    }
    // The outer group's measures come from its own rows; an avg of avgs is wrong.
    outers.push({
      keys: [key],
      measures: measuresOver(dataset, bucket, spec),
      rowCount: bucket.length,
      children,
    });
  }

  return sortGroups(outers, spec, 0);
}

// Pure: rows in, result out. matched is the database's exact count, never rows.length.
export function runReport(
  dataset: DatasetDef,
  spec: ReportSpec,
  rows: ReportRow[],
  matched: number,
): ReportResult {
  const sorted = sortDetail(rows, spec);
  const detail = sorted.slice(0, spec.limit);
  const { columnTotals, mixedUnitColumns } = totalsByColumn(dataset, spec.columns, rows);
  return {
    columns: spec.columns,
    detail,
    matched,
    truncated: detail.length < matched,
    groups: spec.groupBy.length > 0 ? groupRows(dataset, sorted, spec) : null,
    totals: measuresOver(dataset, rows, spec),
    columnTotals,
    mixedUnitColumns,
  };
}

export function totalsByColumn(
  dataset: DatasetDef,
  columns: string[],
  rows: ReportRow[],
): { columnTotals: Record<string, number | null>; mixedUnitColumns: string[] } {
  const unitField = Object.prototype.hasOwnProperty.call(dataset.fields, "uom") ? "uom" : null;
  const units = unitField
    ? new Set(rows.map((row) => row[unitField]).filter((unit) => unit !== null && unit !== ""))
    : new Set<ReportValue>();
  const mixedUnits = units.size > 1;

  const columnTotals: Record<string, number | null> = {};
  const mixedUnitColumns: string[] = [];
  for (const column of columns) {
    const field = dataset.fields[column];
    if (!field || (field.type !== "money" && field.type !== "number")) continue;
    if (field.type === "number" && mixedUnits) {
      columnTotals[column] = null;
      mixedUnitColumns.push(column);
      continue;
    }
    let sum: number | null = null;
    for (const row of rows) {
      const value = row[column];
      if (typeof value === "number" && Number.isFinite(value)) sum = (sum ?? 0) + value;
    }
    columnTotals[column] = sum === null ? null : Math.round(sum * 1e6) / 1e6;
  }
  return { columnTotals, mixedUnitColumns };
}
