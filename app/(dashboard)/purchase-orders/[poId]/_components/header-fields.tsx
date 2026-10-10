"use client";

import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/format";
import type { TermsTemplate } from "@/lib/masters/terms";
import { updatePoHeader } from "@/lib/purchase-orders/actions";
import type { PoStoreOption, PoVendorOption } from "@/lib/purchase-orders/queries";
import { useSaveOnBlur } from "@/lib/hooks/use-save-on-blur";
import { useState } from "react";

/**
 * The PO's own fields — vendor, deliver-to, expected-by, terms, remarks —
 * editable on blur while it's a draft, read-only once issued. Above them,
 * what the order is derived from and never picked here: the company (the
 * project's), the project, the location (its plot or unit, or General)
 * and the date. The project and scope are part of the number and
 * permanent (re-scoping means delete and re-raise). The database guard
 * refuses header edits past draft, so read-only here is honesty, not
 * enforcement.
 */
export type PoFacts = {
  /** The project's company, or null while the project has none. */
  company: string | null;
  project: string;
  /** The plot or unit's name, or "General". */
  location: string;
  /** Issued on, or raised on while a draft. */
  date: string;
};

export function HeaderFields({
  poId,
  facts,
  vendorId,
  vendorName,
  vendorGstState,
  deliverStoreId,
  deliverStoreName,
  deliverNote,
  expectedBy,
  terms,
  note,
  editable,
  vendors,
  stores,
  termsTemplates,
}: {
  poId: string;
  facts: PoFacts;
  vendorId: string;
  vendorName: string;
  vendorGstState: string | null;
  deliverStoreId: string | null;
  deliverStoreName: string | null;
  deliverNote: string | null;
  expectedBy: string | null;
  terms: string | null;
  note: string | null;
  editable: boolean;
  vendors: PoVendorOption[];
  stores: PoStoreOption[];
  termsTemplates: TermsTemplate[];
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

  const save = (overrides?: { vendorId?: string; storeId?: string; terms?: string }) =>
    flush({
      vendorId: overrides?.vendorId ?? vendorValue,
      storeId: overrides?.storeId ?? storeValue,
      deliverNote: deliverNoteValue,
      expectedBy: expectedByValue,
      terms: overrides?.terms ?? termsValue,
      note: noteValue,
    });

  const applyTemplate = (templateId: string) => {
    const template = termsTemplates.find((candidate) => candidate.id === templateId);
    if (!template) return;
    const current = termsValue.trim();
    if (
      current !== "" &&
      current !== template.body.trim() &&
      !window.confirm(`Replace this order's terms with "${template.name}"?`)
    ) {
      return;
    }
    setTermsValue(template.body);
    save({ terms: template.body });
  };

  const factsRow = (
    <div className="grid gap-4 sm:grid-cols-4">
      <ReadOnlyField
        label="Company"
        value={facts.company ?? "Not set"}
        hint={facts.company ? undefined : "Set it on the project in Masters"}
      />
      <ReadOnlyField label="Project" value={facts.project} />
      <ReadOnlyField label="Location" value={facts.location} />
      <ReadOnlyField label="Date" value={facts.date} />
    </div>
  );

  if (!editable) {
    return (
      <div className="border-border bg-surface space-y-4 rounded-2xl border p-4">
        {factsRow}
        <div className="border-border grid gap-4 border-t pt-4 sm:grid-cols-4">
          <ReadOnlyField
            label="Vendor"
            value={vendorName}
            hint={vendorGstState ? `GST state: ${vendorGstState}` : "GST state not set"}
          />
          <ReadOnlyField label="Deliver to" value={deliverStoreName ?? "—"} />
          <ReadOnlyField label="Delivery note" value={deliverNote ?? "—"} />
          <ReadOnlyField label="Expected by" value={formatDate(expectedBy)} />
          <div className="sm:col-span-4">
            <ReadOnlyField label="Terms and conditions" value={terms ?? "—"} />
          </div>
          <div className="sm:col-span-4">
            <ReadOnlyField label="Remarks" value={note ?? "—"} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="border-border bg-surface space-y-4 rounded-2xl border p-4">
      {factsRow}
      <div className="border-border grid gap-4 border-t pt-4 sm:grid-cols-3">
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
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="po-header-note">Remarks</Label>
          <Input
            id="po-header-note"
            value={noteValue}
            onChange={(event) => setNoteValue(event.target.value)}
            onBlur={() => save()}
            placeholder="—"
            autoComplete="off"
          />
        </div>
        <div className="space-y-1.5 sm:col-span-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <Label htmlFor="po-header-terms">Terms and conditions</Label>
            {termsTemplates.length > 0 && (
              // A picker that resets itself: choosing a template replaces
              // the text below, which is then this order's own to edit.
              <Select
                value=""
                onChange={(event) => applyTemplate(event.target.value)}
                className="h-8 w-auto text-xs"
                aria-label="Replace the terms with a template"
              >
                <option value="">Use template…</option>
                {termsTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                    {template.is_default ? " (default)" : ""}
                  </option>
                ))}
              </Select>
            )}
          </div>
          <Textarea
            id="po-header-terms"
            rows={5}
            value={termsValue}
            onChange={(event) => setTermsValue(event.target.value)}
            onBlur={() => save()}
            placeholder="Delivery, payment, warranty…"
          />
          {termsTemplates.length === 0 && (
            <p className="text-muted text-xs">
              Reusable terms are kept in Masters → Terms; none is set up for purchase orders yet.
            </p>
          )}
        </div>
      </div>
      <FormMessage error={error} success={saved ? "Saved" : undefined} size="xs" />
    </div>
  );
}

function ReadOnlyField({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">{label}</p>
      <p className="text-foreground mt-1 text-sm whitespace-pre-line">{value}</p>
      {hint && <p className="text-muted mt-0.5 text-xs">{hint}</p>}
    </div>
  );
}
