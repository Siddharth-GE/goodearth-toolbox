"use client";

import type { BuilderDataset } from "@/lib/reporter/spec";

import { sectionLabel } from "./builder-styles";
import { chipClassName } from "@/components/ui/choice-chips";

export function BuilderColumns({
  dataset,
  columns,
  onToggle,
}: {
  dataset: BuilderDataset;
  columns: string[];
  onToggle: (key: string) => void;
}) {
  return (
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
              onClick={() => onToggle(field.key)}
              className={chipClassName(on)}
            >
              {field.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
