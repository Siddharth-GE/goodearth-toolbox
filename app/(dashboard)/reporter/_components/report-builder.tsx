"use client";

// Owns a DRAFT of the spec; "Run report" writes it to `?spec=` and the Server Component re-runs.
// The parent keys this on the raw param so navigation remounts it in sync. Nothing typed here
// reaches the database but as a VALUE: every field, op and aggregate is a registry key,
// re-validated by parseReportSpec. The sections are the builder-*.tsx files beside it.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Card } from "@/components/ui/card";
import {
  buildDraftSpec,
  toUiFilters,
  type UiChart,
  type UiFilter,
  type UiMeasure,
  type UiSort,
} from "@/lib/reporter/draft";
import type { ProjectOption, UnitOption, VendorOption } from "@/lib/reporter/queries";
import { defaultSpec, encodeSpec, type BuilderDataset, type ReportSpec } from "@/lib/reporter/spec";

import { BuilderChart } from "./builder-chart";
import { BuilderColumns } from "./builder-columns";
import { BuilderFilters } from "./builder-filters";
import { BuilderGrouping } from "./builder-grouping";
import { BuilderSort } from "./builder-sort";

export function ReportBuilder({
  dataset,
  spec,
  basePath,
  projects,
  units,
  vendors,
  options,
}: {
  dataset: BuilderDataset;
  spec: ReportSpec;
  /**
   * `/reporter/run` for an unsaved report, `/reporter/<id>` for a saved one, so reshaping stays on
   * that page.
   */
  basePath: string;
  projects: ProjectOption[];
  units: UnitOption[];
  vendors: VendorOption[];
  options: Record<string, string[]>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [columns, setColumns] = useState<string[]>(spec.columns);
  const [filters, setFilters] = useState<UiFilter[]>(toUiFilters(spec));
  const [groupBy, setGroupBy] = useState<string[]>(spec.groupBy);
  const [measures, setMeasures] = useState<UiMeasure[]>(spec.measures);
  const [sort, setSort] = useState<UiSort[]>(spec.sort);
  const [limit, setLimit] = useState<number>(spec.limit);
  const [chart, setChart] = useState<UiChart>({
    type: spec.chart?.type ?? "",
    category: spec.chart?.category ?? "",
    measures: spec.chart?.measures ?? [],
    emphasis: spec.chart?.emphasis ?? "",
  });

  const byKey = new Map(dataset.fields.map((field) => [field.key, field]));

  const run = () => {
    const draft = buildDraftSpec(spec, dataset, {
      columns,
      filters,
      groupBy,
      measures,
      sort,
      limit,
      chart,
    });
    startTransition(() => {
      router.push(`${basePath}?spec=${encodeSpec(draft)}`);
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
    setChart({ type: "", category: "", measures: [], emphasis: "" });
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
        // A new field has its own legal ops: keep the op if it still applies, else use the first.
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

  return (
    <Card className="space-y-5 p-4 sm:p-5">
      <BuilderColumns dataset={dataset} columns={columns} onToggle={toggleColumn} />
      <BuilderFilters
        dataset={dataset}
        filters={filters}
        setFilters={setFilters}
        setFilter={setFilter}
        projects={projects}
        units={units}
        vendors={vendors}
        options={options}
      />
      <BuilderGrouping
        dataset={dataset}
        groupBy={groupBy}
        setGroupBy={setGroupBy}
        measures={measures}
        setMeasures={setMeasures}
        setMeasure={setMeasure}
      />
      <BuilderChart
        dataset={dataset}
        groupBy={groupBy}
        measures={measures}
        chart={chart}
        setChart={setChart}
      />
      <BuilderSort
        dataset={dataset}
        sort={sort}
        setSort={setSort}
        limit={limit}
        setLimit={setLimit}
        pending={pending}
        onReset={reset}
        onRun={run}
      />
    </Card>
  );
}
