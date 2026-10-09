"use client";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { paymentProblem } from "@/lib/bills/ledger";
import { recordBillPayment, recoverAdvance } from "@/lib/bills/payment-actions";
import type { OpenAdvance } from "@/lib/bills/payment-queries";
import { formatDate, formatMoney } from "@/lib/format";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Paying an approved bill (0107): a payment of all or part of what is
 * pending, or part of an open advance recovered against it. When the two
 * reach the total, the database marks the bill paid by itself.
 */
export function SettlementPanel({
  billId,
  pending,
  advances,
}: {
  billId: string;
  pending: number;
  /** The contractor's advances with something left to recover. */
  advances: OpenAdvance[];
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"pay" | "recover" | null>(null);
  const [amount, setAmount] = useState(String(pending));
  const [paidOn, setPaidOn] = useState(today);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [advanceId, setAdvanceId] = useState(advances[0]?.id ?? "");
  const [error, setError] = useState<string>();
  const [saving, startSaving] = useTransition();

  const advance = advances.find((candidate) => candidate.id === advanceId);
  const value = Number(amount);
  const problem =
    mode === "pay"
      ? paymentProblem({ amount: value, reference, pending })
      : mode === "recover"
        ? !advance
          ? "Pick the advance."
          : !(value > 0)
            ? "The amount must be more than zero."
            : value > advance.outstanding + 0.005
              ? `Only ${formatMoney(advance.outstanding, { paise: true })} of that advance is still to recover.`
              : value > pending + 0.005
                ? "That is more than this bill has pending."
                : undefined
        : undefined;

  const open = (next: "pay" | "recover") => {
    setMode(next);
    setError(undefined);
    setAmount(
      String(next === "recover" && advance ? Math.min(pending, advance.outstanding) : pending),
    );
  };

  const save = () =>
    startSaving(async () => {
      setError(undefined);
      const result =
        mode === "pay"
          ? await recordBillPayment(billId, {
              amount: value,
              paidOn,
              reference,
              note: note || null,
            })
          : await recoverAdvance(billId, {
              advanceId,
              amount: value,
              recoveredOn: paidOn,
              note: note || null,
            });
      if (result?.error) {
        setError(result.error);
        return;
      }
      setMode(null);
      setReference("");
      setNote("");
      router.refresh();
    });

  if (!mode) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => open("pay")}>
          Record a payment
        </Button>
        {advances.length > 0 && (
          <Button size="sm" variant="secondary" onClick={() => open("recover")}>
            Recover from an advance
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="border-border bg-surface space-y-3 rounded-2xl border p-4">
      <p className="text-foreground text-[15px] font-semibold tracking-tight">
        {mode === "pay" ? "Record a payment" : "Recover from an advance"}
      </p>
      <div className="grid gap-3 sm:grid-cols-4">
        {mode === "recover" && (
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="advance">Advance</Label>
            <Select
              id="advance"
              value={advanceId}
              onChange={(event) => setAdvanceId(event.target.value)}
            >
              {advances.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {`${formatDate(candidate.paid_on)} · ${candidate.project_name}${candidate.work_order ? ` · ${candidate.work_order}` : ""} — ${formatMoney(candidate.outstanding)} left`}
                </option>
              ))}
            </Select>
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="pay-amount">Amount (₹)</Label>
          <Input
            id="pay-amount"
            type="number"
            step="0.01"
            min="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
          <p className="text-muted text-xs">{`${formatMoney(pending, { paise: true })} pending`}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pay-date">{mode === "pay" ? "Paid on" : "On"}</Label>
          <Input
            id="pay-date"
            type="date"
            value={paidOn}
            onChange={(event) => setPaidOn(event.target.value)}
          />
        </div>
        {mode === "pay" && (
          <div className="space-y-1.5">
            <Label htmlFor="pay-ref">UTR / cheque / UPI ref</Label>
            <Input
              id="pay-ref"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              autoComplete="off"
            />
          </div>
        )}
        <div className="space-y-1.5 sm:col-span-4">
          <Label htmlFor="pay-note">Note (optional)</Label>
          <Input
            id="pay-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            autoComplete="off"
          />
        </div>
      </div>
      <p className="text-muted text-xs">
        Money recorded here is permanent — a mistake is corrected with accounts and an admin, not
        edited.
      </p>
      <div className="flex flex-wrap items-center justify-end gap-3">
        {!error && problem && <p className="text-muted text-xs">{problem}</p>}
        <FormMessage error={error} size="xs" />
        <Button variant="ghost" size="sm" onClick={() => setMode(null)}>
          Cancel
        </Button>
        <Button size="sm" disabled={saving || Boolean(problem)} onClick={save}>
          {saving ? "Saving…" : mode === "pay" ? "Record the payment" : "Recover it"}
        </Button>
      </div>
    </div>
  );
}
