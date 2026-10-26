"use client";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { ActionState } from "@/lib/action-state";
import { parseNumber } from "@/lib/form-data";
import { formatMoney, formatPercent } from "@/lib/format";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import { documentChargesProblem, type DocumentCharges } from "@/lib/line-money";
import { useState } from "react";

/**
 * Freight, loading and the like on a whole PO or bill (0133): one amount at its own GST %, apart
 * from any line's rate. Saved with a button, since the three fields only make sense together.
 */
export function ChargesBox({
  charges,
  gstRates,
  editable,
  save,
}: {
  charges: DocumentCharges;
  gstRates: number[];
  editable: boolean;
  save: (input: DocumentCharges) => Promise<ActionState>;
}) {
  const [amount, setAmount] = useState(charges.amount == null ? "" : String(charges.amount));
  const [gst, setGst] = useState(charges.gst_pct == null ? "18" : String(charges.gst_pct));
  const [note, setNote] = useState(charges.note ?? "");
  const [saved, setSaved] = useState(false);
  const { pending, error, run } = useActionRunner();

  if (!editable) {
    if (charges.amount == null) return null;
    return (
      <div className="border-border bg-surface rounded-2xl border p-4">
        <p className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">
          Additional charges
        </p>
        <p className="text-foreground mt-1 text-sm">
          {`${formatMoney(charges.amount, { paise: true })} + GST ${formatPercent(charges.gst_pct ?? 0)}`}
          {charges.note && <span className="text-muted">{` · ${charges.note}`}</span>}
        </p>
      </div>
    );
  }

  const value: DocumentCharges = {
    amount: parseNumber(amount),
    gst_pct: amount.trim() === "" ? null : parseNumber(gst),
    note: note.trim() || null,
  };
  const problem = documentChargesProblem(value);
  const unchanged =
    value.amount === charges.amount &&
    (value.amount === null || value.gst_pct === charges.gst_pct) &&
    (value.note ?? null) === (charges.note ?? null);

  const submit = async (input: DocumentCharges) => {
    setSaved(false);
    const result = await run(() => save(input));
    if (!result?.error) setSaved(true);
  };

  return (
    <div className="border-border bg-surface space-y-3 rounded-2xl border p-4">
      <div>
        <p className="text-foreground text-sm font-semibold">Additional charges</p>
        <p className="text-muted text-xs">
          Freight, loading or transport on the whole document, taxed at their own GST — not folded
          into a rate.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-[10rem_7rem_1fr]">
        <div className="space-y-1.5">
          <Label htmlFor="charges-amount">Amount (₹)</Label>
          <Input
            id="charges-amount"
            type="number"
            step="0.01"
            min="0.01"
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value);
              setSaved(false);
            }}
            placeholder="—"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="charges-gst">GST</Label>
          <Select
            id="charges-gst"
            value={gst}
            onChange={(event) => {
              setGst(event.target.value);
              setSaved(false);
            }}
          >
            {[...new Set([0, ...gstRates, Number(gst)])]
              .sort((a, b) => a - b)
              .map((slab) => (
                <option key={slab} value={String(slab)}>
                  {formatPercent(slab)}
                </option>
              ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="charges-note">What for</Label>
          <Input
            id="charges-note"
            value={note}
            onChange={(event) => {
              setNote(event.target.value);
              setSaved(false);
            }}
            placeholder="e.g. Freight to site"
            autoComplete="off"
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          onClick={() => submit(value)}
          disabled={pending || Boolean(problem) || unchanged}
        >
          {pending ? "Saving…" : "Save charges"}
        </Button>
        {charges.amount != null && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setAmount("");
              setNote("");
              void submit({ amount: null, gst_pct: null, note: null });
            }}
            disabled={pending}
          >
            Clear
          </Button>
        )}
        {!error && problem && amount.trim() !== "" && (
          <p className="text-muted text-xs">{problem}</p>
        )}
        <FormMessage error={error} success={saved ? "Saved" : undefined} size="xs" />
      </div>
    </div>
  );
}
