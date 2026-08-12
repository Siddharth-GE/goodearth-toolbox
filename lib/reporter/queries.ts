import "server-only";

import { cache } from "react";

import { requireTool } from "@/lib/auth/access";
import { cleanSearch } from "@/lib/masters/paged";
import { listProjects } from "@/lib/masters/projects";
import { listUnits } from "@/lib/masters/units";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import { formatCount } from "@/lib/format";

import { extractRows, runReport, type ReportResult } from "./aggregate";
import { DATASETS } from "./datasets";
import { getStarter, isStarterId } from "./starters";
import {
  describeSpecLoss,
  MAX_REPORT_ROWS,
  parseReportSpec,
  type ReportFilter,
  type ReportSpec,
} from "./spec";

// The ONLY Reporter file that touches Supabase. Reads run under the
// signed-in user's own RLS through the normal server client — Reporter
// shows whatever the /reporter grant's policies let through, nothing
// more. Every string reaching a filter or select below has already been
// through parseReportSpec, so it is a registry constant, never input.

export type RunOutcome = { ok: true; result: ReportResult } | { ok: false; message: string };

/**
 * PostgREST's filter methods take the value as-is; the one injection
 * surface that actually exists is `,()` inside an .or()/.ilike() string,
 * so free-text goes through cleanSearch first (lib/masters/paged.ts).
 *
 * Generic in-and-out so the builder keeps its own type through the call
 * (`.order()`/`.range()` still chain after it); the structural view of
 * the filter methods lives in the one cast inside.
 */
type FilterMethods = {
  eq(column: string, value: unknown): FilterMethods;
  neq(column: string, value: unknown): FilterMethods;
  gt(column: string, value: unknown): FilterMethods;
  gte(column: string, value: unknown): FilterMethods;
  lt(column: string, value: unknown): FilterMethods;
  lte(column: string, value: unknown): FilterMethods;
  ilike(column: string, pattern: string): FilterMethods;
};

function applyFilters<Query>(
  query: Query,
  filters: ReportFilter[],
  columns: Record<string, string>,
): Query {
  let builder = query as unknown as FilterMethods;
  for (const filter of filters) {
    const column = columns[filter.field];
    if (!column) continue; // parser guarantees this; belt and braces
    switch (filter.op) {
      case "eq":
        builder = builder.eq(column, filter.value);
        break;
      case "neq":
        builder = builder.neq(column, filter.value);
        break;
      case "gt":
        builder = builder.gt(column, filter.value);
        break;
      case "gte":
        builder = builder.gte(column, filter.value);
        break;
      case "lt":
        builder = builder.lt(column, filter.value);
        break;
      case "lte":
        builder = builder.lte(column, filter.value);
        break;
      case "contains": {
        const cleaned = cleanSearch(String(filter.value));
        if (cleaned) builder = builder.ilike(column, `%${cleaned}%`);
        break;
      }
    }
  }
  return builder as unknown as Query;
}

/**
 * Run a parsed spec: exact-count probe first, refuse plainly above
 * MAX_REPORT_ROWS, otherwise fetch the COMPLETE filtered set and hand
 * it to the pure engine. Throws on a failed read, like every query —
 * a partial report is a wrong report.
 */
export async function runSpec(spec: ReportSpec): Promise<RunOutcome> {
  await requireTool("/reporter");
  const supabase = await createClient();

  const dataset = DATASETS[spec.dataset];
  const filterColumns: Record<string, string> = {};
  for (const [key, field] of Object.entries(dataset.fields)) {
    if (field.filterColumn) filterColumns[key] = field.filterColumn;
  }

  // The registry's source is a hand-authored table/view name, but the
  // typed client's .from() overloads want a schema literal it cannot
  // get from a string field. One documented bridge; what actually
  // guards the read is RLS plus the registry whitelist, not this type.
  const source = dataset.source as "indent_lines";

  // The probe: how many rows would this report load? `head: true` moves
  // no data. The count is exact, so the screen can honestly say "N of M".
  const probe = applyFilters(
    supabase.from(source).select(dataset.select, { count: "exact", head: true }),
    spec.filters,
    filterColumns,
  );
  const { count, error: probeError } = await probe;
  if (probeError) {
    console.error("runSpec count probe failed:", probeError);
    throw new Error(`The report could not be counted: ${probeError.message}`);
  }
  const matched = count ?? 0;

  if (matched > MAX_REPORT_ROWS) {
    return {
      ok: false,
      message:
        `This report matches ${formatCount(matched)} lines — more than the ` +
        `${formatCount(MAX_REPORT_ROWS)} it can load at once. Narrow it with a ` +
        `project or a date range and run it again.`,
    };
  }

  // fetchAll pages to completion and throws if a page fails. Ordered by
  // id for a stable page order; the report's own sort happens in the
  // pure engine, over the complete set.
  const raw = await fetchAll((from, to) =>
    applyFilters(
      supabase.from(source).select(dataset.select).order("id").range(from, to),
      spec.filters,
      filterColumns,
    ),
  );

  return { ok: true, result: runReport(dataset, spec, extractRows(dataset, raw), matched) };
}

