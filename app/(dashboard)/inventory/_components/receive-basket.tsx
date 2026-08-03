"use client";

import { ItemThumb } from "@/components/masters/item-thumb";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { formatQuantity } from "@/lib/format";
import { recordGoodsReceipt } from "@/lib/inventory/actions";
import type { ReceivePool } from "@/lib/inventory/queries";
import { isFullyReceivedOrder } from "@/lib/inventory/stock";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

/**
 * Recording one delivery: the PoolBasket pattern from the PO tool's
 * pull screen. Every ordered line stays on screen — the ones already
 * fully delivered show disabled and labelled rather than vanishing, so
 * a store-keeper can see the whole order in front of them while they
 * count. Nothing is written until the commit bar at the bottom.
 */
export function ReceiveBasket({ pool }: { pool: ReceivePool }) {
  const router = useRouter();
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [storeId, setStoreId] = useState(pool.stores[0]?.id ?? "");
  const [toSite, setToSite] = useState(false);
  const [challanNo, setChallanNo] = useState("");
  const [receivedAt, setReceivedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const [saving, startSaving] = useTransition();

  const pickedEntries = useMemo(() => Object.entries(picked), [picked]);

  const remainingById = useMemo(
    () => new Map(pool.lines.map((line) => [line.po_line_id, line.remaining])),
    [pool.lines],
  );

  const selectable = (line: ReceivePool["lines"][number]) => line.remaining > 0;

  const toggle = (line: ReceivePool["lines"][number], on: boolean) =>
    setPicked((current) => {
      const next = { ...current };
      if (on) next[line.po_line_id] = line.remaining;
      else delete next[line.po_line_id];
      return next;
    });

  const toggleAll = (on: boolean) =>
    setPicked(() => {
      if (!on) return {};
      const next: Record<string, number> = {};
      for (const line of pool.lines) {
        if (selectable(line)) next[line.po_line_id] = line.remaining;
      }
      return next;
    });

  const overRemaining = pickedEntries.some(
    ([id, quantity]) => quantity > (remainingById.get(id) ?? 0),
  );

  /** Would this delivery finish the order? Mirrors the condition the
   * database checks before flipping the PO to Completed. */
  const finishesOrder = isFullyReceivedOrder(
    pool.lines.map((line) => ({
      ordered: line.ordered,
      received: line.received + (picked[line.po_line_id] ?? 0),
    })),
  );

  const available = pool.lines.filter(selectable);
  const allPicked =
    available.length > 0 && available.every((line) => picked[line.po_line_id] != null);

  /** A general-scope PO has no plot or unit, so there is no site to
   * unload at and nowhere in Stock for the goods to show — those must
   * go into a store. The database refuses it too (migration 0024). */
  const hasSite = pool.site_label !== null;
  const destinationChosen = (toSite && hasSite) || storeId !== "";

  const commit = () =>
    startSaving(async () => {
      const result = await recordGoodsReceipt({
        poId: pool.po_id,
        storeId: toSite ? null : storeId,
        toSite,
        challanNo: challanNo || null,
        receivedAt: receivedAt || null,
        note: note || null,
        lines: pickedEntries.map(([poLineId, quantity]) => ({ poLineId, quantity })),
      });
      if (result?.error) {
        setError(result.error);
        // A partial record still changed the order: drop what went in so
        // a second press can't book the same delivery twice.
        router.refresh();
        setPicked({});
      }
      // On success the action redirects to the delivery note.
    });

  return (
    <div className="space-y-6 pb-28">
      <section className="border-border bg-surface space-y-4 rounded-2xl border p-4">
        <h2 className="text-muted text-xs font-semibold tracking-widest uppercase">
          Where did it go?
        </h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="destination-store">Into a store</Label>
            <Select
              id="destination-store"
              value={toSite ? "" : storeId}
              disabled={toSite}
              onChange={(event) => setStoreId(event.target.value)}
            >
              <option value="">Pick a store…</option>
              {pool.stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </Select>
            {pool.stores.length === 0 && (
              <p className="text-muted text-xs">
                No stores are set up yet — add them in Masters, or record this as delivered to site.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="destination-site">Or straight to site</Label>
            <label
              htmlFor="destination-site"
              className={`border-border bg-background flex h-11 items-center gap-2.5 rounded-xl border px-3.5 ${
                hasSite ? "" : "opacity-60"
              }`}
            >
              <Checkbox
                id="destination-site"
                checked={toSite}
                disabled={!hasSite}
                onChange={(event) => setToSite(event.target.checked)}
              />
              <span className="text-foreground text-sm">
                Unloaded at {pool.site_label ?? "site"}
              </span>
            </label>
            <p className="text-muted text-xs">
              {hasSite
                ? "Site deliveries show against that plot in Stock, but never enter a store's balance — they are used where they land."
                : "This is a general purchase order with no plot or unit, so there is no site to deliver to. Receive it into a store."}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="challan-no">Challan / delivery note no.</Label>
            <Input
              id="challan-no"
              value={challanNo}
              onChange={(event) => setChallanNo(event.target.value)}
              placeholder="As written on the vendor's paper"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="received-at">Received on</Label>
            <Input
              id="received-at"
              type="date"
              value={receivedAt}
              onChange={(event) => setReceivedAt(event.target.value)}
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="receipt-note">Note</Label>
            <Input
              id="receipt-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Anything worth remembering about this delivery"
            />
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-muted text-xs font-semibold tracking-widest uppercase">
            What arrived
          </h2>
          <Button
            size="sm"
            variant="secondary"
            disabled={available.length === 0}
            onClick={() => toggleAll(!allPicked)}
          >
            {allPicked ? "Clear" : "Everything outstanding"}
          </Button>
        </div>

        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell className="w-10"></TableHeaderCell>
              <TableHeaderCell className="w-14"></TableHeaderCell>
              <TableHeaderCell>Item</TableHeaderCell>
              <TableHeaderCell className="w-28">Ordered</TableHeaderCell>
              <TableHeaderCell className="w-28">Received</TableHeaderCell>
              <TableHeaderCell className="w-36">Arrived now</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {pool.lines.map((line) => {
              const chosen = picked[line.po_line_id] != null;
              const disabled = !selectable(line);
              const tooMuch = chosen && (picked[line.po_line_id] ?? 0) > line.remaining;
              return (
                <TableRow key={line.po_line_id} className={disabled ? "opacity-60" : undefined}>
                  <TableCell>
                    <Checkbox
                      checked={chosen}
                      disabled={disabled}
                      onChange={(event) => toggle(line, event.target.checked)}
                      aria-label={`Receive ${line.item_name}`}
                    />
                  </TableCell>
                  <TableCell>
                    <ItemThumb
                      code={line.item_code}
                      name={line.item_name}
                      thumbUrl={line.item_thumb_url}
                      sizes="48px"
                      className="w-10"
                    />
                  </TableCell>
                  <TableCell>
                    <span className="text-foreground font-medium">{line.item_name}</span>
                    <div className="text-muted text-xs">
                      {line.item_code ?? "—"}
                      {line.item_brand && <span className="ml-2">{line.item_brand}</span>}
                      {disabled && (
                        <span className="text-accent ml-2 font-medium">fully received</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted">
                    {formatQuantity(line.ordered)} {line.uom}
                  </TableCell>
                  <TableCell className="text-muted">
                    {line.received > 0 ? `${formatQuantity(line.received)} ${line.uom}` : "—"}
                  </TableCell>
                  <TableCell>
                    {chosen ? (
                      <>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            step="any"
                            min="0"
                            max={line.remaining}
                            value={String(picked[line.po_line_id])}
                            onChange={(event) =>
                              setPicked((current) => ({
                                ...current,
                                [line.po_line_id]: Number(event.target.value),
                              }))
                            }
                            className="h-9"
                            aria-label={`Quantity received for ${line.item_name}`}
                          />
                          <span className="text-muted text-xs whitespace-nowrap">{line.uom}</span>
                        </div>
                        {tooMuch && (
                          <p className="text-warning mt-1 text-xs font-medium">
                            Only {formatQuantity(line.remaining)} {line.uom} still to come
                          </p>
                        )}
                      </>
                    ) : (
                      <span className="text-muted/50 text-sm">—</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </section>

      {/* Nothing has been written yet — this bar is the commit point. */}
      <div className="border-border bg-surface fixed inset-x-0 bottom-0 z-10 mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 border-t px-5 py-3 md:rounded-t-2xl md:border">
        <div className="min-w-0">
          {pickedEntries.length === 0 ? (
            <p className="text-muted text-sm">
              Tick what turned up, or take everything still outstanding.
            </p>
          ) : (
            <p className="text-foreground text-sm font-medium">
              {pickedEntries.length} {pickedEntries.length === 1 ? "line" : "lines"} against{" "}
              {pool.reference}
              {finishesOrder && (
                <span className="text-accent ml-2">· this completes the order</span>
              )}
            </p>
          )}
          <FormMessage error={error} size="xs" />
        </div>
        <div className="flex items-center gap-2">
          {pickedEntries.length > 0 && (
            <Button variant="ghost" onClick={() => setPicked({})} disabled={saving}>
              Clear
            </Button>
          )}
          <Button
            onClick={commit}
            disabled={
              saving ||
              pickedEntries.length === 0 ||
              !destinationChosen ||
              overRemaining ||
              pickedEntries.some(([, quantity]) => !Number.isFinite(quantity) || quantity <= 0)
            }
          >
            {saving ? "Recording…" : "Record delivery"}
          </Button>
        </div>
      </div>
    </div>
  );
}
