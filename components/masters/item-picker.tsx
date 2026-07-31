import { Select } from "@/components/ui/select";
import type { ItemCategoryRow } from "@/lib/masters/item-categories";
import type { ItemRow } from "@/lib/masters/items";
import type { SelectHTMLAttributes } from "react";

// Plain <select> is enough at Phase 1 scale (5 seed items). Swap the
// internals for components/ui/combobox.tsx once that exists (Phase 2,
// ~2,631 real catalogue items) — keep this component's name/props
// stable for callers when that happens.
export function ItemPicker({
  items,
  categories,
  placeholder = "Select an item",
  ...props
}: {
  items: ItemRow[];
  categories: ItemCategoryRow[];
  placeholder?: string;
} & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Select {...props}>
      <option value="">{placeholder}</option>
      {categories.map((category) => {
        const categoryItems = items.filter((item) => item.category_id === category.id);
        if (categoryItems.length === 0) return null;
        return (
          <optgroup key={category.id} label={category.name}>
            {categoryItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </optgroup>
        );
      })}
    </Select>
  );
}
