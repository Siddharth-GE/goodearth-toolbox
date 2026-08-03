"use client";

import { CataloguePickerDialog, type PickedLine } from "@/components/masters/catalogue-picker";
import { ItemThumb } from "@/components/masters/item-thumb";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { formatQuantity } from "@/lib/format";
import { recordStockAdjustment } from "@/lib/inventory/actions";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type ChosenItem = { id: string; name: string; code: string | null; thumb_url: string | null };

/**
 * The only way a balance changes without a movement behind it, so the
 * reason is mandatory here and at the database. Opening stock is simply
 * a positive adjustment — that is the intended way to start a store off
 * with what is already sitting in it.
 */
export function AdjustmentForm({
  stores,
  categories,
  brands,
}: {
  stores: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  brands: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  const [item, setItem] = useState<ChosenItem | null>(null);
  const [uom, setUom] = useState("each");
  const [direction, setDirection] = useState<"add" | "remove">("add");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [adjustedAt, setAdjustedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState<string>();
  const [saving, startSaving] = useTransition();

  const amount = Number(quantity);
  const ready =
    storeId !== "" && item != null && Number.isFinite(amount) && amount > 0 && reason.trim() !== "";

  const choose = (picked: PickedLine[]) => {
    const first = picked[0];
    if (first) {
      setItem({
        id: first.item.id,
        name: first.item.name,
        code: first.item.code,
        thumb_url: first.item.thumb_url,
      });
      setUom(first.item.default_uom);
      setQuantity(String(first.quantity));
    }
    setPickerOpen(false);
    return Promise.resolve(undefined);
  };

  const submit = () =>
    startSaving(async () => {
      if (!item) return;
      setError(undefined);
      setSaved(undefined);
      const result = await recordStockAdjustment({
        storeId,
        itemId: item.id,
        quantity: direction === "add" ? amount : -amount,
        uom,
        reason,
        adjustedAt: adjustedAt || null,
      });
      if (result?.error) {
        setError(result.error);
        return;
      }
      setSaved(
        `${direction === "add" ? "Added" : "Removed"} ${formatQuantity(amount)} ${uom} of ${item.name}.`,
      );
      setItem(null);
      setQuantity("");
      setReason("");
      router.refresh();
    });

  return (
    <section className="border-border bg-surface space-y-4 rounded-2xl border p-4">
      <h2 className="text-muted text-xs font-semibold tracking-widest uppercase">
        Correct a count
      </h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="adjust-store">Store</Label>
          <Select
            id="adjust-store"
            value={storeId}
            onChange={(event) => setStoreId(event.target.value)}
          >
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Item</Label>
          {item ? (
            <div className="border-border bg-background flex items-center gap-2.5 rounded-xl border px-3 py-2">
              <ItemThumb
                code={item.code}
                name={item.name}
                thumbUrl={item.thumb_url}
                sizes="48px"
                className="w-8"
              />
              <span className="text-foreground min-w-0 flex-1 truncate text-sm font-medium">
                {item.name}
              </span>
              <Button size="sm" variant="ghost" onClick={() => setPickerOpen(true)}>
                Change
              </Button>
            </div>
          ) : (
            <Button variant="secondary" onClick={() => setPickerOpen(true)} className="w-full">
              Pick an item…
            </Button>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>Add or remove</Label>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={direction === "add" ? "primary" : "secondary"}
              onClick={() => setDirection("add")}
            >
              Add
            </Button>
            <Button
              size="sm"
              variant={direction === "remove" ? "primary" : "secondary"}
              onClick={() => setDirection("remove")}
            >
              Remove
            </Button>
          </div>
          <p className="text-muted text-xs">
            Starting a store off with what is already in it? That is an Add.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="adjust-qty">Quantity</Label>
          <div className="flex items-center gap-2">
            <Input
              id="adjust-qty"
              type="number"
              step="any"
              min="0"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              placeholder="0"
            />
            <span className="text-muted text-xs whitespace-nowrap">{uom}</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="adjust-date">Dated</Label>
          <Input
            id="adjust-date"
            type="date"
            value={adjustedAt}
            onChange={(event) => setAdjustedAt(event.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="adjust-reason">Reason (required)</Label>
          <Input
            id="adjust-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Opening stock, breakage, recount…"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <FormMessage error={error} size="xs" />
          {saved && <p className="text-success text-xs font-medium">{saved}</p>}
        </div>
        <Button onClick={submit} disabled={saving || !ready}>
          {saving ? "Saving…" : "Save adjustment"}
        </Button>
      </div>

      <CataloguePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title="Pick an item to adjust"
        targetLabel="this adjustment"
        categories={categories}
        brands={brands}
        onCommit={choose}
      />
    </section>
  );
}
