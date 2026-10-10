"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { ProjectOption, UnitOption, VendorOption } from "@/lib/reporter/queries";
import {
  applyQuickFilters,
  encodeSpec,
  quickFilterFields,
  readQuickFilters,
  type QuickFilterValues,
  type ReportSpec,
} from "@/lib/reporter/spec";

/**
 * The always-visible filters above the builder (plan.md, A5): a date
 * range, project, villa and vendor — whichever the data set has. Each
 * writes an ordinary picker filter into the spec (applyQuickFilters,
 * tested), so the builder below shows it too and a saved report keeps it.
 * Choices, never typing — founder decision #4 holds.
 */
export function QuickFilters({
  spec,
  basePath,
  projects,
  units,
  vendors,
}: {
  spec: ReportSpec;
  basePath: string;
  projects: ProjectOption[];
  units: UnitOption[];
  vendors: VendorOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const fields = quickFilterFields(spec.dataset);
  const [values, setValues] = useState<QuickFilterValues>(() => readQuickFilters(spec, fields));

  if (!fields.date && !fields.project && !fields.unit && !fields.vendor) return null;

  const set = (key: keyof QuickFilterValues, value: string) =>
    setValues((current) => ({ ...current, [key]: value || undefined }));

  const apply = (next: QuickFilterValues) =>
    startTransition(() => {
      router.push(`${basePath}?spec=${encodeSpec(applyQuickFilters(spec, fields, next))}`);
    });

  // A villa list narrowed to the chosen project, so it stays short.
  const villaChoices = values.project
    ? units.filter((unit) => unit.projectId === values.project)
    : units;
  const active = Object.values(values).some(Boolean);

  return (
    <div className="border-border bg-surface flex flex-wrap items-end gap-2 rounded-2xl border p-4">
      {fields.date && (
        <>
          <div className="w-[calc(50%-0.25rem)] space-y-1.5 sm:w-40">
            <Label htmlFor="quick-from">From</Label>
            <Input
              id="quick-from"
              type="date"
              value={values.from ?? ""}
              onChange={(event) => set("from", event.target.value)}
            />
          </div>
          <div className="w-[calc(50%-0.25rem)] space-y-1.5 sm:w-40">
            <Label htmlFor="quick-to">To</Label>
            <Input
              id="quick-to"
              type="date"
              value={values.to ?? ""}
              onChange={(event) => set("to", event.target.value)}
            />
          </div>
        </>
      )}
      {fields.project && (
        <div className="w-full space-y-1.5 sm:w-48">
          <Label htmlFor="quick-project">Project</Label>
          <Select
            id="quick-project"
            value={values.project ?? ""}
            onChange={(event) => {
              set("project", event.target.value);
              set("unit", "");
            }}
          >
            <option value="">All projects</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </Select>
        </div>
      )}
      {fields.unit && (
        <div className="w-full space-y-1.5 sm:w-48">
          <Label htmlFor="quick-unit">Villa</Label>
          <Select
            id="quick-unit"
            value={values.unit ?? ""}
            onChange={(event) => set("unit", event.target.value)}
          >
            <option value="">All villas</option>
            {villaChoices.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </Select>
        </div>
      )}
      {fields.vendor && (
        <div className="w-full space-y-1.5 sm:w-48">
          <Label htmlFor="quick-vendor">Vendor</Label>
          <Select
            id="quick-vendor"
            value={values.vendor ?? ""}
            onChange={(event) => set("vendor", event.target.value)}
          >
            <option value="">All vendors</option>
            {vendors.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.name}
              </option>
            ))}
          </Select>
        </div>
      )}
      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => apply(values)} disabled={pending}>
          {pending ? "Applying…" : "Apply"}
        </Button>
        {active && (
          <Button
            variant="ghost"
            onClick={() => {
              setValues({});
              apply({});
            }}
            disabled={pending}
          >
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
