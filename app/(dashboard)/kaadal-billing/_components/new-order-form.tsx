"use client";

import { Button, LinkButton } from "@/components/ui/button";
import { ChoiceChips, chipClassName } from "@/components/ui/choice-chips";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Section } from "@/components/ui/section";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/lib/format";
import { createOrder } from "@/lib/kaadal-billing/actions";
import { PAID_BY, plotSort, r2, rupees, shortPlot, type Vendor } from "@/lib/kaadal-billing/ledger";
import {
  NEW_VENDOR,
  parseAmount,
  plotName,
  validateNewOrder,
  type Errors,
  type NewOrderDraft,
} from "@/lib/kaadal-billing/rules";
import { useState, useTransition } from "react";
import { BankBlock } from "./copy-button";
import { FieldError, MoneyInput, QuickButton } from "./money-input";

const paise = (n: number) => formatMoney(r2(n), { paise: true });

export function NewOrderForm({
  vendors,
  plots,
  today,
}: {
  vendors: Vendor[];
  plots: string[];
  today: string;
}) {
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [extraPlots, setExtraPlots] = useState<string[]>([]);
  const [d, setD] = useState<NewOrderDraft>({
    vendorId: "",
    newVendor: "",
    bank: "",
    plots: [],
    item: "",
    gross: "",
    split: {},
    orderedOn: today,
    payNote: "",
    notes: "",
    advance: "",
    advanceOn: today,
    advanceBy: "Kaadal",
  });
  const change = (patch: Partial<NewOrderDraft>, clear: string[] = []) => {
    setD((x) => ({ ...x, ...patch }));
    setError(null);
    if (clear.length)
      setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !clear.includes(k))));
  };
  const allPlots = [...new Set([...plots, ...extraPlots])].sort(plotSort);
  const gross = parseAmount(d.gross);
  const multi = d.plots.length > 1;
  const chosen = vendors.find((v) => v.id === d.vendorId);
  const splitClear = ["split", ...d.plots.map((p) => `split:${p}`)];

  const filled = d.plots.filter((p) => String(d.split[p] ?? "").trim() !== "");
  const splitSum = r2(d.plots.reduce((s, p) => s + parseAmount(d.split[p]), 0));
  const diff = r2(gross - splitSum);

  const togglePlot = (p: string) =>
    change(
      {
        plots: d.plots.includes(p)
          ? d.plots.filter((x) => x !== p)
          : [...d.plots, p].sort(plotSort),
      },
      ["plots", ...splitClear],
    );

  const submit = () => {
    const local = validateNewOrder(d, vendors, today);
    setErrors(local);
    if (Object.keys(local).length) {
      setError(
        `${Object.keys(local).length} field${Object.keys(local).length > 1 ? "s need" : " needs"} fixing before this order can be saved.`,
      );
      return;
    }
    start(async () => {
      const result = await createOrder(d);
      if (result?.errors) setErrors(result.errors);
      if (result?.error) setError(result.error);
    });
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Section title="Vendor">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="new-vendor">
              Vendor <span className="text-danger">*</span>
            </Label>
            <Select
              id="new-vendor"
              autoFocus
              value={d.vendorId}
              aria-invalid={Boolean(errors.vendor) || undefined}
              onChange={(e) => change({ vendorId: e.target.value }, ["vendor", "newVendor"])}
            >
              <option value="">Choose a vendor…</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
              <option value={NEW_VENDOR}>+ Add a new vendor</option>
            </Select>
            <FieldError message={errors.vendor} />
          </div>
          {d.vendorId === NEW_VENDOR ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="new-vendor-name">
                  New vendor name <span className="text-danger">*</span>
                </Label>
                <Input
                  id="new-vendor-name"
                  maxLength={60}
                  placeholder="As it should appear in the ledger"
                  value={d.newVendor}
                  aria-invalid={Boolean(errors.newVendor) || undefined}
                  onChange={(e) => change({ newVendor: e.target.value }, ["newVendor"])}
                />
                <FieldError message={errors.newVendor} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-vendor-bank">Bank details</Label>
                <Textarea
                  id="new-vendor-bank"
                  rows={4}
                  maxLength={1000}
                  className="font-mono text-xs"
                  placeholder="Account name, bank, A/C no., IFSC, branch, UPI"
                  value={d.bank}
                  onChange={(e) => change({ bank: e.target.value }, ["bank"])}
                />
              </div>
            </>
          ) : chosen ? (
            <BankBlock bank={chosen.bank} />
          ) : null}
        </div>
      </Section>

      <Section title="Order">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>
              Plots <span className="text-danger">*</span>
            </Label>
            <div className="flex flex-wrap items-center gap-1.5">
              {allPlots.map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={d.plots.includes(p)}
                  onClick={() => togglePlot(p)}
                  className={chipClassName(d.plots.includes(p)) + " font-mono text-xs font-bold"}
                >
                  {shortPlot(p)}
                </button>
              ))}
              <Input
                aria-label="Add another plot"
                placeholder="+ Other plot"
                className="h-9 w-36 text-xs"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.currentTarget.blur();
                  }
                }}
                onBlur={(e) => {
                  const named = plotName(e.target.value, { orders: [] });
                  e.target.value = "";
                  if (!named) return;
                  if ("error" in named) return setErrors((x) => ({ ...x, plots: named.error }));
                  const known =
                    allPlots.find((p) => p.toLowerCase() === named.name.toLowerCase()) ??
                    named.name;
                  if (!allPlots.includes(known)) setExtraPlots((x) => [...x, known]);
                  if (!d.plots.includes(known)) togglePlot(known);
                }}
              />
            </div>
            <FieldError message={errors.plots} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="new-item">Item or scope</Label>
              <Input
                id="new-item"
                maxLength={80}
                placeholder="e.g. Sofa, wall lights"
                value={d.item}
                onChange={(e) => change({ item: e.target.value }, ["item"])}
              />
              <FieldError message={errors.item} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-date">Order date</Label>
              <Input
                id="new-date"
                type="date"
                max={today}
                value={d.orderedOn}
                aria-invalid={Boolean(errors.orderedOn) || undefined}
                onChange={(e) => change({ orderedOn: e.target.value }, ["orderedOn"])}
              />
              <FieldError message={errors.orderedOn} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="new-gross">
              Order value <span className="text-danger">*</span>
            </Label>
            <MoneyInput
              id="new-gross"
              placeholder="0"
              value={d.gross}
              aria-invalid={Boolean(errors.gross) || undefined}
              onChange={(e) => change({ gross: e.target.value }, ["gross", "split", "advance"])}
            />
            <FieldError message={errors.gross} />
          </div>

          {multi ? (
            <div className="border-border bg-background space-y-3 rounded-xl border p-3">
              <p className="text-muted text-xs font-medium">
                Value per plot, from the quote. Leave all blank to split evenly.
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                {d.plots.map((p) => (
                  <div key={p} className="space-y-1.5">
                    <Label htmlFor={`new-split-${p}`}>{p}</Label>
                    <MoneyInput
                      id={`new-split-${p}`}
                      placeholder="0"
                      value={d.split[p] ?? ""}
                      aria-invalid={Boolean(errors[`split:${p}`]) || undefined}
                      onChange={(e) =>
                        change({ split: { ...d.split, [p]: e.target.value } }, [
                          "split",
                          `split:${p}`,
                        ])
                      }
                    />
                    <FieldError message={errors[`split:${p}`]} />
                  </div>
                ))}
              </div>
              <p aria-live="polite" className="text-sm tabular-nums">
                {!filled.length ? (
                  <span className="text-muted">
                    Blank values split the order evenly across plots.
                  </span>
                ) : !gross ? (
                  <span className="text-muted">Plot values total {paise(splitSum)}.</span>
                ) : Math.abs(diff) < 0.005 ? (
                  <span className="text-success font-medium">
                    Plot values add up to the order value.
                  </span>
                ) : (
                  <span className="text-warning">
                    Plot values total {paise(splitSum)} ·{" "}
                    {diff > 0 ? `${paise(diff)} short of` : `${paise(-diff)} over`} the order value{" "}
                    {paise(gross)}
                  </span>
                )}
              </p>
              <FieldError message={errors.split} />
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="new-pay-note">How it&apos;s paid</Label>
            <Input
              id="new-pay-note"
              maxLength={80}
              placeholder="Leave blank for bank transfer, or e.g. Through QR – UPI"
              value={d.payNote}
              onChange={(e) => change({ payNote: e.target.value }, ["payNote"])}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-notes">Notes</Label>
            <Textarea
              id="new-notes"
              rows={3}
              maxLength={2000}
              value={d.notes}
              onChange={(e) => change({ notes: e.target.value }, ["notes"])}
            />
          </div>
        </div>
      </Section>

      <Section
        title="Advance already paid?"
        aside={<span className="text-muted text-xs">Optional</span>}
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="new-advance">Advance amount</Label>
              <MoneyInput
                id="new-advance"
                placeholder="0"
                value={d.advance}
                aria-invalid={Boolean(errors.advance) || undefined}
                onChange={(e) => change({ advance: e.target.value }, ["advance"])}
              />
              <FieldError message={errors.advance} />
              {gross > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  <QuickButton
                    onClick={() => change({ advance: String(r2(gross / 2)) }, ["advance"])}
                  >
                    50% {rupees(gross / 2)}
                  </QuickButton>
                  <QuickButton
                    onClick={() => change({ advance: String(r2(gross * 0.6)) }, ["advance"])}
                  >
                    60% {rupees(gross * 0.6)}
                  </QuickButton>
                  <QuickButton onClick={() => change({ advance: String(gross) }, ["advance"])}>
                    Full {rupees(gross)}
                  </QuickButton>
                </div>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-advance-date">Date paid</Label>
              <Input
                id="new-advance-date"
                type="date"
                max={today}
                value={d.advanceOn}
                aria-invalid={Boolean(errors.advanceOn) || undefined}
                onChange={(e) => change({ advanceOn: e.target.value }, ["advanceOn"])}
              />
              <FieldError message={errors.advanceOn} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Paid by</Label>
            <ChoiceChips
              label="Paid by"
              required
              options={PAID_BY.map((v) => ({ value: v, label: v }))}
              value={d.advanceBy}
              onChange={(v) => v && change({ advanceBy: v })}
            />
          </div>
        </div>
      </Section>

      <FormMessage error={error} />
      <div className="flex justify-end gap-2">
        <LinkButton href="/kaadal-billing/orders" variant="secondary">
          Cancel
        </LinkButton>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save order"}
        </Button>
      </div>
    </form>
  );
}
