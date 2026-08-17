/**
 * Grouping, aggregation, subtotals and totals — in pure TypeScript, not
 * SQL. PostgREST cannot do arbitrary GROUP BY; the SQL alternatives are
 * a `security definer` runner (reads past every policy) or a pile of
 * RLS-bypassing views — the same hazard as a definer function with no
 * permission check in its body, multiplied by every dataset.
 * TypeScript also puts the arithmetic behind a leadership report where
 * `npm test` can cover it — the same reasoning that put runScenario in
 * lib/business-planning/model.ts rather than in SQL.
 *
 * The rule the tests lock down: NULLS ARE SKIPPED, NOT ZEROED. An
 * unpriced line and a free line are different things, and a sum over
 * nothing is null, never 0.
 *
 * The second rule: A DISTINCT COUNT COUNTS THINGS, NOT LABELS. Where a
 * field declares an `identityPath`, extractRows carries that id along
 * beside the display value and `count_distinct` counts the ids — so
 * five different armchairs all named "Armchair" count as five.
 */

import type { Aggregate, DatasetDef } from "./datasets";
import { DERIVED } from "./derive";
import { measureId, type ReportSpec } from "./spec";

export type ReportValue = string | number | boolean | null;
export type ReportRow = Record<string, ReportValue>;

/** One group of the grouped table; children when grouping is two-level. */
export type GroupRow = {
  /** The group's key values, outer first. */
  keys: ReportValue[];
  /** Aggregated values keyed by measure id ("field:agg"). */
  measures: Record<string, number | null>;
  rowCount: number;
  children: GroupRow[] | null;
};

export type ReportResult = {
  columns: string[];
  /** Detail rows: sorted, cut to spec.limit. */
  detail: ReportRow[];
  /** Rows the filters matched — what totals are computed over. */
  matched: number;
  /** True when detail shows fewer rows than matched. */
  truncated: boolean;
  /** Present when the spec groups; replaces the detail view. */
  groups: GroupRow[] | null;
  /** Grand totals keyed by measure id, over every matched row. */
  totals: Record<string, number | null>;
};

// ---------------------------------------------------------------------
// Row extraction
// ---------------------------------------------------------------------

function valueAtPath(row: unknown, path: string): ReportValue {
  let current: unknown = row;
  for (const part of path.split(".")) {
    if (current === null || current === undefined || typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[part];
    // A to-one embed can come back as a one-element array depending on
    // how PostgREST sees the relationship; take the row rather than fail.
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

/**
 * Where a field's identity value sits in an extracted row. Field keys
 * are plain lowercase identifiers (datasets.test.ts enforces it), so
 * the "#" prefix can never collide with one.
 */
export function identityKey(fieldKey: string): string {
  return `#id:${fieldKey}`;
}

/**
 * Raw PostgREST rows (nested embeds and all) flattened to one value per
 * registry field, keyed by field key. Missing anything becomes null.
 * Fields declaring an `identityPath` also carry their id under
 * `identityKey(field)`, for count_distinct — never displayed.
 */
export function extractRows(dataset: DatasetDef, raw: unknown[]): ReportRow[] {
  const fields = Object.entries(dataset.fields);
  // Columns first, derived second, so a derived field reads the row's
  // other fields after every one of them exists. datasets.test.ts
  // asserts a derived field never reads another derived field.
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

// ---------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------

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

/**
 * Which key a measure reads. Only a distinct count switches to the
 * identity — a `count` counts values present, and every other aggregate
 * is arithmetic on the value itself. The `in` check lets rows that did
 * not come through extractRows (tests, and only tests) fall back to the
 * display value rather than counting nothing.
 */
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

// ---------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------

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
  // A sort entry naming a measure orders groups by that measure; one
  // naming the group's own field orders by key. Otherwise keys ascend.
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

// ---------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------

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
    // The outer group's measures come from ITS OWN rows, not from
    // combining child aggregates — an avg of avgs is wrong.
    outers.push({
      keys: [key],
      measures: measuresOver(dataset, bucket, spec),
      rowCount: bucket.length,
      children,
    });
  }

  return sortGroups(outers, spec, 0);
}

/**
 * The whole report from the complete filtered row set. Pure: rows in,
 * result out. `matched` is the database's exact count, carried through
 * so screens never derive a total from rows.length.
 */
export function runReport(
  dataset: DatasetDef,
  spec: ReportSpec,
  rows: ReportRow[],
  matched: number,
): ReportResult {
  const sorted = sortDetail(rows, spec);
  const detail = sorted.slice(0, spec.limit);
  return {
    columns: spec.columns,
    detail,
    matched,
    truncated: detail.length < matched,
    groups: spec.groupBy.length > 0 ? groupRows(dataset, sorted, spec) : null,
    totals: measuresOver(dataset, rows, spec),
  };
}
