/**
 * A ReportSpec is what the browser sends: which dataset, which columns,
 * filters, grouping, measures, sort and chart. It travels as
 * `?spec=<base64url JSON>` — shareable, bookmarkable, and therefore
 * UNTRUSTED. A hand-edited URL is just another input hitting the parser.
 *
 * `parseReportSpec` is the ONLY way untrusted JSON becomes a ReportSpec
 * — the same shape as lib/business-planning/inputs.ts, whose
 * parsePlanInputs guards a jsonb column the database cannot check. It
 * NEVER throws: aliases resolve first, unknowns are dropped (not
 * errored, so a report saved before a rename still opens), numbers are
 * clamped, and everything is capped so a spec is bounded. After it runs,
 * every string in the spec is provably a key of DATASETS — nothing a
 * user typed ever reaches a select, a filter column or an order clause.
 *
 * `describeSpecLoss` says in plain English what the parser dropped, so
 * the screen can tell the person instead of silently showing less.
 */

import {
  AGGREGATES,
  DATASETS,
  DEFAULT_DATASET,
  resolveFieldKey,
  type Aggregate,
  type FieldDef,
} from "./datasets";

export const REPORT_SCHEMA_VERSION = 1;

/**
 * Above this, the report refuses with a plain sentence rather than
 * silently truncating. Completeness is the point of a report; a partial
 * total is a wrong total.
 */
export const MAX_REPORT_ROWS = 50_000;

export const MAX_COLUMNS = 12;
export const MAX_FILTERS = 8;
export const MAX_GROUP_BY = 2;
export const MAX_MEASURES = 8;
export const MAX_SORTS = 3;

/** Detail rows shown on screen. Totals are computed over every row. */
export const MIN_LIMIT = 10;
export const MAX_LIMIT = 1_000;
export const DEFAULT_LIMIT = 100;

/** The longest string a filter value may carry. */
const MAX_FILTER_VALUE_LENGTH = 200;

export const OPS = ["eq", "neq", "gt", "gte", "lt", "lte", "contains"] as const;
export type Op = (typeof OPS)[number];

export const CHART_TYPES = ["bar", "hbar", "line", "area", "stacked", "meter"] as const;
export type ChartType = (typeof CHART_TYPES)[number];

export type ReportFilter = { field: string; op: Op; value: string | number | boolean };
export type ReportMeasure = { field: string; agg: Aggregate };
export type ReportSort = { field: string; dir: "asc" | "desc" };

export type ReportChart = {
  type: ChartType;
  /** Which groupBy field runs along the axis. Must be one of groupBy. */
  category: string;
  /**
   * Measure ids ("field:agg"), 1..8, order = palette slots, one shared
   * scale. Two measures of wildly different magnitude get two charts,
   * never two axes — dual-axis is impossible by construction.
   */
  measures: string[];
  /** Highlight one measure id; the rest go gray. */
  emphasis?: string;
};

export type ReportSpec = {
  schemaVersion: number;
  dataset: string;
  columns: string[];
  filters: ReportFilter[];
  groupBy: string[];
  measures: ReportMeasure[];
  sort: ReportSort[];
  limit: number;
  chart: ReportChart | null;
};

/** The one spelling of a measure's identity, used by chart + result maps. */
export function measureId(measure: { field: string; agg: string }): string {
  return `${measure.field}:${measure.agg}`;
}

/** Which operators a filter on this field may use. */
export function opsForField(field: FieldDef): Op[] {
  // Dropdown-backed fields (the founder's rule: choices, never typing)
  // take exactly is / is-not.
  if (field.lookup || field.filterOptions) return ["eq", "neq"];
  switch (field.type) {
    case "text":
      // No current field reaches here with a filterColumn — `contains`
      // is reserved for a future genuinely free-text search field.
      return ["eq", "neq", "contains"];
    case "number":
    case "money":
      return ["eq", "neq", "gt", "gte", "lt", "lte"];
    case "date":
      return ["gte", "lte"];
    case "bool":
      return ["eq"];
  }
}

/** A blank report on a dataset: its default columns and sort, nothing else. */
export function defaultSpec(datasetKey: string): ReportSpec {
  const key = Object.prototype.hasOwnProperty.call(DATASETS, datasetKey)
    ? datasetKey
    : DEFAULT_DATASET;
  const dataset = DATASETS[key];
  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    dataset: key,
    columns: [...dataset.defaultColumns],
    filters: [],
    groupBy: [],
    measures: [],
    sort: dataset.defaultSort.map((s) => ({ ...s })),
    limit: DEFAULT_LIMIT,
    chart: null,
  };
}

// ---------------------------------------------------------------------
// The parser — the only door in
// ---------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.round(Math.min(max, Math.max(min, n)));
}

