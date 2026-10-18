"use client";

import type { Dispatch, SetStateAction } from "react";

import { Select } from "@/components/ui/select";
import type { UiChart, UiMeasure } from "@/lib/reporter/draft";
import { measureLabel } from "@/lib/reporter/labels";
import { measureId, type BuilderDataset, type ChartType } from "@/lib/reporter/spec";

import { compactSelect, sectionLabel } from "./builder-styles";
import { chipClassName } from "@/components/ui/choice-chips";

const CHART_TYPE_LABELS: [ChartType, string][] = [
  ["bar", "Bars"],
  ["hbar", "Bars, sideways"],
  ["line", "Line"],
  ["area", "Area"],
  ["stacked", "Stacked bars"],
  ["meter", "Meter — value against a limit"],
];

export function BuilderChart({
  dataset,
  groupBy,
  measures,
  chart,
  setChart,
}: {
  dataset: BuilderDataset;
  groupBy: string[];
  measures: UiMeasure[];
  chart: UiChart;
  setChart: Dispatch<SetStateAction<UiChart>>;
}) {
  const byKey = new Map(dataset.fields.map((field) => [field.key, field]));

  return (
    <div className="space-y-2">
      <p className={sectionLabel}>Chart</p>
      {groupBy.length === 0 || measures.length === 0 ? (
        <p className="text-muted text-xs">
          Group by a field and add a measure, and the report can carry a chart.
        </p>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Select
              aria-label="Chart type"
              value={chart.type}
              onChange={(e) => setChart({ ...chart, type: e.target.value as ChartType | "" })}
              className={compactSelect}
            >
              <option value="">No chart</option>
              {CHART_TYPE_LABELS.map(([type, label]) => (
                <option key={type} value={type}>
                  {label}
                </option>
              ))}
            </Select>
            {chart.type && chart.type !== "meter" && (
              <>
                <span className="text-muted text-xs">by</span>
                <Select
                  aria-label="Chart category"
                  value={groupBy.includes(chart.category) ? chart.category : groupBy[0]}
                  onChange={(e) => setChart({ ...chart, category: e.target.value })}
                  className={compactSelect}
                >
                  {groupBy.map((key) => (
                    <option key={key} value={key}>
                      {byKey.get(key)?.label ?? key}
                    </option>
                  ))}
                </Select>
              </>
            )}
          </div>

          {chart.type && (
            <div className="space-y-1.5">
              <p className="text-muted text-xs">
                {chart.type === "meter"
                  ? "Pick two measures — the value first, then the limit it runs against."
                  : "Which measures go on the chart — the order sets the colours."}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {measures.map((measure) => {
                  const id = measureId(measure);
                  const on = chart.measures.includes(id);
                  const field = byKey.get(measure.field);
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setChart({
                          ...chart,
                          measures: on
                            ? chart.measures.filter((m) => m !== id)
                            : [...chart.measures, id],
                          emphasis: on && chart.emphasis === id ? "" : chart.emphasis,
                        })
                      }
                      className={chipClassName(on)}
                    >
                      {measureLabel(field?.label ?? measure.field, measure.agg)}
                    </button>
                  );
                })}
              </div>
              {chart.type !== "meter" && chart.measures.length >= 2 && (
                <div className="flex items-center gap-2">
                  <span className="text-muted text-xs">Emphasise</span>
                  <Select
                    aria-label="Emphasised measure"
                    value={chart.emphasis}
                    onChange={(e) => setChart({ ...chart, emphasis: e.target.value })}
                    className={compactSelect}
                  >
                    <option value="">Nothing — all colours</option>
                    {chart.measures.map((id) => {
                      const measure = measures.find((m) => measureId(m) === id);
                      const field = measure ? byKey.get(measure.field) : undefined;
                      return (
                        <option key={id} value={id}>
                          {measure ? measureLabel(field?.label ?? measure.field, measure.agg) : id}
                        </option>
                      );
                    })}
                  </Select>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
