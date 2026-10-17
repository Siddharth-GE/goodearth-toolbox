// A ReportSpec travels as `?spec=<base64url JSON>`, so it is UNTRUSTED. parseReportSpec is the only
// way JSON becomes one: it never throws, drops unknowns (so a report saved before a rename still
// opens), clamps numbers and caps sizes. Afterwards every string is provably a DATASETS key, so
// nothing typed reaches a select, filter column or order clause.

import {
  AGGREGATES,
  DATASETS,
  DEFAULT_DATASET,
  resolveFieldKey,
  type Aggregate,
  type FieldDef,
} from "./datasets";

export const REPORT_SCHEMA_VERSION = 1;

// Above this the report refuses in plain words: a partial total is a wrong total.
export const MAX_REPORT_ROWS = 50_000;

export const MAX_COLUMNS = 12;
export const MAX_FILTERS = 8;
export const MAX_GROUP_BY = 2;
export const MAX_MEASURES = 8;
export const MAX_SORTS = 3;

export const MIN_LIMIT = 10;
export const MAX_LIMIT = 1_000;
export const DEFAULT_LIMIT = 100;

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
  category: string;
  // Measure ids ("field:agg"), 1..8, one shared scale; very different magnitudes get two charts,
  // never two axes.
  measures: string[];
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

export function measureId(measure: { field: string; agg: string }): string {
  return `${measure.field}:${measure.agg}`;
}

export function opsForField(field: FieldDef): Op[] {
  // Dropdown-backed fields take exactly is / is-not.
  if (field.lookup || field.filterOptions) return ["eq", "neq"];
  switch (field.type) {
    case "text":
      // `contains` is reserved for a future free-text field.
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

  // Empty falls back to the dataset's defaults so the table is never blank.
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

  const groupBy: string[] = [];
  for (const rawKey of array(raw.groupBy).slice(0, MAX_GROUP_BY * 2)) {
    const key = resolveFieldKey(dataset, rawKey);
    if (!key || !dataset.fields[key].groupable) {
      if (typeof rawKey === "string") loss.push(`Grouping by "${rawKey}" was left out.`);
      continue;
    }
    if (!groupBy.includes(key) && groupBy.length < MAX_GROUP_BY) groupBy.push(key);
  }

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

  // Only fields with a sortColumn, or measures/groups (sorted in TypeScript).
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

  // A chart whose category is not in groupBy is dropped, not rendered wrong.
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
    // A meter is the value, then the limit, and nothing else.
    if (type === "meter") chartMeasures = chartMeasures.slice(0, 2);
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

  // Deduplicated so ten broken filters don't read as a wall.
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

export function parseReportSpec(raw: unknown): ReportSpec {
  return parseWithLoss(raw).spec;
}

export function describeSpecLoss(raw: unknown): string[] {
  return parseWithLoss(raw).loss;
}

// base64url so the spec survives copy-paste; TextEncoder around btoa for UTF-8 (Malayalam names).

export function encodeSpec(spec: ReportSpec): string {
  const bytes = new TextEncoder().encode(JSON.stringify(spec));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Null for anything unreadable: a mangled URL is just an empty report.
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

export function specFromParam(raw: string | string[] | undefined): ReportSpec | null {
  const decoded = decodeSpecParam(raw);
  return decoded === null ? null : parseReportSpec(decoded);
}

// Serialisable view for the Client Component: never paths, selects or filter columns.

export type BuilderField = {
  key: string;
  label: string;
  type: FieldDef["type"];
  ops: Op[];
  groupable: boolean;
  aggregates: Aggregate[];
  sortable: boolean;
  lookup?: "projects" | "units" | "vendors";
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

// Each writes an ordinary picker filter into the spec, so saved reports, CSV and PDF see what the
// screen does and the parser stays the only door.

export type QuickFilterKind = "date" | "project" | "unit" | "vendor";
export type QuickFilterFields = Partial<Record<QuickFilterKind, string>>;
export type QuickFilterValues = {
  from?: string;
  to?: string;
  project?: string;
  unit?: string;
  vendor?: string;
};

export function quickFilterFields(datasetKey: string): QuickFilterFields {
  const dataset = DATASETS[datasetKey];
  if (!dataset) return {};
  const fields: QuickFilterFields = {};
  for (const [key, field] of Object.entries(dataset.fields)) {
    if (!field.filterColumn) continue;
    if (!fields.date && field.type === "date") fields.date = key;
    if (field.lookup === "projects" && !fields.project) fields.project = key;
    if (field.lookup === "units" && !fields.unit) fields.unit = key;
    if (field.lookup === "vendors" && !fields.vendor) fields.vendor = key;
  }
  return fields;
}

export function readQuickFilters(spec: ReportSpec, fields: QuickFilterFields): QuickFilterValues {
  const find = (field: string | undefined, op: Op) =>
    field
      ? spec.filters.find((filter) => filter.field === field && filter.op === op)?.value
      : undefined;
  const text = (value: unknown) => (typeof value === "string" ? value : undefined);
  return {
    from: text(find(fields.date, "gte")),
    to: text(find(fields.date, "lte")),
    project: text(find(fields.project, "eq")),
    unit: text(find(fields.unit, "eq")),
    vendor: text(find(fields.vendor, "eq")),
  };
}

// Replaces each quick filter's own filter, keeps the rest, and re-parses so it stays bounded. An
// empty value removes it.
export function applyQuickFilters(
  spec: ReportSpec,
  fields: QuickFilterFields,
  values: QuickFilterValues,
): ReportSpec {
  const owned = (filter: ReportFilter) =>
    (filter.field === fields.date && (filter.op === "gte" || filter.op === "lte")) ||
    (filter.op === "eq" &&
      (filter.field === fields.project ||
        filter.field === fields.unit ||
        filter.field === fields.vendor));
  const next: ReportFilter[] = [];
  if (fields.date && values.from) next.push({ field: fields.date, op: "gte", value: values.from });
  if (fields.date && values.to) next.push({ field: fields.date, op: "lte", value: values.to });
  if (fields.project && values.project)
    next.push({ field: fields.project, op: "eq", value: values.project });
  if (fields.unit && values.unit) next.push({ field: fields.unit, op: "eq", value: values.unit });
  if (fields.vendor && values.vendor)
    next.push({ field: fields.vendor, op: "eq", value: values.vendor });
  return parseReportSpec({
    ...spec,
    filters: [...next, ...spec.filters.filter((filter) => !owned(filter))],
  });
}