/** ISO date, the value of an <input type="date">. Anything else is dropped. */
function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseFilterValue(field: FieldDef, raw: unknown): string | number | boolean | null {
  if (field.lookup) {
    return typeof raw === "string" && raw.length > 0 && raw.length <= MAX_FILTER_VALUE_LENGTH
      ? raw
      : null;
  }
  switch (field.type) {
    case "text": {
      if (typeof raw !== "string") return null;
      const trimmed = raw.trim().slice(0, MAX_FILTER_VALUE_LENGTH);
      return trimmed.length > 0 ? trimmed : null;
    }
    case "number":
    case "money":
      return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
    case "date":
      return isIsoDate(raw) ? raw : null;
    case "bool":
      return typeof raw === "boolean" ? raw : null;
  }
}

type ParseOutcome = { spec: ReportSpec; loss: string[] };

function parseWithLoss(raw: unknown): ParseOutcome {
  const loss: string[] = [];

  if (!isRecord(raw)) {
    return { spec: defaultSpec(DEFAULT_DATASET), loss };
  }

  // Dataset first — every other key resolves against it.
  let datasetKey: string;
  if (
    typeof raw.dataset === "string" &&
    Object.prototype.hasOwnProperty.call(DATASETS, raw.dataset)
  ) {
    datasetKey = raw.dataset;
  } else {
    datasetKey = DEFAULT_DATASET;
    if (raw.dataset !== undefined) {
      loss.push(
        `This report's data set no longer exists, so it opened on ${DATASETS[DEFAULT_DATASET].label} instead.`,
      );
    }
  }
  const dataset = DATASETS[datasetKey];

  // Columns — unknowns dropped, duplicates collapsed, empty falls back
  // to the dataset's defaults so the table is never blank.
  const columns: string[] = [];
  for (const rawKey of array(raw.columns).slice(0, MAX_COLUMNS * 2)) {
    const key = resolveFieldKey(dataset, rawKey);
    if (!key) {
      if (typeof rawKey === "string")
        loss.push(`The column "${rawKey}" was left out — it is no longer part of this data set.`);
      continue;
    }
    if (!columns.includes(key) && columns.length < MAX_COLUMNS) columns.push(key);
  }
  if (columns.length === 0) columns.push(...dataset.defaultColumns);

  // Filters — field must resolve, op must be legal for the field, value
  // must be the right shape. Anything else is dropped and said.
  const filters: ReportFilter[] = [];
  for (const entry of array(raw.filters).slice(0, MAX_FILTERS * 2)) {
    if (!isRecord(entry)) continue;
    const key = resolveFieldKey(dataset, entry.field);
    const field = key ? dataset.fields[key] : undefined;
    if (!key || !field || !field.filterColumn) {
      if (typeof entry.field === "string") loss.push(`A filter on "${entry.field}" was left out.`);
      continue;
    }
    const op = typeof entry.op === "string" ? (entry.op as Op) : null;
    if (!op || !opsForField(field).includes(op)) {
      loss.push(`A filter on ${field.label} was left out — its condition no longer applies.`);
      continue;
    }
    const value = parseFilterValue(field, entry.value);
    if (value === null) {
      loss.push(`A filter on ${field.label} was left out — its value was blank or unusable.`);
      continue;
    }
    if (filters.length < MAX_FILTERS) filters.push({ field: key, op, value });
  }

  // Group by — groupable fields only, at most two levels.
  const groupBy: string[] = [];
  for (const rawKey of array(raw.groupBy).slice(0, MAX_GROUP_BY * 2)) {
    const key = resolveFieldKey(dataset, rawKey);
    if (!key || !dataset.fields[key].groupable) {
      if (typeof rawKey === "string") loss.push(`Grouping by "${rawKey}" was left out.`);
      continue;
    }
    if (!groupBy.includes(key) && groupBy.length < MAX_GROUP_BY) groupBy.push(key);
  }

  // Measures — the field must allow the aggregate.
  const measures: ReportMeasure[] = [];
  for (const entry of array(raw.measures).slice(0, MAX_MEASURES * 2)) {
    if (!isRecord(entry)) continue;
    const key = resolveFieldKey(dataset, entry.field);
    const field = key ? dataset.fields[key] : undefined;
    const agg =
      typeof entry.agg === "string" && (AGGREGATES as readonly string[]).includes(entry.agg)
        ? (entry.agg as Aggregate)
        : null;
    if (!key || !field || !agg || !field.aggregates.includes(agg)) {
      if (typeof entry.field === "string") loss.push(`A measure on "${entry.field}" was left out.`);
      continue;
    }
    const id = measureId({ field: key, agg });
    if (!measures.some((m) => measureId(m) === id) && measures.length < MAX_MEASURES) {
      measures.push({ field: key, agg });
    }
  }

  // Sort — only fields that declare a sortColumn, or measures/groups
  // (which sort the grouped table in TypeScript).
  const sort: ReportSort[] = [];
  for (const entry of array(raw.sort).slice(0, MAX_SORTS * 2)) {
    if (!isRecord(entry)) continue;
    const key = resolveFieldKey(dataset, entry.field);
    if (!key) continue;
    const field = dataset.fields[key];
    const sortable =
      field.sortColumn || measures.some((m) => m.field === key) || groupBy.includes(key);
    if (!sortable) continue;
    const dir = entry.dir === "asc" ? "asc" : "desc";
    if (!sort.some((s) => s.field === key) && sort.length < MAX_SORTS)
      sort.push({ field: key, dir });
  }

  // Chart — parsed and validated here even before charts render (Stage
  // 3), so a saved spec never carries an impossible chart. A chart whose
  // category is not in groupBy is dropped, not rendered wrong.
  let chart: ReportChart | null = null;
  if (isRecord(raw.chart)) {
    const type =
      typeof raw.chart.type === "string" &&
      (CHART_TYPES as readonly string[]).includes(raw.chart.type)
        ? (raw.chart.type as ChartType)
        : null;
    const category = resolveFieldKey(dataset, raw.chart.category);
    const measureIds = measures.map((m) => measureId(m));
    let chartMeasures = array(raw.chart.measures)
      .filter((m): m is string => typeof m === "string" && measureIds.includes(m))
      .filter((m, i, all) => all.indexOf(m) === i)
      .slice(0, MAX_MEASURES);
    // A meter is one ratio against a limit — it carries one measure.
    if (type === "meter") chartMeasures = chartMeasures.slice(0, 1);
    if (type && category && groupBy.includes(category) && chartMeasures.length > 0) {
      const emphasis =
        typeof raw.chart.emphasis === "string" && chartMeasures.includes(raw.chart.emphasis)
          ? raw.chart.emphasis
          : undefined;
      chart = { type, category, measures: chartMeasures, ...(emphasis ? { emphasis } : {}) };
    } else {
      loss.push("The chart was left out — it no longer matches the report's grouping.");
    }
  }

  // Loss messages mention labels where they can; keep them deduplicated
  // so ten broken filters do not read as a wall.
  const dedupedLoss = loss.filter((message, i) => loss.indexOf(message) === i);

  return {
    spec: {
      schemaVersion: clampInt(raw.schemaVersion, REPORT_SCHEMA_VERSION, 1, REPORT_SCHEMA_VERSION),
      dataset: datasetKey,
      columns,
      filters,
      groupBy,
      measures,
      sort,
      limit: clampInt(raw.limit, DEFAULT_LIMIT, MIN_LIMIT, MAX_LIMIT),
      chart,
    },
    loss: dedupedLoss,
  };
}