/**
 * The same report for download. The spec's `limit` is a SCREEN setting
 * — "rows shown" — so a CSV lifts it to the load ceiling and carries
 * every matched line. Above that ceiling runSpec still refuses in
 * plain English rather than handing back a quietly partial file.
 */
export async function runSpecForCsv(spec: ReportSpec): Promise<RunOutcome> {
  return runSpec({ ...spec, limit: MAX_REPORT_ROWS });
}

// ---------------------------------------------------------------------
// Saved reports
// ---------------------------------------------------------------------
// A saved report is a NAME and a SPEC — a question, not an answer. It
// holds no figures: running it re-reads the live tables through the
// reader's own RLS, so the same report shows each person exactly what
// that person is allowed to see.

export type ReportSummary = {
  id: string;
  name: string;
  description: string | null;
  /** The dataset's label, or its key if the dataset has since gone. */
  datasetLabel: string;
  /** False when the spec names a dataset that no longer exists. */
  datasetExists: boolean;
  updated_at: string;
  updated_by_name: string | null;
};

export type LoadedReport = {
  id: string;
  name: string;
  description: string | null;
  spec: ReportSpec;
  /** True for a `starter:*` id — read-only, "Save a copy" only. */
  starter: boolean;
  /** Whether THIS user may delete it: their own, or an admin. */
  canDelete: boolean;
  updated_at: string | null;
  updated_by_name: string | null;
};

/**
 * Every saved report, newest touch first. fetchAll rather than a plain
 * select: this is the only way to reach a saved report, so a silent
 * 1,000-row cap would one day hide one.
 */
export async function listReports(): Promise<ReportSummary[]> {
  await requireTool("/reporter");
  const supabase = await createClient();

  const rows = await fetchAll((from, to) =>
    supabase
      .from("reports")
      .select("id, name, description, dataset, updated_at, updated_by")
      .order("updated_at", { ascending: false })
      .order("id")
      .range(from, to),
  );

  const names = await lookupNames(rows.map((row) => row.updated_by));

  return rows.map((row) => {
    const dataset = DATASETS[row.dataset];
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      datasetLabel: dataset?.label ?? row.dataset,
      datasetExists: Boolean(dataset),
      updated_at: row.updated_at,
      updated_by_name: row.updated_by ? (names.get(row.updated_by) ?? null) : null,
    };
  });
}

/**
 * One report by id — a `reports.id` uuid OR a `starter:*` id. One
 * screen, one code path, resolved here.
 *
 * Returns null for "no such report" AND for "not visible to you": RLS
 * makes those indistinguishable, and both end at notFound(), which is
 * the right answer to either.
 */
