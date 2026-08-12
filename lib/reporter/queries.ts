import "server-only";

import { requireTool } from "@/lib/auth/access";
import { cleanSearch } from "@/lib/masters/paged";
import { listProjects } from "@/lib/masters/projects";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import { formatCount } from "@/lib/format";

import { extractRows, runReport, type ReportResult } from "./aggregate";
import { DATASETS } from "./datasets";
import { MAX_REPORT_ROWS, type ReportFilter, type ReportSpec } from "./spec";

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

export type ProjectOption = { id: string; name: string };

/** Options for the project filter's picker. */
export async function listProjectOptions(): Promise<ProjectOption[]> {
  await requireTool("/reporter");
  const projects = await listProjects();
  return projects.map((project) => ({ id: project.id, name: project.name }));
}
