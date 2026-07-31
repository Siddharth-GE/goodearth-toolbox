import { Select } from "@/components/ui/select";
import type { VendorRow } from "@/lib/masters/vendors";
import type { SelectHTMLAttributes } from "react";

// Named "combobox" per the founder's own doc, but the Phase 1
// implementation is a plain <select> — same reasoning as item-picker:
// not enough vendors yet to need real search. Swap internals for
// components/ui/combobox.tsx in Phase 2 if vendor search becomes
// necessary; keep this component's name/props stable for callers.
export function VendorCombobox({
  vendors,
  placeholder = "Select a vendor",
  ...props
}: { vendors: VendorRow[]; placeholder?: string } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Select {...props}>
      <option value="">{placeholder}</option>
      {vendors.map((vendor) => (
        <option key={vendor.id} value={vendor.id}>
          {vendor.name}
        </option>
      ))}
    </Select>
  );
}