export const getReport = cache(async (reportId: string): Promise<LoadedReport | null> => {
  const user = await requireTool("/reporter");

  if (isStarterId(reportId)) {
    const starter = getStarter(reportId);
    if (!starter) return null;
    return {
      id: starter.id,
      name: starter.name,
      description: starter.description,
      spec: starter.spec,
      starter: true,
      canDelete: false,
      updated_at: null,
      updated_by_name: null,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reports")
    .select("id, name, description, spec, created_by, updated_at, updated_by")
    .eq("id", reportId)
    .maybeSingle();

  if (error) {
    console.error("getReport failed:", error);
    return null;
  }
  if (!data) return null;

  const names = await lookupNames([data.updated_by]);

  return {
    id: data.id,
    name: data.name,
    description: data.description,
    // The stored spec is untrusted in exactly the way a URL is: it was
    // written by an older version of this code. Unknown keys are
    // dropped rather than thrown, so an old report still opens.
    spec: parseReportSpec(data.spec),
    starter: false,
    // Mirrors the DELETE policy in 0054. The screen hides what the
    // database would refuse, rather than offering a button that fails.
    canDelete: user.profile?.role === "admin" || data.created_by === user.id,
    updated_at: data.updated_at,
    updated_by_name: data.updated_by ? (names.get(data.updated_by) ?? null) : null,
  };
});

/** What `describeSpecLoss` would say about a stored report, for the screen. */
export async function getReportSpecLoss(reportId: string): Promise<string[]> {
  await requireTool("/reporter");
  if (isStarterId(reportId)) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reports")
    .select("spec")
    .eq("id", reportId)
    .maybeSingle();
  if (error || !data) return [];
  return describeSpecLoss(data.spec);
}

/** Profile ids to display names, in one query, skipping the nulls. */
async function lookupNames(ids: (string | null)[]): Promise<Map<string, string | null>> {
  const unique = [...new Set(ids.filter((id): id is string => id != null))];
  if (unique.length === 0) return new Map();

  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").select("id, full_name").in("id", unique);
  if (error) {
    // A missing name is cosmetic — the report still opens, the byline
    // just shows a dash. Not worth failing a page over.
    console.error("lookupNames failed:", error);
    return new Map();
  }
  return new Map((data ?? []).map((profile) => [profile.id, profile.full_name]));
}

export type ProjectOption = { id: string; name: string };

/** Options for the project filter's picker. */
export async function listProjectOptions(): Promise<ProjectOption[]> {
  await requireTool("/reporter");
  const projects = await listProjects();
  return projects.map((project) => ({ id: project.id, name: project.name }));
}

export type UnitOption = { id: string; name: string; projectId: string };

/** Options for the unit filter's picker, grouped by project on screen. */
export async function listUnitOptions(): Promise<UnitOption[]> {
  await requireTool("/reporter");
  const units = await listUnits();
  return units.map((unit) => ({ id: unit.id, name: unit.name, projectId: unit.project_id }));
}

// Enough pages that every value a filter could need is present at
// today's scale, without re-reading the whole dataset just to fill
// dropdowns. If a dataset ever outgrows this, its rare values drop off
// the list — revisit with a real DISTINCT source then, not a bigger cap.
const OPTIONS_MAX_PAGES = 5;

/**
 * The distinct values behind every `filterOptions: "distinct"` field of
 * a dataset, keyed by field key — what the builder's dropdowns show.
 */
export async function listFilterOptions(datasetKey: string): Promise<Record<string, string[]>> {
  await requireTool("/reporter");
  const dataset = DATASETS[datasetKey];
  if (!dataset || !dataset.optionsSelect) return {};

  const distinctFields = Object.entries(dataset.fields).filter(
    ([, field]) => field.filterOptions === "distinct",
  );
  if (distinctFields.length === 0) return {};

  const supabase = await createClient();
  const source = dataset.source as "indent_lines";

  const PAGE_SIZE = 1000;
  const raw: unknown[] = [];
  for (let page = 0; page < OPTIONS_MAX_PAGES; page++) {
    const { data, error } = await supabase
      .from(source)
      .select(dataset.optionsSelect)
      .order("id")
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (error) {
      console.error("listFilterOptions failed:", error);
      throw new Error(`The filter choices could not be read: ${error.message}`);
    }
    raw.push(...(data ?? []));
    if ((data ?? []).length < PAGE_SIZE) break;
  }

  const rows = extractRows(dataset, raw);
  const options: Record<string, string[]> = {};
  for (const [key] of distinctFields) {
    const values = new Set<string>();
    for (const row of rows) {
      const value = row[key];
      if (typeof value === "string" && value.trim() !== "") values.add(value);
    }
    options[key] = [...values].sort((a, b) => a.localeCompare(b));
  }
  return options;
}