/** The only way untrusted JSON becomes a ReportSpec. Never throws. */
export function parseReportSpec(raw: unknown): ReportSpec {
  return parseWithLoss(raw).spec;
}

/** Plain-English list of what parsing dropped, for the screen to show. */
export function describeSpecLoss(raw: unknown): string[] {
  return parseWithLoss(raw).loss;
}

// ---------------------------------------------------------------------
// The URL round trip
// ---------------------------------------------------------------------
// base64url so the spec survives copy-paste, chat apps and bookmarks.
// TextEncoder/TextDecoder around btoa/atob for UTF-8 safety — a filter
// value can legitimately carry a Malayalam item name.

export function encodeSpec(spec: ReportSpec): string {
  const bytes = new TextEncoder().encode(JSON.stringify(spec));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * The raw `?spec=` value back to unknown JSON, for the parser. Returns
 * null for anything unreadable — never throws, a mangled URL is just an
 * empty report.
 */
export function decodeSpecParam(raw: string | string[] | undefined): unknown {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || typeof value !== "string" || value.length > 20_000) return null;
  try {
    const b64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

/** Non-null when the spec came from the URL and read cleanly. */
export function specFromParam(raw: string | string[] | undefined): ReportSpec | null {
  const decoded = decodeSpecParam(raw);
  return decoded === null ? null : parseReportSpec(decoded);
}

// ---------------------------------------------------------------------
// What the builder screen needs to know
// ---------------------------------------------------------------------
// A serialisable view of one dataset for the Client Component: keys,
// labels and what each field may legally do — never paths, selects or
// filter columns, which stay server-side.

export type BuilderField = {
  key: string;
  label: string;
  type: FieldDef["type"];
  /** Empty = this field can never be filtered. */
  ops: Op[];
  groupable: boolean;
  aggregates: Aggregate[];
  sortable: boolean;
  lookup?: "projects" | "units";
  /** Value control is a dropdown of the data's own distinct values. */
  distinct?: true;
};

export type BuilderDataset = {
  key: string;
  label: string;
  description: string;
  fields: BuilderField[];
};

export function builderDataset(datasetKey: string): BuilderDataset {
  const key = Object.prototype.hasOwnProperty.call(DATASETS, datasetKey)
    ? datasetKey
    : DEFAULT_DATASET;
  const dataset = DATASETS[key];
  return {
    key,
    label: dataset.label,
    description: dataset.description,
    fields: Object.entries(dataset.fields).map(([fieldKey, field]) => ({
      key: fieldKey,
      label: field.label,
      type: field.type,
      ops: field.filterColumn ? opsForField(field) : [],
      groupable: field.groupable,
      aggregates: field.aggregates,
      sortable: Boolean(field.sortColumn),
      ...(field.lookup ? { lookup: field.lookup } : {}),
      ...(field.filterOptions === "distinct" ? { distinct: true as const } : {}),
    })),
  };
}
