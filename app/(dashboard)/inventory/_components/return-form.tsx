"use client";

import { ItemThumb } from "@/components/masters/item-thumb";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchSelect } from "@/components/ui/search-select";
import { Select } from "@/components/ui/select";
import { parseNumber } from "@/lib/form-data";
import { formatQuantity, todayInIndia } from "@/lib/format";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import { recordSiteReturn } from "@/lib/inventory/actions";
import type { VillaHolding } from "@/lib/inventory/returns-queries";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** Material back from a villa: pick the villa, and what it still holds is listed to send back. */
export function ReturnForm({
  villaId,
  villas,
  stores,
  holdings,
}: {
  villaId: string;
  villas: { id: string; name: string }[];
  stores: { id: string; name: string }[];
  holdings: VillaHolding[];
}) {
  const router = useRouter();
  const [storeId, setStoreId] = useState(stores[0]?.id ?? "");
  const [returnedOn, setReturnedOn] = useState(() => todayInIndia());
  const [reason, setReason] = useState("");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string>();
  const { pending, error, run } = useActionRunner();

  const lines = holdings
    .map((holding) => ({
      itemId: holding.id,
      quantity: parseNumber(quantities[holding.id] ?? "") ?? 0,
    }))
    .filter((line) => line.quantity > 0);
  const over = holdings.find(
    (holding) => (parseNumber(quantities[holding.id] ?? "") ?? 0) > holding.quantity + 0.0005,
  );
  const ready =
    villaId !== "" && storeId !== "" && reason.trim() !== "" && lines.length > 0 && !over;

  const submit = async () => {
    setSaved(undefined);
    const result = await run(() =>
      recordSiteReturn({ plotId: villaId, storeId, returnedOn: returnedOn || null, reason, lines }),
    );
    if (result?.error) return;
    setSaved(`${lines.length} ${lines.length === 1 ? "item" : "items"} back in the store.`);
    setQuantities({});
    setReason("");
    router.refresh();
  };

  return (
    <section className="border-border bg-surface space-y-4 rounded-2xl border p-4">
      <h2 className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">
        Material back from a villa
      </h2>
      <p className="text-muted text-sm">
        What a villa did not use goes back into a store. It goes back into the batches the villa
        drew, so it keeps their rate, and the villa&apos;s total goes down. Never more than is still
        at the villa.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="return-villa">From the villa</Label>
          <SearchSelect
            id="return-villa"
            options={villas.map((villa) => ({ value: villa.id, label: villa.name }))}
            value={villaId}
            onChange={(id) =>
              router.replace(id ? `/inventory/returns?villa=${id}` : "/inventory/returns", {
                scroll: false,
              })
            }
            placeholder="Type the villa…"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="return-store">To the store</Label>
          <Select
            id="return-store"
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
          <Label htmlFor="return-date">Came back on</Label>
          <Input
            id="return-date"
            type="date"
            value={returnedOn}
            onChange={(event) => setReturnedOn(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="return-reason">Why (required)</Label>
          <Input
            id="return-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Left over after the slab, wrong size…"
            maxLength={500}
          />
        </div>
      </div>

      {villaId === "" ? null : holdings.length === 0 ? (
        <p className="text-muted text-sm">
          Nothing that reached this villa is still there to send back.
        </p>
      ) : (
        <ul className="divide-border divide-y">
          {holdings.map((holding) => (
            <li key={holding.id} className="flex flex-wrap items-center gap-3 py-2.5">
              <ItemThumb
                code={holding.code}
                name={holding.name}
                thumbUrl={holding.thumb_url}
                sizes="48px"
                className="w-8"
              />
              <span className="min-w-0 flex-1">
                <span className="text-foreground block text-sm font-medium">{holding.name}</span>
                <span className="text-muted block text-xs">
                  {`${formatQuantity(holding.quantity)} ${holding.default_uom} at the villa`}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <Input
                  aria-label={`Coming back, ${holding.name}`}
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  value={quantities[holding.id] ?? ""}
                  onChange={(event) =>
                    setQuantities((current) => ({ ...current, [holding.id]: event.target.value }))
                  }
                  placeholder="0"
                  className="w-28 text-right"
                />
                <span className="text-muted w-10 text-xs">{holding.default_uom}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          {over && (
            <p className="text-warning text-xs font-medium">
              {`Only ${formatQuantity(over.quantity)} ${over.default_uom} of ${over.name} is at the villa.`}
            </p>
          )}
          <FormMessage error={error} size="xs" />
          {saved && <p className="text-success text-xs font-medium">{saved}</p>}
        </div>
        <Button onClick={submit} disabled={pending || !ready}>
          {pending ? "Saving…" : "Record the return"}
        </Button>
      </div>
    </section>
  );
}
