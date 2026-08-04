"use client";

import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateBill } from "@/lib/bills/actions";
import { formatDate, formatMoney } from "@/lib/format";
import { useSaveOnBlur } from "@/lib/hooks/use-save-on-blur";
import { useState } from "react";

/**
 * The bill's own fields — invoice number/date, the paper's three
 * figures, the note — editable on blur while it's recorded, read-only
 * once approved. The anchor, vendor and scope are NOT here: they're
 * part of the number and permanent (a wrong anchor means delete and
 * re-record). The database guard refuses edits past recorded, so
 * read-only here is honesty, not enforcement.
 */
export function HeaderFields({
  billId,
  invoiceNo,
  invoiceDate,
  taxableAmount,
  gstAmount,
  totalAmount,
  note,
  editable,
}: {
  billId: string;
  invoiceNo: string;
  invoiceDate: string;
  taxableAmount: number;
  gstAmount: number;
  totalAmount: number;
  note: string | null;
  editable: boolean;
}) {
  const [invoiceNoValue, setInvoiceNoValue] = useState(invoiceNo);
  const [invoiceDateValue, setInvoiceDateValue] = useState(invoiceDate);
  const [taxableValue, setTaxableValue] = useState(String(taxableAmount));
  const [gstValue, setGstValue] = useState(String(gstAmount));
  const [totalValue, setTotalValue] = useState(String(totalAmount));
  const [noteValue, setNoteValue] = useState(note ?? "");

  const { flush, error, saved } = useSaveOnBlur({
    initial: {
      invoiceNo,
      invoiceDate,
      taxable: String(taxableAmount),
      gst: String(gstAmount),
      total: String(totalAmount),
      note: note ?? "",
    },
    validate: (value) => {
      if (!value.invoiceNo.trim()) return "The invoice number can't be blank.";
      if (!value.invoiceDate) return "The invoice date can't be blank.";
      const taxable = Number(value.taxable);
      const gst = Number(value.gst);
      const total = Number(value.total);
      if (!Number.isFinite(taxable) || taxable < 0) return "Taxable must be zero or more.";
      if (!Number.isFinite(gst) || gst < 0) return "GST must be zero or more.";
      if (!Number.isFinite(total) || total <= 0) return "The total must be more than zero.";
      return undefined;
    },
    save: (value) =>
      updateBill(billId, {
        invoiceNo: value.invoiceNo,
        invoiceDate: value.invoiceDate,
        taxableAmount: Number(value.taxable),
        gstAmount: Number(value.gst),
        totalAmount: Number(value.total),
        note: value.note || null,
      }),
  });

  const save = () =>
    flush({
      invoiceNo: invoiceNoValue,
      invoiceDate: invoiceDateValue,
      taxable: taxableValue,
      gst: gstValue,
      total: totalValue,
      note: noteValue,
    });

  if (!editable) {
    return (
      <div className="border-border bg-surface grid gap-4 rounded-2xl border p-4 sm:grid-cols-3">
        <ReadOnlyField label="Invoice number" value={invoiceNo} />
        <ReadOnlyField label="Invoice date" value={formatDate(invoiceDate)} />
        <ReadOnlyField label="Taxable" value={formatMoney(taxableAmount)} />
        <ReadOnlyField label="GST" value={formatMoney(gstAmount)} />
        <ReadOnlyField label="Total" value={formatMoney(totalAmount)} />
        <ReadOnlyField label="Note" value={note ?? "—"} />
      </div>
    );
  }

  return (
    <div className="border-border bg-surface space-y-3 rounded-2xl border p-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="bill-header-invoice-no">Invoice number</Label>
          <Input
            id="bill-header-invoice-no"
            value={invoiceNoValue}
            onChange={(event) => setInvoiceNoValue(event.target.value)}
            onBlur={save}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bill-header-invoice-date">Invoice date</Label>
          <Input
            id="bill-header-invoice-date"
            type="date"
            value={invoiceDateValue}
            onChange={(event) => setInvoiceDateValue(event.target.value)}
            onBlur={save}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bill-header-taxable">Taxable (₹)</Label>
          <Input
            id="bill-header-taxable"
            type="number"
            min="0"
            step="0.01"
            value={taxableValue}
            onChange={(event) => setTaxableValue(event.target.value)}
            onBlur={save}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bill-header-gst">GST (₹)</Label>
          <Input
            id="bill-header-gst"
            type="number"
            min="0"
            step="0.01"
            value={gstValue}
            onChange={(event) => setGstValue(event.target.value)}
            onBlur={save}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bill-header-total">Total (₹)</Label>
          <Input
            id="bill-header-total"
            type="number"
            min="0.01"
            step="0.01"
            value={totalValue}
            onChange={(event) => setTotalValue(event.target.value)}
            onBlur={save}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bill-header-note">Note</Label>
          <Input
            id="bill-header-note"
            value={noteValue}
            onChange={(event) => setNoteValue(event.target.value)}
            onBlur={save}
            placeholder="—"
            autoComplete="off"
          />
        </div>
      </div>
      <FormMessage error={error} success={saved ? "Saved" : undefined} size="xs" />
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted text-xs font-semibold tracking-widest uppercase">{label}</p>
      <p className="text-foreground mt-1 text-sm">{value}</p>
    </div>
  );
}
