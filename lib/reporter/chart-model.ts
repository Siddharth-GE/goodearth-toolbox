/**
 * One place that turns a run report into its chart model — the screen
 * (ReportView) and the PDF both call this, so the two can never shape
 * the same chart differently. PURE: the model comes from the tested
 * lib/charts/series.ts; this file only wires the dataset's labels in.
 */

import { buildChartModel, type ChartModel } from "@/lib/charts/series";

import type { ReportResult } from "./aggregate";
import type { DatasetDef } from "./datasets";
import { measureLabel } from "./labels";
import { measureId, type ReportSpec } from "./spec";

export function chartModelFor(
  dataset: DatasetDef,
  spec: ReportSpec,
  result: ReportResult,
): ChartModel | null {
  if (!spec.chart) return null;
  return buildChartModel({
    spec,
    result,
    measureLabels: Object.fromEntries(
      spec.measures.map((measure) => [
        measureId(measure),
        measureLabel(dataset.fields[measure.field].label, measure.agg),
      ]),
    ),
    fieldLabels: Object.fromEntries(
      Object.entries(dataset.fields).map(([key, field]) => [key, field.label]),
    ),
    moneyMeasures: spec.measures
      .filter((measure) => dataset.fields[measure.field].type === "money")
      .map((measure) => measureId(measure)),
  });
}
