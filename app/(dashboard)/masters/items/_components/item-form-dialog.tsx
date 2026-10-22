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
  uoms,
  gstRates,
  item,
}: {
  categories: ItemCategoryRow[];
  brands: BrandRow[];
  uoms: string[];
  gstRates: number[];
  item?: ItemRow;
}) {
  const isEdit = !!item;
  // Deactivated options stay visible on an item already using one.
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
          {/* A saved unit no longer in the master stays choosable, so an old item can be saved. */}
          {item?.default_uom && !uoms.includes(item.default_uom) && (
            <option value={item.default_uom}>{item.default_uom}</option>
          )}
          {uoms.map((uom) => (
            <option key={uom} value={uom}>
              {uom}
            </option>
          ))}
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
        <p className="text-muted text-xs">
          Per {item?.default_uom ?? "unit"}, before GST. It rises by itself when a PO is issued at a
          higher rate; lower it here by hand if it should come down.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="gst_pct">GST</Label>
        <input type="hidden" name="gst_pct_was" value={item?.gst_pct ?? ""} />
        <Select id="gst_pct" name="gst_pct" defaultValue={item?.gst_pct ?? ""}>
          <option value="">Not entered</option>
          {item?.gst_pct != null && !gstRates.includes(item.gst_pct) && (
            <option value={item.gst_pct}>{item.gst_pct}% (no longer on the list)</option>
          )}
          {gstRates.map((rate) => (
            <option key={rate} value={rate}>
              {rate}%
            </option>
          ))}
        </Select>
        <p className="text-muted text-xs">A purchase order offers this GST first for the item.</p>
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
