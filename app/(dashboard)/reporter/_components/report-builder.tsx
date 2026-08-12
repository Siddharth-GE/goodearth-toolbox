"use client";

/**
 * The builder half of a report. Owns a DRAFT of the spec; "Run report"
 * writes it to `?spec=` and the Server Component re-runs the query —
 * the trail-filters pattern, with the whole spec in one param so a
 * report link is shareable and bookmarkable. The parent keys this
 * component on the raw param, so navigation remounts it in sync.
 *
 * Nothing typed here reaches the database as anything but a VALUE:
 * every field, op and aggregate is a registry key, re-validated
 * server-side by parseReportSpec. This screen just refuses to offer
 * illegal combinations in the first place.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { Aggregate } from "@/lib/reporter/datasets";
import {
  MAX_FILTERS,
  MAX_MEASURES,
  MAX_SORTS,
  defaultSpec,
  encodeSpec,
  parseReportSpec,
  type BuilderDataset,
  type BuilderField,
  type Op,
  type ReportSpec,
} from "@/lib/reporter/spec";

import { aggLabel, opLabel } from "./labels";

type UiFilter = { field: string; op: Op; value: string };
type UiMeasure = { field: string; agg: Aggregate };
type UiSort = { field: string; dir: "asc" | "desc" };

export type ProjectOption = { id: string; name: string };

function toUiFilters(spec: ReportSpec): UiFilter[] {
  return spec.filters.map((filter) => ({
    field: filter.field,
    op: filter.op,
    value: String(filter.value),
  }));
}

export function ReportBuilder({
  dataset,
  spec,
  projects,
}: {
  dataset: BuilderDataset;
  spec: ReportSpec;
  projects: ProjectOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [columns, setColumns] = useState<string[]>(spec.columns);
  const [filters, setFilters] = useState<UiFilter[]>(toUiFilters(spec));
  const [groupBy, setGroupBy] = useState<string[]>(spec.groupBy);
  const [measures, setMeasures] = useState<UiMeasure[]>(spec.measures);
  const [sort, setSort] = useState<UiSort[]>(spec.sort);
  const [limit, setLimit] = useState<number>(spec.limit);

  const byKey = new Map(dataset.fields.map((field) => [field.key, field]));
  const filterable = dataset.fields.filter((field) => field.ops.length > 0);
  const groupable = dataset.fields.filter((field) => field.groupable);
  const aggregatable = dataset.fields.filter((field) => field.aggregates.length > 0);
  const sortable = dataset.fields.filter((field) => field.sortable);

  const run = () => {
    // An unfinished filter row (blank value) is dropped quietly here —
    // sending it would only earn a "left out" note from the parser.
    const draft = parseReportSpec({
      ...spec,
      dataset: dataset.key,
      columns,
      filters: filters
        .filter((filter) => filter.value.trim() !== "")
        .map((filter) => {
          const field = byKey.get(filter.field);
          const value =
            field?.type === "number" || field?.type === "money"
              ? Number(filter.value)
              : field?.type === "bool"
                ? filter.value === "true"
                : filter.value;
          return { field: filter.field, op: filter.op, value };
        }),
      groupBy,
      measures,
      sort,
      limit,
    });
    startTransition(() => {
      router.push(`/reporter/run?spec=${encodeSpec(draft)}`);
    });
  };

  const reset = () => {
    const blank = defaultSpec(dataset.key);
    setColumns(blank.columns);
    setFilters([]);
    setGroupBy([]);
    setMeasures([]);
    setSort(blank.sort);
    setLimit(blank.limit);
  };

  const toggleColumn = (key: string) => {
    setColumns((current) =>
      current.includes(key) ? current.filter((k) => k !== key) : [...current, key],
    );
  };

  const setFilter = (index: number, next: Partial<UiFilter>) => {
    setFilters((current) =>
      current.map((filter, i) => {
        if (i !== index) return filter;
        // A new field brings its own legal ops; keep the op if it still
        // applies, otherwise fall to the field's first.
        if (next.field && next.field !== filter.field) {
          const field = byKey.get(next.field);
          const ops = field?.ops ?? [];
          return {
            field: next.field,
            op: ops.includes(filter.op) ? filter.op : (ops[0] ?? "eq"),
            value: "",
          };
        }
        return { ...filter, ...next };
      }),
    );
  };

  const setMeasure = (index: number, next: Partial<UiMeasure>) => {
    setMeasures((current) =>
      current.map((measure, i) => {
        if (i !== index) return measure;
        if (next.field && next.field !== measure.field) {
          const aggregates = byKey.get(next.field)?.aggregates ?? [];
          return {
            field: next.field,
            agg: aggregates.includes(measure.agg) ? measure.agg : (aggregates[0] ?? "count"),
          };
        }
        return { ...measure, ...next };
      }),
    );
  };

  const sectionLabel = "text-muted text-xs font-semibold tracking-widest uppercase";
  const compactSelect = "h-9 w-auto min-w-32 text-xs";

  return (
    <Card className="space-y-5 p-4 sm:p-5">
      {/* Columns */}
      <div className="space-y-2">
        <p className={sectionLabel}>Columns</p>
        <div className="flex flex-wrap gap-1.5">
          {dataset.fields.map((field) => {
            const on = columns.includes(field.key);
            return (
              <button
                key={field.key}
                type="button"
                aria-pressed={on}
                onClick={() => toggleColumn(field.key)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  on
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-border text-muted hover:text-foreground",
                )}
              >
                {field.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-2">
        <p className={sectionLabel}>Filters</p>
        {filters.length === 0 && (
          <p className="text-muted text-xs">No filters — the report covers every line.</p>
        )}
        <div className="space-y-2">
          {filters.map((filter, index) => {
            const field = byKey.get(filter.field);
            if (!field) return null;
            return (
              <div key={index} className="flex flex-wrap items-center gap-2">
                <Select
                  aria-label="Filter field"
                  value={filter.field}
                  onChange={(e) => setFilter(index, { field: e.target.value })}
                  className={compactSelect}
                >
                  {filterable.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </Select>
                <Select
                  aria-label="Filter condition"
                  value={filter.op}
                  onChange={(e) => setFilter(index, { op: e.target.value as Op })}
                  className={compactSelect}
                >
                  {field.ops.map((op) => (
                    <option key={op} value={op}>
                      {opLabel(op, field.type)}
                    </option>
                  ))}
                </Select>
                <FilterValue
                  field={field}
                  value={filter.value}
                  projects={projects}
                  onChange={(value) => setFilter(index, { value })}
                />
                <button
                  type="button"
                  aria-label="Remove this filter"
                  onClick={() => setFilters((current) => current.filter((_, i) => i !== index))}
                  className="text-muted hover:text-foreground p-1 transition-colors"
                >
                  <X className="size-4" />
                </button>
              </div>
            );
          })}
        </div>
        {filters.length < MAX_FILTERS && filterable.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setFilters((current) => [
                ...current,
                { field: filterable[0].key, op: filterable[0].ops[0], value: "" },
              ])
            }
          >
            <Plus className="size-4" /> Add a filter
          </Button>
        )}
      </div>

      {/* Group & measure */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <p className={sectionLabel}>Group by</p>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              aria-label="Group by"
              value={groupBy[0] ?? ""}
              onChange={(e) => {
                const value = e.target.value;
                setGroupBy(value ? [value, ...groupBy.slice(1).filter((g) => g !== value)] : []);
              }}
              className={compactSelect}
            >
              <option value="">No grouping</option>
              {groupable.map((field) => (
                <option key={field.key} value={field.key}>
                  {field.label}
                </option>
              ))}
            </Select>
            {groupBy.length > 0 && (
              <Select
                aria-label="Then group by"
                value={groupBy[1] ?? ""}
                onChange={(e) => {
                  const value = e.target.value;
                  setGroupBy(value ? [groupBy[0], value] : [groupBy[0]]);
                }}
                className={compactSelect}
              >
                <option value="">then —</option>
                {groupable
                  .filter((field) => field.key !== groupBy[0])
                  .map((field) => (
                    <option key={field.key} value={field.key}>
                      then {field.label}
                    </option>
                  ))}
              </Select>
            )}
          </div>
          {groupBy.length > 0 && measures.length === 0 && (
            <p className="text-muted text-xs">Add a measure to put numbers against each group.</p>
          )}
        </div>

        <div className="space-y-2">
          <p className={sectionLabel}>Measures</p>
          <div className="space-y-2">
            {measures.map((measure, index) => {
              const field = byKey.get(measure.field);
              return (
                <div key={index} className="flex flex-wrap items-center gap-2">
                  <Select
                    aria-label="Measure"
                    value={measure.agg}
                    onChange={(e) => setMeasure(index, { agg: e.target.value as Aggregate })}
                    className={compactSelect}
                  >
                    {(field?.aggregates ?? []).map((agg) => (
                      <option key={agg} value={agg}>
                        {aggLabel(agg)}
                      </option>
                    ))}
                  </Select>
                  <span className="text-muted text-xs">of</span>
                  <Select
                    aria-label="Measure field"
                    value={measure.field}
                    onChange={(e) => setMeasure(index, { field: e.target.value })}
                    className={compactSelect}
                  >
                    {aggregatable.map((f) => (
                      <option key={f.key} value={f.key}>
                        {f.label}
                      </option>
                    ))}
                  </Select>
                  <button
                    type="button"
                    aria-label="Remove this measure"
                    onClick={() => setMeasures((current) => current.filter((_, i) => i !== index))}
                    className="text-muted hover:text-foreground p-1 transition-colors"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              );
            })}
          </div>
          {measures.length < MAX_MEASURES && aggregatable.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setMeasures((current) => [
                  ...current,
                  { field: aggregatable[0].key, agg: aggregatable[0].aggregates[0] },
                ])
              }
            >
              <Plus className="size-4" /> Add a measure
            </Button>
          )}
        </div>
      </div>

      {/* Sort & size */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-2">
          <p className={sectionLabel}>Sort</p>
          <div className="flex flex-wrap items-center gap-2">
            {sort.map((entry, index) => (
              <div key={index} className="flex items-center gap-1.5">
                <Select
                  aria-label="Sort by"
                  value={entry.field}
                  onChange={(e) =>
                    setSort((current) =>
                      current.map((s, i) => (i === index ? { ...s, field: e.target.value } : s)),
                    )
                  }
                  className={compactSelect}
                >
                  {sortable.map((field) => (
                    <option key={field.key} value={field.key}>
                      {field.label}
                    </option>
                  ))}
                </Select>
                <Select
                  aria-label="Sort direction"
                  value={entry.dir}
                  onChange={(e) =>
                    setSort((current) =>
                      current.map((s, i) =>
                        i === index ? { ...s, dir: e.target.value as "asc" | "desc" } : s,
                      ),
                    )
                  }
                  className="h-9 w-auto text-xs"
                >
                  <option value="desc">high to low</option>
                  <option value="asc">low to high</option>
                </Select>
                <button
                  type="button"
                  aria-label="Remove this sort"
                  onClick={() => setSort((current) => current.filter((_, i) => i !== index))}
                  className="text-muted hover:text-foreground p-1 transition-colors"
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
            {sort.length < MAX_SORTS && sortable.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setSort((current) => [...current, { field: sortable[0].key, dir: "desc" }])
                }
              >
                <Plus className="size-4" /> Add
              </Button>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <p className={sectionLabel}>Rows shown</p>
          <Select
            aria-label="Rows shown"
            value={String(limit)}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="h-9 w-auto text-xs"
          >
            <option value="100">100</option>
            <option value="250">250</option>
            <option value="500">500</option>
            <option value="1000">1,000</option>
          </Select>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="md" onClick={reset} disabled={pending}>
            Reset
          </Button>
          <Button size="md" onClick={run} disabled={pending}>
            {pending && <Spinner className="size-4 border-2" />}
            Run report
          </Button>
        </div>
      </div>
    </Card>
  );
}

function FilterValue({
  field,
  value,
  projects,
  onChange,
}: {
  field: BuilderField;
  value: string;
  projects: ProjectOption[];
  onChange: (value: string) => void;
}) {
  if (field.lookup === "projects") {
    return (
      <Select
        aria-label="Project"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-auto min-w-40 text-xs"
      >
        <option value="">Pick a project…</option>
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </Select>
    );
  }
  if (field.type === "bool") {
    return (
      <Select
        aria-label="Value"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-auto text-xs"
      >
        <option value="">Pick…</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </Select>
    );
  }
  return (
    <Input
      aria-label="Value"
      type={field.type === "date" ? "date" : field.type === "text" ? "text" : "number"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-auto min-w-36 text-xs"
      placeholder={field.type === "text" ? "Type a value…" : undefined}
    />
  );
}
