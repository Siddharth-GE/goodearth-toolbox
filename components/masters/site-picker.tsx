"use client";

import { Select } from "@/components/ui/select";
import type { SiteOption } from "@/lib/masters/site-options";
import type { SelectHTMLAttributes } from "react";

/**
 * The one "For" dropdown every form uses. Value is "unit:<id>", "plot:<id>" or ""; decodeSite turns it back into ids.
 * showCodes appends each place's short code where the choice enters a reference number (POs, Bills); indents leave it off.
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
