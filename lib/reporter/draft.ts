// The report builder's draft: the shapes its form fields hold, and the one function that turns them
// into a spec. Pure, so what "Run report" sends is testable without a browser.
import type { Aggregate } from "./datasets";
import {
  measureId,
  parseReportSpec,
  type BuilderDataset,
  type ChartType,
  type Op,
  type ReportSpec,
} from "./spec";

export type UiFilter = { field: string; op: Op; value: string };
export type UiMeasure = { field: string; agg: Aggregate };
export type UiSort = { field: string; dir: "asc" | "desc" };
export type UiChart = {
  type: ChartType | "";
  category: string;
  measures: string[];
  emphasis: string;
};

export function toUiFilters(spec: ReportSpec): UiFilter[] {
  return spec.filters.map((filter) => ({
    field: filter.field,
    op: filter.op,
    value: String(filter.value),
  }));
}

export type DraftState = {
  columns: string[];
  filters: UiFilter[];
  groupBy: string[];
  measures: UiMeasure[];
  sort: UiSort[];
  limit: number;
  chart: UiChart;
};

// The parser stays the only door: this only shapes the draft for it.
export function buildDraftSpec(
  spec: ReportSpec,
  dataset: BuilderDataset,
  state: DraftState,
): ReportSpec {
  const { columns, filters, groupBy, measures, sort, limit, chart } = state;
  const byKey = new Map(dataset.fields.map((field) => [field.key, field]));
  // A blank-value filter row is dropped quietly; the parser would only note it.
  const measureIds = measures.map((measure) => measureId(measure));
  const chartMeasures = chart.measures.filter((id) => measureIds.includes(id));
  return parseReportSpec({
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
    chart:
      chart.type && groupBy.length > 0 && chartMeasures.length > 0
        ? {
            type: chart.type,
            category: groupBy.includes(chart.category) ? chart.category : groupBy[0],
            measures: chartMeasures,
            ...(chart.emphasis && chartMeasures.includes(chart.emphasis)
              ? { emphasis: chart.emphasis }
              : {}),
          }
        : null,
  });
}
