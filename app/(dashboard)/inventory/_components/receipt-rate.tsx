"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney, formatPercent } from "@/lib/format";
import { updateReceiptLineRate } from "@/lib/inventory/actions";
import { differsFromPo } from "@/lib/inventory/batches";
import type { ReceiptLineRate } from "@/lib/inventory/queries";
import { useState, useTransition } from "react";

/**
 * A delivery line's rate (0108): the PO's, copied when the goods were
 * received, or what the delivery bill said instead. A changed rate shows
 * the PO's beside it in amber, so accounts see every difference.
 */
export function ReceiptRate({
  receiptLineId,
  itemName,
  uom,
  rate,
}: {
  receiptLineId: string;
  itemName: string;
  uom: string;
  rate: ReceiptLineRate;
}) {
  const [open, setOpen] = useState(false);
  const [rateText, setRateText] = useState("");
  const [gstText, setGstText] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const differs = differsFromPo(rate);

  const save = () =>
    startTransition(async () => {
      const result = await updateReceiptLineRate(receiptLineId, {
        rate: rateText.trim() === "" ? Number.NaN : Number(rateText),
        gstPct: gstText.trim() === "" ? Number.NaN : Number(gstText),
        note: note || null,
      });
      if (result?.error) setError(result.error);
      else setOpen(false);
    });

  return (
    <div className="space-y-0.5">
      <p className="text-foreground font-mono whitespace-nowrap">
        {formatMoney(rate.rate, { paise: true })}
        <span className="text-muted font-sans text-xs"> / {uom}</span>
      </p>
      <p className="text-muted text-xs">GST {formatPercent(rate.gstPct)}</p>
      {differs && (
        <p className="text-warning text-xs font-medium">
          Differs from PO ({formatMoney(rate.poRate, { paise: true })} ·{" "}
          {formatPercent(rate.poGstPct)})
        </p>
      )}
      {rate.note && <p className="text-muted text-xs">{rate.note}</p>}
      <Button
        size="sm"
        variant="ghost"
        className="-ml-2"
        onClick={() => {
          setRateText(rate.rate === null ? "" : String(rate.rate));
          setGstText(rate.gstPct === null ? "" : String(rate.gstPct));
          setNote(rate.note ?? "");
          setError(undefined);
          setOpen(true);
        }}
      >
        Change
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Rate for {itemName}</DialogTitle>
            <DialogDescription>
              The PO said {formatMoney(rate.poRate, { paise: true })} per {uom} before GST, with{" "}
              {formatPercent(rate.poGstPct)} GST. Change it only when the delivery bill says
              otherwise — the difference shows in amber for accounts.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`rate-${receiptLineId}`}>Rate per {uom}, before GST (₹)</Label>
              <Input
                id={`rate-${receiptLineId}`}
                type="number"
                step="any"
                min="0"
                inputMode="decimal"
                value={rateText}
                onChange={(event) => setRateText(event.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`gst-${receiptLineId}`}>GST %</Label>
              <Input
                id={`gst-${receiptLineId}`}
                type="number"
                step="any"
                min="0"
                max="100"
                inputMode="decimal"
                value={gstText}
                onChange={(event) => setGstText(event.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor={`rate-note-${receiptLineId}`}>Note for accounts</Label>
              <Input
                id={`rate-note-${receiptLineId}`}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="What the delivery bill says, e.g. bill no. 4521"
              />
            </div>
          </div>
          <FormMessage error={error} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={save} disabled={pending}>
              {pending ? "Saving…" : "Save rate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
