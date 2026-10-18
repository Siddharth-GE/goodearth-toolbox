"use client";

import type { Dispatch, SetStateAction } from "react";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { UiFilter } from "@/lib/reporter/draft";
import { opLabel } from "@/lib/reporter/labels";
import type { ProjectOption, UnitOption, VendorOption } from "@/lib/reporter/queries";
import { MAX_FILTERS, type BuilderDataset, type BuilderField, type Op } from "@/lib/reporter/spec";

import { compactSelect, sectionLabel } from "./builder-styles";

export function BuilderFilters({
  dataset,
  filters,
  setFilters,
  setFilter,
  projects,
  units,
  vendors,
  options,
}: {
  dataset: BuilderDataset;
  filters: UiFilter[];
  setFilters: Dispatch<SetStateAction<UiFilter[]>>;
  setFilter: (index: number, next: Partial<UiFilter>) => void;
  projects: ProjectOption[];
  units: UnitOption[];
  vendors: VendorOption[];
  options: Record<string, string[]>;
}) {
  const byKey = new Map(dataset.fields.map((field) => [field.key, field]));
  const filterable = dataset.fields.filter((field) => field.ops.length > 0);

  return (
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
                units={units}
                vendors={vendors}
                options={options[field.key] ?? []}
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
  );
}

function FilterValue({
  field,
  value,
  projects,
  units,
  vendors,
  options,
  onChange,
}: {
  field: BuilderField;
  value: string;
  projects: ProjectOption[];
  units: UnitOption[];
  vendors: VendorOption[];
  options: string[];
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
  if (field.lookup === "units") {
    // The same unit name recurs across projects, so the list groups by project.
    return (
      <Select
        aria-label="Unit"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-auto min-w-40 text-xs"
      >
        <option value="">Pick a unit…</option>
        {projects.map((project) => {
          const own = units.filter((unit) => unit.projectId === project.id);
          if (own.length === 0) return null;
          return (
            <optgroup key={project.id} label={project.name}>
              {own.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </optgroup>
          );
        })}
      </Select>
    );
  }
  if (field.lookup === "vendors") {
    return (
      <Select
        aria-label="Vendor"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-auto min-w-40 text-xs"
      >
        <option value="">Pick a vendor…</option>
        {vendors.map((vendor) => (
          <option key={vendor.id} value={vendor.id}>
            {vendor.name}
          </option>
        ))}
      </Select>
    );
  }
  if (field.distinct) {
    return (
      <Select
        aria-label={field.label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-auto min-w-40 text-xs"
      >
        <option value="">Pick…</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
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
      type={field.type === "date" ? "date" : "number"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-auto min-w-36 text-xs"
    />
  );
}
