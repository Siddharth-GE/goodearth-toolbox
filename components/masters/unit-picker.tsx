import { Select } from "@/components/ui/select";
import type { UnitRow } from "@/lib/masters/units";
import type { SelectHTMLAttributes } from "react";

export function UnitPicker({
  units,
  placeholder = "Select a unit",
  ...props
}: { units: UnitRow[]; placeholder?: string } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Select {...props}>
      <option value="">{placeholder}</option>
      {units.map((unit) => (
        <option key={unit.id} value={unit.id}>
          {unit.name}
        </option>
      ))}
    </Select>
  );
}
