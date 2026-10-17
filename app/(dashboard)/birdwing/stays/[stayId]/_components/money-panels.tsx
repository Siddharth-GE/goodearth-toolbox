"use client";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FormMessage } from "@/components/ui/form-message";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Section } from "@/components/ui/section";
import { Select } from "@/components/ui/select";
import { addReceipt, addSettlement, deleteReceipt, deleteSettlement } from "@/lib/birdwing/actions";
import type { StayReceipt, StaySettlement } from "@/lib/birdwing/queries";
import { MODE_LABELS, RECEIPT_MODES } from "@/lib/birdwing/shared";
import { formatDate, formatMoney } from "@/lib/format";
import { Trash2 } from "lucide-react";
import { useActionState, useState } from "react";

const money = (value: number) => formatMoney(value, { paise: value % 1 !== 0 });

/** Each receipt has a date, how it came and a reference, so it can be found in the bank. A wrong one is removed and re-entered (audit keeps both). */
export function ReceiptsPanel({
  stayId,
  receipts,
  pending,
  today,
  canAdd,
}: {
  stayId: string;
  receipts: StayReceipt[];
  pending: number;
  today: string;
  canAdd: boolean;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <Section
      title="Received"
      aside={
        canAdd && !adding ? (
          <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
            Record a receipt
          </Button>
        ) : null
      }
    >
      {receipts.length === 0 && !adding ? (
        <p className="text-muted text-sm">Nothing received yet.</p>
      ) : (
        <ul className="divide-border divide-y">
          {receipts.map((receipt) => (
            <li key={receipt.id} className="flex items-start justify-between gap-3 py-2.5">
              <div className="min-w-0 text-sm">
                <p className="text-foreground">
                  <span className="font-mono font-medium">{money(receipt.amount)}</span>
                  <span className="text-muted">
                    {" "}
                    · {receipt.imported
                      ? "from the old sheet"
                      : formatDate(receipt.receivedOn)} · {MODE_LABELS[receipt.mode]}
                  </span>
                </p>
                <p className="text-muted text-xs">
                  {[
                    receipt.reference,
                    receipt.invoiceNumber && `against ${receipt.invoiceNumber}`,
                    receipt.note,
                    receipt.byName && `by ${receipt.byName}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <ConfirmDialog
                trigger={
                  <IconButton aria-label="Remove this receipt" tone="danger" size="sm">
                    <Trash2 className="size-4" />
                  </IconButton>
                }
                title="Remove this receipt?"
                description={`${money(receipt.amount)} received ${formatDate(receipt.receivedOn)} comes off this stay. Enter it again if it was only wrong.`}
                confirmLabel="Remove"
                pendingLabel="Removing…"
                onConfirm={() => deleteReceipt(receipt.id)}
              />
            </li>
          ))}
        </ul>
      )}
      {adding && (
        <ReceiptForm
          stayId={stayId}
          pending={pending}
          today={today}
          onDone={() => setAdding(false)}
        />
      )}
    </Section>
  );
}

function ReceiptForm({
  stayId,
  pending,
  today,
  onDone,
}: {
  stayId: string;
  pending: number;
  today: string;
  onDone: () => void;
}) {
  const [state, formAction, busy] = useActionState(
    async (prev: { error?: string } | undefined, formData: FormData) => {
      const result = await addReceipt(stayId, prev, formData);
      if (!result?.error) onDone();
      return result;
    },
    undefined,
  );
  return (
    <form action={formAction} className="border-border mt-3 space-y-3 border-t pt-3">
      <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="receipt-amount">Amount (₹)</Label>
          <Input
            id="receipt-amount"
            name="amount"
            inputMode="decimal"
            defaultValue={pending >= 1 ? String(Math.round(pending * 100) / 100) : ""}
            required
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="receipt-date">Received on</Label>
          <Input
            id="receipt-date"
            name="received_on"
            type="date"
            defaultValue={today}
            max={today}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="receipt-mode">How</Label>
          <Select id="receipt-mode" name="mode" defaultValue="upi">
            {RECEIPT_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {MODE_LABELS[mode]}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="receipt-ref">Reference</Label>
          <Input
            id="receipt-ref"
            name="reference"
            maxLength={80}
            placeholder="UTR, cheque no., OTA payout"
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="receipt-note">Note</Label>
          <Input id="receipt-note" name="note" maxLength={200} placeholder="e.g. Advance" />
        </div>
      </fieldset>
      <FormMessage error={state?.error} />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onDone} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? "Saving…" : "Record receipt"}
        </Button>
      </div>
    </form>
  );
}

/** An internal stay is charged to its Goodearth cost centre (a transfer, never income); a guest's lost balance is written off with a reason. */
export function SettlePanel({
  stayId,
  internal,
  settlements,
  pending,
  costCentres,
  defaultCostCentreId,
  defaultMonth,
}: {
  stayId: string;
  internal: boolean;
  settlements: StaySettlement[];
  pending: number;
  costCentres: { id: string; name: string }[];
  defaultCostCentreId: string | null;
  defaultMonth: string;
}) {
  const [state, formAction, busy] = useActionState(addSettlement.bind(null, stayId), undefined);
  const [kind, setKind] = useState<"cross_charge" | "write_off">(
    internal ? "cross_charge" : "write_off",
  );

  return (
    <Section
      title={internal ? "Charge to Goodearth" : "Write off"}
      note={
        internal
          ? "A Goodearth stay is closed by charging it to the cost centre that carries it."
          : "Only for a balance that will never be paid."
      }
    >
      {settlements.length > 0 && (
        <ul className="divide-border mb-3 divide-y">
          {settlements.map((settlement) => (
            <li key={settlement.id} className="flex items-start justify-between gap-3 py-2.5">
              <div className="min-w-0 text-sm">
                <p>
                  <span className="font-mono font-medium">{money(settlement.amount)}</span>
                  <span className="text-muted">
                    {" "}
                    ·{" "}
                    {settlement.kind === "write_off"
                      ? "written off"
                      : `charged to ${settlement.costCentreName ?? "a cost centre"}`}{" "}
                    ·{" "}
                    {new Date(`${settlement.month}T00:00:00Z`).toLocaleDateString("en-IN", {
                      month: "short",
                      year: "numeric",
                      timeZone: "UTC",
                    })}
                  </span>
                </p>
                <p className="text-muted text-xs">
                  {[settlement.note, settlement.byName && `by ${settlement.byName}`]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <ConfirmDialog
                trigger={
                  <IconButton aria-label="Undo this" tone="danger" size="sm">
                    <Trash2 className="size-4" />
                  </IconButton>
                }
                title="Undo this?"
                description={`${money(settlement.amount)} goes back to pending on this stay.`}
                confirmLabel="Undo"
                pendingLabel="Undoing…"
                onConfirm={() => deleteSettlement(settlement.id)}
              />
            </li>
          ))}
        </ul>
      )}

      {pending >= 1 && (
        <form action={formAction} className="space-y-3">
          <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="settle-kind">How</Label>
              <Select
                id="settle-kind"
                name="kind"
                value={kind}
                onChange={(event) =>
                  setKind(event.target.value === "write_off" ? "write_off" : "cross_charge")
                }
              >
                <option value="cross_charge">Charge to a cost centre</option>
                <option value="write_off">Write off</option>
              </Select>
            </div>
            {kind === "cross_charge" && (
              <div className="space-y-1.5">
                <Label htmlFor="settle-centre">Cost centre</Label>
                <Select
                  id="settle-centre"
                  name="cost_centre_id"
                  defaultValue={defaultCostCentreId ?? ""}
                  required
                >
                  <option value="" disabled>
                    Pick…
                  </option>
                  {costCentres.map((centre) => (
                    <option key={centre.id} value={centre.id}>
                      {centre.name}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="settle-amount">Amount (₹)</Label>
              <Input
                id="settle-amount"
                name="amount"
                inputMode="decimal"
                defaultValue={String(Math.round(pending * 100) / 100)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="settle-month">Month</Label>
              <Input
                id="settle-month"
                name="month"
                type="month"
                defaultValue={defaultMonth.slice(0, 7)}
                required
              />
            </div>
            <div className="space-y-1.5 sm:col-span-4">
              <Label htmlFor="settle-note">{kind === "write_off" ? "Why" : "Note"}</Label>
              <Input
                id="settle-note"
                name="note"
                maxLength={200}
                required={kind === "write_off"}
                placeholder={kind === "write_off" ? "e.g. Guest left without paying" : "Optional"}
              />
            </div>
          </fieldset>
          <FormMessage error={state?.error} />
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? "Saving…" : kind === "write_off" ? "Write it off" : "Charge it"}
            </Button>
          </div>
        </form>
      )}
    </Section>
  );
}
