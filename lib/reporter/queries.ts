import "server-only";

import { cache } from "react";

import { requireTool } from "@/lib/auth/access";
import { cleanSearch } from "@/lib/masters/paged";
import { profileNames } from "@/lib/masters/names";
import { listProjects } from "@/lib/masters/projects";
import { listUnits } from "@/lib/masters/units";
import { listVendors } from "@/lib/masters/vendors";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { assertRead } from "@/lib/supabase/read-failed";
import { createClient } from "@/lib/supabase/server";
import { formatCount } from "@/lib/format";

import { extractRows, identityKey, runReport, type ReportResult, type ReportRow } from "./aggregate"; // prettier-ignore
import { DATASETS } from "./datasets";
import { getStarter, isStarterId } from "./starters";
import {
  describeSpecLoss,
  MAX_REPORT_ROWS,
  parseReportSpec,
  type ReportFilter,
  type ReportSpec,
} from "./spec";

// The ONLY Reporter file that touches Supabase, under the signed-in user's own RLS. Every string
// reaching a filter or select has been through parseReportSpec, so it is a registry constant, never
// input.

export type RunOutcome = { ok: true; result: ReportResult } | { ok: false; message: string };

// The one injection surface is `,()` inside an .or()/.ilike() string, so free text goes through
// cleanSearch first (lib/masters/paged.ts). Generic in and out so the builder keeps its type; the
// structural cast lives inside.
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

// Exact-count probe first, refuse above MAX_REPORT_ROWS, else fetch the COMPLETE set (a partial
// report is a wrong report). Throws on a failed read.
export async function runSpec(spec: ReportSpec): Promise<RunOutcome> {
  await requireTool("/reporter");
  const supabase = await createClient();

  const dataset = DATASETS[spec.dataset];
  const filterColumns: Record<string, string> = {};
  for (const [key, field] of Object.entries(dataset.fields)) {
    if (field.filterColumn) filterColumns[key] = field.filterColumn;
  }

  // .from() wants a schema literal it can't get from a string field. This single cast is the
  // bridge; the real guard is RLS plus the registry whitelist (datasets.test.ts pins every source
  // to KNOWN_SOURCES).
  const source = dataset.source as "indent_lines";

  // Head-only exact count, so the screen can honestly say "N of M".
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

  // Ordered by the dataset's pageOrder for a stable page order; the report's own sort happens in
  // the pure engine.
  const raw = await fetchAll((from, to) => {
    let query = supabase.from(source).select(dataset.select);
    for (const column of dataset.pageOrder ?? ["id"]) query = query.order(column);
    return applyFilters(query.range(from, to), spec.filters, filterColumns);
  });

  let rows = extractRows(dataset, raw);
  if (dataset.enrich === "stock_names") rows = await enrichStockNames(rows);

  return { ok: true, result: runReport(dataset, spec, rows, matched) };
}

// A view declares no FKs, so PostgREST can't embed names through it: look up only the ids present,
// chunked under URL limits. A missing name renders null.
async function enrichStockNames(rows: ReportRow[]): Promise<ReportRow[]> {
  const supabase = await createClient();

  const ids = (key: string) => [
    ...new Set(
      rows
        .map((row) => row[identityKey(key)])
        .filter((value): value is string => typeof value === "string"),
    ),
  ];

  const CHUNK = 150;
  async function lookup(
    table: "items" | "stores" | "plots",
    wanted: string[],
    columns: string,
  ): Promise<Map<string, Record<string, unknown>>> {
    const found = new Map<string, Record<string, unknown>>();
    for (let i = 0; i < wanted.length; i += CHUNK) {
      const { data, error } = await supabase
        .from(table)
        .select(columns)
        .in("id", wanted.slice(i, i + CHUNK));
      if (error) {
        console.error(`enrichStockNames ${table} lookup failed:`, error);
        throw new Error(`The ${table} names could not be read: ${error.message}`);
      }
      for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
        found.set(String(row.id), row);
      }
    }
    return found;
  }

  const [items, stores, plots] = await Promise.all([
    lookup("items", ids("item"), "id, name, code"),
    lookup("stores", ids("location"), "id, name"),
    lookup("plots", ids("location"), "id, name"),
  ]);

  return rows.map((row) => {
    const item = items.get(String(row[identityKey("item")]));
    const locationId = String(row[identityKey("location")]);
    // location_id is a store or a plot id depending on kind (0029 folded unit stock into plots).
    const location = stores.get(locationId) ?? plots.get(locationId);
    return {
      ...row,
      item: (item?.name as string | undefined) ?? null,
      item_code: (item?.code as string | undefined) ?? null,
      location: (location?.name as string | undefined) ?? null,
    };
  });
}

