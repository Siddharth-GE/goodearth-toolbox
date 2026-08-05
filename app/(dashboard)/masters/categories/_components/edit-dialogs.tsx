"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { RecordFormDialog } from "@/components/masters/record-form-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { BrandRow } from "@/lib/masters/brands";
import type { ItemCategoryRow } from "@/lib/masters/item-categories";
import { updateBrand } from "@/lib/masters/brands-actions";
import { updateItemCategory } from "@/lib/masters/item-categories-actions";

// Kind is shown but not editable — items already filed under a category
// were picked with its kind in mind (see updateItemCategory).
export function CategoryEditDialog({ category }: { category: ItemCategoryRow }) {
  return (
    <RecordFormDialog label="Category" isEdit action={updateItemCategory.bind(null, category.id)}>
      <div className="space-y-1.5">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" defaultValue={category.name} required autoComplete="off" />
      </div>
      <p className="text-muted text-sm capitalize">Kind: {category.kind}</p>
      <label className="text-foreground flex items-center gap-2 text-sm">
        <Checkbox name="is_active" value="1" defaultChecked={category.is_active} />
        Active
      </label>
    </RecordFormDialog>
  );
}

export function BrandEditDialog({ brand }: { brand: BrandRow }) {
  return (
    <RecordFormDialog label="Brand" isEdit action={updateBrand.bind(null, brand.id)}>
      <div className="space-y-1.5">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" defaultValue={brand.name} required autoComplete="off" />
      </div>
      <label className="text-foreground flex items-center gap-2 text-sm">
        <Checkbox name="is_active" value="1" defaultChecked={brand.is_active} />
        Active
      </label>
    </RecordFormDialog>
  );
}
