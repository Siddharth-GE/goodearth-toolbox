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
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { addReceipt } from "@/lib/client-relations/actions";
import type { MilestoneRow } from "@/lib/client-relations/queries";
import { RECEIPT_MODES, milestoneLabel } from "@/lib/client-relations/stages";
import { formatMoney } from "@/lib/format";
import { useState, useTransition } from "react";

/**
 * Record money arriving. The first place in this whole app where a rupee
 * comes IN — everything monetary before Client Relations was payables.
 *
 * No approval step: Bills has one because approving a wrong bill pays
 * money out, whereas this records money that has already landed.
 */
export function ReceiptDialog({
  engagementId,
  milestones,
}: {
  engagementId: string;
  milestones: MilestoneRow[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Record a payment</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record a payment</DialogTitle>
        </DialogHeader>
        {/* Inside DialogContent, which Radix unmounts on close, so every
            open starts from a clean form rather than last time's error. */}
        <ReceiptForm
          engagementId={engagementId}
          milestones={milestones}
          onSaved={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function ReceiptForm({
  engagementId,
  milestones,
  onSaved,
}: {
  engagementId: string;
  milestones: MilestoneRow[];
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [receivedOn, setReceivedOn] = useState(new Date().toISOString().slice(0, 10));
  const [milestoneId, setMilestoneId] = useState("");
  const [mode, setMode] = useState("bank");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const amountNumber = Number(amount);
  const valid = amount !== "" && Number.isFinite(amountNumber) && amountNumber > 0 && !!receivedOn;

  const submit = () => {
    setError(undefined);
    startTransition(async () => {
      const result = await addReceipt({
        engagementId,
        milestoneId: milestoneId || null,
        amount: amountNumber,
        receivedOn,
        mode,
        reference: reference || null,
        note: note || null,
      });
      if (result?.error) {
        setError(result.error);
        return;
      }
      onSaved();
    });
  };

  return (
    <fieldset disabled={pending} className="min-w-0 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="receipt-amount">Amount (₹)</Label>
          <Input
            id="receipt-amount"
            type="number"
            min="0.01"
            step="0.01"
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            autoComplete="off"
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="receipt-date">Received on</Label>
          <Input
            id="receipt-date"
            type="date"
            value={receivedOn}
            onChange={(event) => setReceivedOn(event.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="receipt-milestone">Against</Label>
        <Select
          id="receipt-milestone"
          value={milestoneId}
          onChange={(event) => setMilestoneId(event.target.value)}
        >
          {/* Leaving this blank is legal and normal: money often arrives
              before anyone decides which instalment it settles, and it
              still counts towards what is owed. */}
          <option value="">Not decided yet</option>
          {milestones.map((milestone) => (
            <option key={milestone.id} value={milestone.id}>
              {milestoneLabel(milestone.stage)}
              {milestone.outstanding > 0
                ? ` — ${formatMoney(milestone.outstanding)} outstanding`
                : ""}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="receipt-mode">How</Label>
          <Select id="receipt-mode" value={mode} onChange={(event) => setMode(event.target.value)}>
            {RECEIPT_MODES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="receipt-reference">Reference</Label>
          <Input
            id="receipt-reference"
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            placeholder="UTR, cheque number…"
            autoComplete="off"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="receipt-note">Note</Label>
        <Input
          id="receipt-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="—"
          autoComplete="off"
        />
      </div>

      <FormMessage error={error} />

      <DialogFooter>
        <DialogClose asChild>
          <Button variant="secondary">Cancel</Button>
        </DialogClose>
        <Button type="button" onClick={submit} disabled={!valid || pending}>
          {pending ? "Recording…" : "Record payment"}
        </Button>
      </DialogFooter>
    </fieldset>
  );
}
