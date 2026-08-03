"use client";

import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { formatDate } from "@/lib/format";
import { updatePoHeader } from "@/lib/purchase-orders/actions";
import type { PoStoreOption, PoVendorOption } from "@/lib/purchase-orders/queries";
import { useSaveOnBlur } from "@/lib/hooks/use-save-on-blur";
import { useState } from "react";

/**
 * The PO's own fields — vendor, deliver-to, expected-by, terms, note —
 * editable on blur while it's a draft, read-only once issued. The
 * project and plot/unit scope are NOT here: they're part of the number
 * and permanent (re-scoping means delete and re-raise). The database
 * guard refuses header edits past draft, so read-only here is honesty,
 * not enforcement.
 */
export function HeaderFields({
  poId,
  vendorId,
  vendorName,
  deliverStoreId,
  deliverNote,
  expectedBy,
  terms,
  note,
  editable,
  vendors,
  stores,
}: {
  poId: string;
  vendorId: string;
  vendorName: string;
  deliverStoreId: string | null;
  deliverNote: string | null;
  expectedBy: string | null;
  terms: string | null;
  note: string | null;
  editable: boolean;
  vendors: PoVendorOption[];
  stores: PoStoreOption[];
}) {
  const [vendorValue, setVendorValue] = useState(vendorId);
  const [storeValue, setStoreValue] = useState(deliverStoreId ?? "");
  const [deliverNoteValue, setDeliverNoteValue] = useState(deliverNote ?? "");
  const [expectedByValue, setExpectedByValue] = useState(expectedBy ?? "");
  const [termsValue, setTermsValue] = useState(terms ?? "");
  const [noteValue, setNoteValue] = useState(note ?? "");

  const { flush, error, saved } = useSaveOnBlur({
    initial: {
      vendorId,
      storeId: deliverStoreId ?? "",
      deliverNote: deliverNote ?? "",
      expectedBy: expectedBy ?? "",
      terms: terms ?? "",
      note: note ?? "",
    },
    save: (value) =>
      updatePoHeader(poId, {
        vendorId: value.vendorId,
        deliverStoreId: value.storeId || null,
        deliverNote: value.deliverNote || null,
        expectedBy: value.expectedBy || null,
        terms: value.terms || null,
        note: value.note || null,
      }),
  });

  const save = (overrides?: { vendorId?: string; storeId?: string }) =>
    flush({
      vendorId: overrides?.vendorId ?? vendorValue,
      storeId: overrides?.storeId ?? storeValue,
      deliverNote: deliverNoteValue,
      expectedBy: expectedByValue,
      terms: termsValue,
      note: noteValue,
    });

  if (!editable) {
    const storeName = stores.find((store) => store.id === deliverStoreId)?.name;
    return (
      <div className="border-border bg-surface grid gap-4 rounded-2xl border p-4 sm:grid-cols-3">
        <ReadOnlyField label="Vendor" value={vendorName} />
        <ReadOnlyField label="Deliver to" value={storeName ?? deliverNote ?? "—"} />
        <ReadOnlyField label="Expected by" value={formatDate(expectedBy)} />
        <ReadOnlyField label="Terms" value={terms ?? "—"} />
        <ReadOnlyField label="Delivery note" value={deliverNote ?? "—"} />
        <ReadOnlyField label="Note" value={note ?? "—"} />
      </div>
    );
  }

  return (
    <div className="border-border bg-surface space-y-3 rounded-2xl border p-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="po-header-vendor">Vendor</Label>
          {/* Saved immediately on change — a select has no meaningful
              blur (the uom-select rule from the indent grid). */}
          <Select
            id="po-header-vendor"
            value={vendorValue}
            onChange={(event) => {
              setVendorValue(event.target.value);
              save({ vendorId: event.target.value });
            }}
          >
            {vendors.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="po-header-store">Deliver to store</Label>
          <Select
            id="po-header-store"
            value={storeValue}
            onChange={(event) => {
              setStoreValue(event.target.value);
              save({ storeId: event.target.value });
            }}
          >
            <option value="">None — see delivery note</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="po-header-expected">Expected by</Label>
          <Input
            id="po-header-expected"
            type="date"
            value={expectedByValue}
            onChange={(event) => setExpectedByValue(event.target.value)}
            onBlur={() => save()}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="po-header-deliver-note">Delivery note</Label>
          <Input
            id="po-header-deliver-note"
            value={deliverNoteValue}
            onChange={(event) => setDeliverNoteValue(event.target.value)}
            onBlur={() => save()}
            placeholder="Site address, who to call…"
            autoComplete="off"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="po-header-terms">Payment terms</Label>
          <Input
            id="po-header-terms"
            value={termsValue}
            onChange={(event) => setTermsValue(event.target.value)}
            onBlur={() => save()}
            placeholder="e.g. 50% advance"
            autoComplete="off"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="po-header-note">Note</Label>
          <Input
            id="po-header-note"
            value={noteValue}
            onChange={(event) => setNoteValue(event.target.value)}
            onBlur={() => save()}
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
