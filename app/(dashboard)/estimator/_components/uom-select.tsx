"use client";

import { Select } from "@/components/ui/select";

/**
 * Every unit-of-measure field in the tool, fed from the 0075 master —
 * a select, not a text box, because the first real session typed cft,
 * Sqft and cum by hand and the founder called it: "we cant have people
 * type all this". A saved value that has since left the master (or was
 * typed before the master existed) is still offered, once, so an old
 * row can be reopened and saved without being forced onto a new unit.
 */
export function UomSelect({
  uoms,
  current,
  ...props
}: {
  uoms: string[];
  /** The value already saved on the row being edited, if any. */
  current?: string | null;
} & Omit<React.ComponentProps<typeof Select>, "children">) {
  const options =
    current && !uoms.some((uom) => uom.toLowerCase() === current.toLowerCase())
      ? [current, ...uoms]
      : uoms;

  return (
    <Select {...props}>
      <option value="" disabled>
        Choose a unit
      </option>
      {options.map((uom) => (
        <option key={uom} value={uom}>
          {uom}
        </option>
      ))}
    </Select>
  );
}
