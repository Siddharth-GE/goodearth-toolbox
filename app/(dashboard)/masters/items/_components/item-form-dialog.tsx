"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { BrandRow } from "@/lib/masters/brands";
import type { ItemCategoryRow } from "@/lib/masters/item-categories";
import type { ItemRow } from "@/lib/masters/items";
import { createItem, updateItem } from "@/lib/masters/items-actions";
import { useActionState, useEffect, useRef, useState } from "react";

export function ItemFormDialog({
  categories,
  brands,
  item,
}: {
  categories: ItemCategoryRow[];
  brands: BrandRow[];
  item?: ItemRow;
}) {
  const [open, setOpen] = useState(false);
  const isEdit = !!item;
  const action = isEdit ? updateItem.bind(null, item.id) : createItem;
  const [state, formAction, pending] = useActionState(action, undefined);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) setOpen(false);
    wasPending.current = pending;
  }, [pending, state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={isEdit ? "secondary" : "primary"}>{isEdit ? "Edit" : "New Item"}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Item" : "New Item"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
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
              {categories.map((category) => (
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
              {brands.map((brand) => (
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
            <Input id="description" name="description" defaultValue={item?.description ?? ""} autoComplete="off" />
          </div>
          {state?.error && <p className="text-sm font-medium text-danger">{state.error}</p>}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
