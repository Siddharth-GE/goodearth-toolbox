"use client";

import { Select } from "@/components/ui/select";
import type { SiteOption } from "@/lib/masters/site-options";
import type { SelectHTMLAttributes } from "react";

/**
 * The one "For" dropdown every form uses instead of separate plot and
 * unit selects (plot ↔ unit is 1:1 since migration 0029). Options come
 * from buildSiteOptions; the submitted value is "unit:<id>",
 * "plot:<id>" or "" — decodeSite turns it back into ids.
 *
 * Works controlled (value/onChange) or uncontrolled (name/defaultValue
 * inside a form dialog) — the extra props pass straight through to the
 * shared Select. showCodes appends each place's short code for the
 * screens where the choice enters a reference number (POs, Bills);
 * indents number without a scope, so they leave it off.
 */
export function SitePicker({
  options,
  generalLabel = "General — not for one plot or unit",
  showCodes = false,
  ...selectProps
}: {
  options: SiteOption[];
  generalLabel?: string;
  showCodes?: boolean;
} & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Select {...selectProps}>
      <option value="">{generalLabel}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
          {showCodes && (option.code ? ` (${option.code})` : " — no code yet")}
        </option>
      ))}
    </Select>
  );
}
