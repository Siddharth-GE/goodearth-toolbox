"use client";

import { Select } from "@/components/ui/select";

/** Every unit field, fed from the shared Masters list (0082) as a select, not free text. A saved value that left the master is still offered once, so an old row can be reopened. */
export function UomSelect({
  uoms,
  current,
  ...props
}: {
  uoms: string[];
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
