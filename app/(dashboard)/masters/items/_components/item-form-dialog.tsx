"use client";

import { RecordFormDialog } from "@/components/masters/record-form-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { BrandRow } from "@/lib/masters/brands";
import type { ItemCategoryRow } from "@/lib/masters/item-categories";
import type { ItemRow } from "@/lib/masters/items";
import { createItem, updateItem } from "@/lib/masters/items-actions";

export function ItemFormDialog({
  categories,
  brands,
  item,
}: {
  categories: ItemCategoryRow[];
  brands: BrandRow[];
  item?: ItemRow;
}) {
  const isEdit = !!item;
  // Deactivated categories/brands stop being offered, but an item already
  // filed under one keeps its value visible until someone changes it.
  const pickableCategories = categories.filter(
    (category) => category.is_active || category.id === item?.category_id,
  );
  const pickableBrands = brands.filter((brand) => brand.is_active || brand.id === item?.brand_id);

  return (
    <RecordFormDialog
      label="Item"
      isEdit={isEdit}
      action={isEdit ? updateItem.bind(null, item.id) : createItem}
    >
      <div className="space-y-1.5">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" defaultValue={item?.name} required autoComplete="off" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="kind">Kind</Label>
        <Select id="kind" name="kind" defaultValue={item?.kind ?? ""} required>
          <option value="" disabled>
            Select a kind
          </option>
          <option value="catalogue">Catalogue</option>
          <option value="material">Material</option>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="category_id">Category</Label>
        <Select id="category_id" name="category_id" defaultValue={item?.category_id ?? ""} required>
          <option value="" disabled>
            Select a category
          </option>
          {pickableCategories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name} ({category.kind})
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="brand_id">Brand (optional)</Label>
        <Select id="brand_id" name="brand_id" defaultValue={item?.brand_id ?? ""}>
          <option value="">No brand</option>
          {pickableBrands.map((brand) => (
            <option key={brand.id} value={brand.id}>
              {brand.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="placement">Placement (optional)</Label>
        <Select id="placement" name="placement" defaultValue={item?.placement ?? ""}>
          <option value="">Not applicable</option>
          <option value="fixed">Fixed</option>
          <option value="loose">Loose</option>
          <option value="soft_furnishing">Soft furnishing</option>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="default_uom">Unit of measure</Label>
        <Select id="default_uom" name="default_uom" defaultValue={item?.default_uom ?? ""} required>
          <option value="" disabled>
            Select a unit
          </option>
          <option value="each">Each</option>
          <option value="rft">Running ft (rft)</option>
          <option value="sqft">Square ft (sqft)</option>
          <option value="lumpsum">Lump sum</option>
          <option value="bag">Bag</option>
          <option value="kg">Kg</option>
          <option value="litre">Litre</option>
          <option value="cft">Cubic ft (cft)</option>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="indicative_price">Indicative price</Label>
        <Input
          id="indicative_price"
          name="indicative_price"
          type="number"
          step="0.01"
          defaultValue={item?.indicative_price ?? ""}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="code">Code (optional)</Label>
        <Input id="code" name="code" defaultValue={item?.code ?? ""} autoComplete="off" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="description">Description (optional)</Label>
        <Input
          id="description"
          name="description"
          defaultValue={item?.description ?? ""}
          autoComplete="off"
        />
      </div>
    </RecordFormDialog>
  );
}
