"use client";

import type { Dispatch, SetStateAction } from "react";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import type { Aggregate } from "@/lib/reporter/datasets";
import type { UiMeasure } from "@/lib/reporter/draft";
import { aggLabel } from "@/lib/reporter/labels";
import { MAX_MEASURES, type BuilderDataset } from "@/lib/reporter/spec";

import { compactSelect, sectionLabel } from "./builder-styles";

// Group by and Measures sit side by side: a grouping is only useful with a number against it.
export function BuilderGrouping({
  dataset,
  groupBy,
  setGroupBy,
  measures,
  setMeasures,
  setMeasure,
}: {
  dataset: BuilderDataset;
  groupBy: string[];
  setGroupBy: Dispatch<SetStateAction<string[]>>;
  measures: UiMeasure[];
  setMeasures: Dispatch<SetStateAction<UiMeasure[]>>;
  setMeasure: (index: number, next: Partial<UiMeasure>) => void;
}) {
  const byKey = new Map(dataset.fields.map((field) => [field.key, field]));
  const groupable = dataset.fields.filter((field) => field.groupable);
  const aggregatable = dataset.fields.filter((field) => field.aggregates.length > 0);

  return (
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
  );
}
