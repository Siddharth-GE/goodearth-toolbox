"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { parseNumber } from "@/lib/form-data";
import { formatQuantity } from "@/lib/format";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import { confirmSiteReceipt } from "@/lib/supervisors/site-receipt-actions";
import { isShort, siteReceiptProblem } from "@/lib/supervisors/site-receipt";
import type { VillaDelivery } from "@/lib/supervisors/site-receipt-queries";
import { useState } from "react";

/** One tap when everything arrived: quantities start at what was sent. A short line asks why. */
export function ConfirmDeliveryDialog({ delivery }: { delivery: VillaDelivery }) {
  const full = () => Object.fromEntries(delivery.lines.map((line) => [line.id, String(line.sent)]));
  const [open, setOpen] = useState(false);
  const [received, setReceived] = useState<Record<string, string>>(full);
  const [note, setNote] = useState("");
  const { pending, error, run, clearError } = useActionRunner();

  const lines = delivery.lines.map((line) => ({
    lineId: line.id,
    sent: line.sent,
    received: parseNumber(received[line.id] ?? ""),
  }));
  const anyShort = lines.some(isShort);
  const problem = siteReceiptProblem(lines, note || null);

  const confirm = async () => {
    const result = await run(() =>
      confirmSiteReceipt({
        kind: delivery.kind,
        id: delivery.id,
        received: Object.fromEntries(lines.map((line) => [line.lineId, line.received])),
        note: note || null,
      }),
    );
    if (!result?.error) setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        if (next) {
          setReceived(full());
          setNote("");
          clearError();
        }
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">Confirm</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{`What reached the site — ${delivery.reference}`}</DialogTitle>
          <DialogDescription>
            Each quantity starts at what was sent. Change any that arrived short.
          </DialogDescription>
        </DialogHeader>
        <ul className="divide-border divide-y">
          {delivery.lines.map((line) => (
            <li key={line.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="text-foreground text-sm font-medium">{line.itemName}</p>
                <p className="text-muted text-xs">{`Sent ${formatQuantity(line.sent)} ${line.uom}`}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min="0"
                  max={line.sent}
                  value={received[line.id] ?? ""}
                  onChange={(event) =>
                    setReceived((current) => ({ ...current, [line.id]: event.target.value }))
                  }
                  className="h-11 w-24"
                  aria-label={`Arrived of ${line.itemName}`}
                />
                <span className="text-muted text-xs">{line.uom}</span>
              </div>
            </li>
          ))}
        </ul>
        {anyShort && (
          <div className="space-y-1.5">
            <Label htmlFor={`short-${delivery.id}`}>Why is it short?</Label>
            <Textarea
              id={`short-${delivery.id}`}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              placeholder="e.g. Two bags torn, returned to the driver"
            />
          </div>
        )}
        {!error && problem && <p className="text-muted text-xs">{problem}</p>}
        <FormMessage error={error} />
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary" disabled={pending}>
              Not now
            </Button>
          </DialogClose>
          <Button onClick={confirm} disabled={pending || Boolean(problem)}>
            {pending ? "Confirming…" : anyShort ? "Confirm with shortage" : "All arrived"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