// The spec's `limit` is a screen setting, so a CSV lifts it to the load ceiling; above that runSpec
// still refuses rather than hand back a partial file.
export async function runSpecForCsv(spec: ReportSpec): Promise<RunOutcome> {
  return runSpec({ ...spec, limit: MAX_REPORT_ROWS });
}

export type ReportSummary = {
  id: string;
  name: string;
  description: string | null;
  datasetLabel: string;
  datasetExists: boolean;
  updated_at: string;
  updated_by_name: string | null;
};

export type LoadedReport = {
  id: string;
  name: string;
  description: string | null;
  spec: ReportSpec;
  starter: boolean;
  canDelete: boolean;
  updated_at: string | null;
  updated_by_name: string | null;
};

export async function getWelcomeCounts() {
  await requireTool("/reporter");
  const supabase = await createClient();

  const saved = await supabase.from("reports").select("id", { count: "exact", head: true });

  assertRead("reporter", "the saved reports", saved.error);

  return { saved: saved.count ?? 0 };
}

// fetchAll, not a plain select: a silent 1,000-row cap would one day hide a report.
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

  const names = await profileNames(
    supabase,
    rows.map((row) => row.updated_by),
  );

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

// A reports.id uuid or a `starter-*` id. Null for "no such report" and "not visible to you": RLS
// makes them indistinguishable.
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

  assertRead("reporter", "the report", error);
  if (!data) return null;

  const names = await profileNames(supabase, [data.updated_by]);

  return {
    id: data.id,
    name: data.name,
    description: data.description,
    // The stored spec is untrusted like a URL; unknown keys are dropped so an old report still
    // opens.
    spec: parseReportSpec(data.spec),
    starter: false,
    // Mirrors the DELETE policy in 0054, so the screen doesn't offer a button that fails.
    canDelete: user.profile?.role === "admin" || data.created_by === user.id,
    updated_at: data.updated_at,
    updated_by_name: data.updated_by ? (names.get(data.updated_by) ?? null) : null,
  };
});

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

export type ProjectOption = { id: string; name: string };

export async function listProjectOptions(): Promise<ProjectOption[]> {
  await requireTool("/reporter");
  const projects = await listProjects();
  return projects.map((project) => ({ id: project.id, name: project.name }));
}

export type UnitOption = { id: string; name: string; projectId: string };

export async function listUnitOptions(): Promise<UnitOption[]> {
  await requireTool("/reporter");
  const units = await listUnits();
  return units.map((unit) => ({ id: unit.id, name: unit.name, projectId: unit.project_id }));
}

export type VendorOption = { id: string; name: string };

// All vendors, not active-only: old lines belong to vendors nobody buys from now.
export async function listVendorOptions(): Promise<VendorOption[]> {
  await requireTool("/reporter");
  const vendors = await listVendors();
  return vendors.map((vendor) => ({ id: vendor.id, name: vendor.name }));
}

// Enough pages for every filter value at today's scale; past that, use a real DISTINCT source, not
// a bigger cap.
const OPTIONS_MAX_PAGES = 5;

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
    let query = supabase.from(source).select(dataset.optionsSelect);
    for (const column of dataset.pageOrder ?? ["id"]) query = query.order(column);
    const { data, error } = await query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
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
