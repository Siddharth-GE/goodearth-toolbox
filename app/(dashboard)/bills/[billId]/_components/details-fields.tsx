"use client";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setBillTotalOverride, updateBillDetails } from "@/lib/bills/line-actions";
import { formatDate, formatMoney } from "@/lib/format";
import { useSaveOnBlur } from "@/lib/hooks/use-save-on-blur";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/**
 * An itemised bill's own fields. The invoice number, date and note are
 * edited on blur while it is recorded; the taxable, GST and total are the
 * lines' sums (the database writes them), so they are shown, not typed.
 */
export function DetailsFields({
  billId,
  invoiceNo,
  invoiceDate,
  note,
  taxableAmount,
  gstAmount,
  totalAmount,
  editable,
}: {
  billId: string;
  invoiceNo: string;
  invoiceDate: string;
  note: string | null;
  taxableAmount: number;
  gstAmount: number;
  totalAmount: number;
  editable: boolean;
}) {
  const [invoiceNoValue, setInvoiceNoValue] = useState(invoiceNo);
  const [invoiceDateValue, setInvoiceDateValue] = useState(invoiceDate);
  const [noteValue, setNoteValue] = useState(note ?? "");

  const { flush, error, saved } = useSaveOnBlur({
    initial: { invoiceNo, invoiceDate, note: note ?? "" },
    validate: (value) => {
      if (!value.invoiceNo.trim()) return "The invoice number can't be blank.";
      if (!value.invoiceDate) return "The invoice date can't be blank.";
      return undefined;
    },
    save: (value) =>
      updateBillDetails(billId, {
        invoiceNo: value.invoiceNo,
        invoiceDate: value.invoiceDate,
        note: value.note || null,
      }),
  });
  const save = () =>
    flush({ invoiceNo: invoiceNoValue, invoiceDate: invoiceDateValue, note: noteValue });

  const figures = (
    <>
      <ReadOnlyField label="Taxable" value={formatMoney(taxableAmount, { paise: true })} />
      <ReadOnlyField label="GST" value={formatMoney(gstAmount, { paise: true })} />
      <ReadOnlyField label="Total" value={formatMoney(totalAmount, { paise: true })} />
    </>
  );

  if (!editable) {
    return (
      <div className="border-border bg-surface grid gap-4 rounded-2xl border p-4 sm:grid-cols-3">
        <ReadOnlyField label="Invoice number" value={invoiceNo} />
        <ReadOnlyField label="Invoice date" value={formatDate(invoiceDate)} />
        <ReadOnlyField label="Note" value={note ?? "—"} />
        {figures}
      </div>
    );
  }

  return (
    <div className="border-border bg-surface space-y-3 rounded-2xl border p-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="bill-invoice-no">Invoice number</Label>
          <Input
            id="bill-invoice-no"
            value={invoiceNoValue}
            onChange={(event) => setInvoiceNoValue(event.target.value)}
            onBlur={save}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bill-invoice-date">Invoice date</Label>
          <Input
            id="bill-invoice-date"
            type="date"
            value={invoiceDateValue}
            onChange={(event) => setInvoiceDateValue(event.target.value)}
            onBlur={save}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bill-note">Note</Label>
          <Input
            id="bill-note"
            value={noteValue}
            onChange={(event) => setNoteValue(event.target.value)}
            onBlur={save}
            placeholder="—"
            autoComplete="off"
          />
        </div>
        {figures}
      </div>
      <p className="text-muted text-xs">
        The figures are the lines&apos; sums — change a line to change them.
      </p>
      <FormMessage error={error} success={saved ? "Saved" : undefined} size="xs" />
    </div>
  );
}

/**
 * A daily-wages bill whose muster roll totals differently from heads ×
 * rates: a different total, with a note saying why (0106).
 */
export function TotalOverride({
  billId,
  currentTotal,
  overrideNote,
}: {
  billId: string;
  currentTotal: number;
  overrideNote: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [total, setTotal] = useState(String(currentTotal));
  const [note, setNote] = useState(overrideNote ?? "");
  const [error, setError] = useState<string>();
  const [saving, startSaving] = useTransition();

  const run = (input: { total: number | null; note: string | null }) =>
    startSaving(async () => {
      setError(undefined);
      const result = await setBillTotalOverride(billId, input);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });

  if (overrideNote && !open) {
    return (
      <div className="border-warning/40 bg-warning/5 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3">
        <p className="text-foreground text-sm">
          {`The total is set by hand to ${formatMoney(currentTotal, { paise: true })} — ${overrideNote}`}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
            Change
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={saving}
            onClick={() => run({ total: null, note: null })}
          >
            Use the lines&apos; total
          </Button>
        </div>
        <FormMessage error={error} size="xs" />
      </div>
    );
  }

  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        The muster roll totals differently?
      </Button>
    );
  }

  return (
    <div className="border-border bg-surface flex flex-wrap items-end gap-3 rounded-xl border px-4 py-3">
      <div className="space-y-1.5">
        <Label htmlFor="override-total">Total (₹)</Label>
        <Input
          id="override-total"
          type="number"
          step="0.01"
          min="0.01"
          value={total}
          onChange={(event) => setTotal(event.target.value)}
          className="w-40"
        />
      </div>
      <div className="min-w-64 flex-1 space-y-1.5">
        <Label htmlFor="override-note">Why it differs</Label>
        <Input
          id="override-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="e.g. Half day on the 4th for two helpers"
          autoComplete="off"
        />
      </div>
      <Button
        size="sm"
        disabled={saving}
        onClick={() => run({ total: Number(total), note: note || null })}
      >
        {saving ? "Saving…" : "Set the total"}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
        Cancel
      </Button>
      <FormMessage error={error} size="xs" />
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">{label}</p>
      <p className="text-foreground mt-1 text-sm">{value}</p>
    </div>
  );
}
