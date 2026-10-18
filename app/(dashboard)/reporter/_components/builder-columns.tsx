"use client";

import { cn } from "@/lib/utils";
import type { BuilderDataset } from "@/lib/reporter/spec";

import { sectionLabel } from "./builder-styles";

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
  );
}
