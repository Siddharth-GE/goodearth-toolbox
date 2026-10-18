"use client";

import type { Dispatch, SetStateAction } from "react";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import type { UiSort } from "@/lib/reporter/draft";
import { MAX_SORTS, type BuilderDataset } from "@/lib/reporter/spec";

import { compactSelect, sectionLabel } from "./builder-styles";

// The last row: sort order, how many rows to show, and the Reset / Run buttons.
export function BuilderSort({
  dataset,
  sort,
  setSort,
  limit,
  setLimit,
  pending,
  onReset,
  onRun,
}: {
  dataset: BuilderDataset;
  sort: UiSort[];
  setSort: Dispatch<SetStateAction<UiSort[]>>;
  limit: number;
  setLimit: Dispatch<SetStateAction<number>>;
  pending: boolean;
  onReset: () => void;
  onRun: () => void;
}) {
  const sortable = dataset.fields.filter((field) => field.sortable);

  return (
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
        <Button variant="ghost" size="md" onClick={onReset} disabled={pending}>
          Reset
        </Button>
        <Button size="md" onClick={onRun} disabled={pending}>
          {pending && <Spinner className="size-4 border-2" />}
          Run report
        </Button>
      </div>
    </div>
  );
}
