"use client";

import { Button } from "@/components/ui/button";
import { chipClassName } from "@/components/ui/choice-chips";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Section } from "@/components/ui/section";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useUndoBar } from "@/components/ui/undo-bar";
import { saveSplit, toggleOrderPlot, updateOrderField } from "@/lib/kaadal-billing/actions";
import { r2, shortPlot, type Order, type Payment } from "@/lib/kaadal-billing/ledger";
import {
  parseAmount,
  plotName,
  validateOrderField,
  validateSplit,
  type Errors,
  type OrderField,
} from "@/lib/kaadal-billing/rules";
import { formatMoney } from "@/lib/format";
import { useState, useTransition, type FocusEvent } from "react";
import { FieldError, MoneyInput } from "./money-input";

const paise = (n: number) => formatMoney(r2(n), { paise: true });
const drop = (e: Errors, ...keys: string[]): Errors =>
  Object.fromEntries(Object.entries(e).filter(([k]) => !keys.includes(k)));

/** An order's own details, each saved as the person leaves the field, with Undo; the database refuses what rules.ts would. */
export function OrderDetails({
  order,
  pays,
  vendors,
  plots,
  today,
}: {
  order: Order;
  pays: Payment[];
  vendors: { id: string; name: string; bank: string }[];
  plots: string[];
  today: string;
}) {
  const show = useUndoBar();
  const [, start] = useTransition();
  const [errors, setErrors] = useState<Errors>({});
  const multi = order.plots.length > 1;
  const [split, setSplit] = useState<Record<string, string> | null>(null);
  const typedSplit =
    split ??
    Object.fromEntries(
      order.plots.map((p) => [p, order.split[p] !== undefined ? String(order.split[p]) : ""]),
    );

  const vendorList = vendors.map((v) => ({ ...v, updatedAt: "", updatedBy: null }));
  const stored = (field: OrderField): string => {
    const v = order[field];
    if (field === "deduction") return order.deduction ? String(order.deduction) : "";
    return v === null || v === undefined ? "" : String(v);
  };

  const save = (field: OrderField, raw: string) => {
    const value = field === "notes" ? raw : raw.trim();
    const was = stored(field);
    const same =
      field === "gross" || field === "deduction"
        ? parseAmount(value) === parseAmount(was)
        : value === was;
    if (same) {
      setErrors((e) => drop(e, field));
      return;
    }
    const local = validateOrderField(order, pays, field, value, vendorList, today);
    if (local) return setErrors((e) => ({ ...e, [field]: local }));
    start(async () => {
      const result = await updateOrderField(order.id, field, value);
      if (result?.error) return setErrors((e) => ({ ...e, [field]: result.error! }));
      setErrors((e) => drop(e, field));
      if (field === "vendorId" || field === "gross" || field === "deduction") {
        show(result?.note ?? "Order updated", () =>
          start(async () => {
            const back = await updateOrderField(order.id, field, was);
            if (back?.error) show(back.error);
          }),
        );
      } else if (result?.note) show(result.note);
    });
  };

  const onBlur = (field: OrderField) => (e: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    save(field, e.target.value);

  const toggle = (plot: string) =>
    start(async () => {
      const result = await toggleOrderPlot(order.id, plot);
      if (result?.error) return setErrors((e) => ({ ...e, plots: result.error! }));
      setErrors((e) => drop(e, "plots"));
      setSplit(null);
      if (result?.note) show(result.note);
    });

  const splitSum = r2(order.plots.reduce((s, p) => s + parseAmount(typedSplit[p]), 0));
  const anyTyped = order.plots.some((p) => String(typedSplit[p] ?? "").trim() !== "");
  const diff = r2(order.gross - splitSum);

  return (
    <Section title="Order details">
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="order-vendor">Vendor</Label>
          <Select
            id="order-vendor"
            key={order.vendorId}
            defaultValue={order.vendorId}
            onChange={(e) => save("vendorId", e.target.value)}
          >
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </Select>
          <FieldError message={errors.vendorId} />
        </div>

        <div className="space-y-1.5">
          <Label>Plots</Label>
          <div className="flex flex-wrap items-center gap-1.5">
            {plots.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={order.plots.includes(p)}
                onClick={() => toggle(p)}
                className={chipClassName(order.plots.includes(p)) + " font-mono text-xs font-bold"}
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
                  plots.find((p) => p.toLowerCase() === named.name.toLowerCase()) ?? named.name;
                if (!order.plots.includes(known)) toggle(known);
              }}
            />
          </div>
          <FieldError message={errors.plots} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="order-item">Item or scope</Label>
            <Input
              id="order-item"
              maxLength={80}
              placeholder="e.g. Sofa, kitchen appliances"
              key={order.item}
              defaultValue={order.item}
              onBlur={onBlur("item")}
            />
            <FieldError message={errors.item} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="order-date">Order date</Label>
            <Input
              id="order-date"
              type="date"
              max={today}
              key={order.orderedOn ?? ""}
              defaultValue={order.orderedOn ?? ""}
              onBlur={onBlur("orderedOn")}
            />
            <FieldError message={errors.orderedOn} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="order-gross">Order value before deductions</Label>
          <MoneyInput
            id="order-gross"
            key={String(order.gross)}
            defaultValue={String(order.gross)}
            aria-invalid={Boolean(errors.gross) || undefined}
            onBlur={onBlur("gross")}
          />
          <FieldError message={errors.gross} />
        </div>

        {multi ? (
          <div className="border-border bg-background space-y-3 rounded-xl border p-3">
            <p className="text-muted text-xs font-medium">
              Value per plot, from the quote. Must add up to the order value.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              {order.plots.map((p) => (
                <div key={p} className="space-y-1.5">
                  <Label htmlFor={`order-split-${p}`}>{p}</Label>
                  <MoneyInput
                    id={`order-split-${p}`}
                    placeholder="0"
                    value={typedSplit[p] ?? ""}
                    aria-invalid={Boolean(errors[`split:${p}`]) || undefined}
                    onChange={(e) => {
                      setSplit({ ...typedSplit, [p]: e.target.value });
                      setErrors((e) => drop(e, "split", `split:${p}`));
                    }}
                  />
                  <FieldError message={errors[`split:${p}`]} />
                </div>
              ))}
            </div>
            <p aria-live="polite" className="text-sm tabular-nums">
              {!anyTyped ? (
                <span className="text-muted">
                  No plot values. Shared payments are split evenly across plots.
                </span>
              ) : Math.abs(diff) < 0.005 ? (
                <span className="text-success font-medium">
                  Plot values add up to the order value of {paise(order.gross)}.
                </span>
              ) : (
                <span className="text-warning">
                  Plot values total {paise(splitSum)} ·{" "}
                  {diff > 0 ? `${paise(diff)} short of` : `${paise(-diff)} over`} the order value{" "}
                  {paise(order.gross)}
                </span>
              )}
            </p>
            <FieldError message={errors.split} />
            <div className="flex flex-wrap justify-end gap-2">
              {Object.keys(order.split).length ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    start(async () => {
                      const result = await saveSplit(order.id, null);
                      if (result?.error) return setErrors((e) => ({ ...e, split: result.error! }));
                      setSplit(null);
                      show("Plot values cleared. Shared payments now split evenly.");
                    })
                  }
                >
                  Clear plot values
                </Button>
              ) : null}
              <Button
                size="sm"
                onClick={() => {
                  const local = validateSplit(order, typedSplit);
                  if (Object.keys(local).length) return setErrors((e) => ({ ...e, ...local }));
                  start(async () => {
                    const result = await saveSplit(order.id, typedSplit);
                    if (result?.errors) return setErrors((e) => ({ ...e, ...result.errors }));
                    if (result?.error) return setErrors((e) => ({ ...e, split: result.error! }));
                    setSplit(null);
                    show("Plot values saved");
                  });
                }}
              >
                Save plot values
              </Button>
            </div>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="order-deduction">Deduction (cancelled items)</Label>
            <MoneyInput
              id="order-deduction"
              placeholder="0"
              key={order.deduction ? String(order.deduction) : ""}
              defaultValue={order.deduction ? String(order.deduction) : ""}
              aria-invalid={Boolean(errors.deduction) || undefined}
              onBlur={onBlur("deduction")}
            />
            <FieldError message={errors.deduction} />
          </div>
          {multi ? (
            <div className="space-y-1.5">
              <Label htmlFor="order-deduction-plot">Deduction applies to</Label>
              <Select
                id="order-deduction-plot"
                key={order.deductionPlot ?? ""}
                defaultValue={order.deductionPlot ?? ""}
                onChange={(e) => save("deductionPlot", e.target.value)}
              >
                <option value="">Shared by value</option>
                {order.plots.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
              <FieldError message={errors.deductionPlot} />
            </div>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="order-deduction-note">Deduction reason</Label>
          <Input
            id="order-deduction-note"
            maxLength={80}
            placeholder="e.g. 9 wall lights cancelled"
            key={order.deductionNote}
            defaultValue={order.deductionNote}
            onBlur={onBlur("deductionNote")}
          />
          <FieldError message={errors.deductionNote} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="order-pay-note">How it&apos;s paid</Label>
          <Input
            id="order-pay-note"
            maxLength={80}
            placeholder="e.g. Through QR – UPI (leave blank for bank transfer)"
            key={order.payNote}
            defaultValue={order.payNote}
            onBlur={onBlur("payNote")}
          />
          <FieldError message={errors.payNote} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="order-notes">Notes</Label>
          <Textarea
            id="order-notes"
            rows={3}
            maxLength={2000}
            key={order.notes}
            defaultValue={order.notes}
            onBlur={onBlur("notes")}
          />
          <FieldError message={errors.notes} />
        </div>
      </div>
    </Section>
  );
}
