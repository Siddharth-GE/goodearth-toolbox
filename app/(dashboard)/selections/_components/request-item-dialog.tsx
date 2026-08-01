"use client";

import { FormMessage } from "@/components/ui/form-message";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { requestItem } from "@/lib/selections/actions";
import { useState, useTransition } from "react";

const UOMS = ["each", "rft", "sqft", "lumpsum", "bag", "kg", "litre", "cft"];

/**
 * "It's not in the catalogue."
 *
 * Deliberately not a gate: the item is created and usable immediately,
 * and Masters tidies it up later. A designer working at 9pm must never be
 * blocked waiting for someone to approve a product name.
 */
export function RequestItemDialog({
  categories,
  brands,
  prefillName,
  onCreated,
}: {
  categories: { id: string; name: string }[];
  brands: { id: string; name: string }[];
  prefillName?: string;
  onCreated: (itemId: string, name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(prefillName ?? "");
  const [categoryId, setCategoryId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [uom, setUom] = useState("each");
  const [specNote, setSpecNote] = useState("");
  const [error, setError] = useState<string>();
  const [saving, startSaving] = useTransition();

  const submit = () =>
    startSaving(async () => {
      const outcome = await requestItem({
        name,
        categoryId,
        brandId: brandId || null,
        specNote: specNote || null,
        uom,
      });
      if (outcome.error || !outcome.itemId) {
        setError(outcome.error ?? "Could not create the item.");
        return;
      }
      onCreated(outcome.itemId, name.trim());
      setOpen(false);
      setName("");
      setCategoryId("");
      setBrandId("");
      setSpecNote("");
      setUom("each");
      setError(undefined);
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // The search term is the most likely name, so it's re-offered
        // each time rather than only on first open.
        if (next && prefillName) setName(prefillName);
        if (!next) setError(undefined);
      }}
    >
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Not in the catalogue?
      </Button>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add an item that isn&apos;t listed</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="req-name">Item name</Label>
            <Input
              id="req-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Brass wall sconce, 300mm"
              autoComplete="off"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="req-category">Category</Label>
            <Select
              id="req-category"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              <option value="">Choose a category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="req-brand">Brand (optional)</Label>
              <Select
                id="req-brand"
                value={brandId}
                onChange={(event) => setBrandId(event.target.value)}
              >
                <option value="">No brand</option>
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="req-uom">Unit</Label>
              <Select id="req-uom" value={uom} onChange={(event) => setUom(event.target.value)}>
                {UOMS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="req-note">Specification (optional)</Label>
            <Textarea
              id="req-note"
              rows={3}
              value={specNote}
              onChange={(event) => setSpecNote(event.target.value)}
              placeholder="Size, finish, supplier, anything that identifies it."
            />
          </div>

          <p className="text-muted text-sm">
            It&apos;s usable straight away and marked provisional. Masters will confirm it or merge
            it with an existing item later.
          </p>

          <FormMessage error={error} />

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={saving || !name.trim() || !categoryId}>
              {saving ? "Adding…" : "Create and add"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
