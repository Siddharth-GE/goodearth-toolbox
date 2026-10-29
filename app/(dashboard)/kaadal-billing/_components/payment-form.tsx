"use client";

import { Button } from "@/components/ui/button";
import { ChoiceChips } from "@/components/ui/choice-chips";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Section } from "@/components/ui/section";
import { useUndoBar } from "@/components/ui/undo-bar";
import { deletePayment, restorePayment, savePayment } from "@/lib/kaadal-billing/actions";
import {
  figures,
  KINDS,
  PAID_BY,
  r2,
  rupees,
  shortPlot,
  type Order,
  type Payment,
} from "@/lib/kaadal-billing/ledger";
import {
  allocKey,
  allocSum,
  autoSplit,
  checkAmount,
  draftFrom,
  leftOnPlots,
  newPaymentDraft,
  parseAmount,
  validatePayment,
  type Errors,
  type PaymentDraft,
} from "@/lib/kaadal-billing/rules";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState, useTransition } from "react";
import { FieldError, MoneyInput, QuickButton } from "./money-input";

const paise = (n: number) => formatMoney(r2(n), { paise: true });

/**
 * Record or edit one payment on an order, the sheet's way: who paid, what kind, and for a several-plot order
 * whether it is shared by value, for one plot, or split by amounts that must add up. Errors block; warnings ask
 * "Save anyway". The action runs the same rules again.
 */
export function PaymentForm({
  order,
  pays,
  today,
  draft,
  setDraft,
  focusAmount,
}: {
  order: Order;
  pays: Payment[];
  today: string;
  draft: PaymentDraft;
  setDraft: (d: PaymentDraft) => void;
  focusAmount: boolean;
}) {
  const show = useUndoBar();
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Errors>({});
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const multi = order.plots.length > 1;
  const f = figures(order, pays);
  const editing = Boolean(draft.id);
  const amount = parseAmount(draft.amount);
  const earlier = draft.id ? (pays.find((p) => p.id === draft.id)?.amount ?? 0) : 0;
  const after = r2(f.balance + earlier - amount);
  const left = leftOnPlots(order, pays, draft.id);

  useEffect(() => {
    if (focusAmount || draft.id) amountRef.current?.focus({ preventScroll: false });
  }, [focusAmount, draft.id]);

  const change = (patch: Partial<PaymentDraft>, clear: string[] = []) => {
    setDraft({ ...draft, ...patch });
    setWarnings([]);
    setError(null);
    if (clear.length)
      setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !clear.includes(k))));
  };

  const reset = () => {
    setDraft({ ...newPaymentDraft(order, pays, today), kind: "Part payment" });
    setErrors({});
    setWarnings([]);
    setError(null);
  };

  const save = (confirmed: boolean) => {
    const local = validatePayment(order, pays, draft, today);
    if (Object.keys(local.errors).length) {
      setErrors(local.errors);
      setWarnings([]);
      return;
    }
    if (local.warnings.length && !confirmed) {
      setWarnings(local.warnings);
      return;
    }
    start(async () => {
      const result = await savePayment(order.id, draft, confirmed);
      if (result?.errors) return setErrors(result.errors);
      if (result?.warnings) return setWarnings(result.warnings);
      if (result?.error) return setError(result.error);
      const saved = draft;
      const before = saved.id ? pays.find((p) => p.id === saved.id) : undefined;
      reset();
      if (before) {
        show("Payment updated", () =>
          start(async () => {
            const back = await savePayment(order.id, draftFrom(before), true);
            if (back?.error) show(back.error);
          }),
        );
      } else if (result?.id) {
        const id = result.id;
        show(`Saved ${paise(parseAmount(saved.amount))}`, () =>
          start(async () => {
            const back = await deletePayment(id);
            if (back?.error) show(back.error);
          }),
        );
      }
    });
  };

  const remove = () => {
    const payment = pays.find((p) => p.id === draft.id);
    if (!payment) return;
    start(async () => {
      const result = await deletePayment(payment.id);
      if (result?.error) return setError(result.error);
      reset();
      show(`Deleted ${rupees(payment.amount)} payment`, () =>
        start(async () => {
          const back = await restorePayment(payment);
          if (back?.error) show(back.error);
        }),
      );
    });
  };

  const modeValue = draft.mode === "one" ? `one:${draft.plot}` : draft.mode;
  const sum = allocSum(draft);
  const unallocated = r2(amount - sum);

  return (
    <Section
      title={editing ? "Edit payment" : "Record a payment"}
      aside={
        editing ? (
          <Button variant="ghost" size="sm" onClick={reset}>
            Cancel edit
          </Button>
        ) : null
      }
    >
      <form
        id="pay"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save(warnings.length > 0);
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="pay-amount">
              Amount <span className="text-danger">*</span>
            </Label>
            <MoneyInput
              ref={amountRef}
              id="pay-amount"
              placeholder="0"
              value={draft.amount}
              aria-invalid={Boolean(errors.amount) || undefined}
              onChange={(e) => change({ amount: e.target.value }, ["amount", "alloc"])}
              onBlur={(e) => {
                const message = checkAmount(e.target.value, { required: false });
                if (message) setErrors((x) => ({ ...x, amount: message }));
              }}
            />
            <FieldError message={errors.amount} />
            {!editing && f.balance > 0.5 ? (
              <div className="flex flex-wrap gap-1.5">
                <QuickButton onClick={() => change({ amount: String(f.balance) }, ["amount"])}>
                  Full balance {rupees(f.balance)}
                </QuickButton>
                {f.paid === 0 ? (
                  <QuickButton
                    onClick={() => change({ amount: String(r2(f.net / 2)) }, ["amount"])}
                  >
                    50% {rupees(f.net / 2)}
                  </QuickButton>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pay-date">
              Date paid <span className="text-danger">*</span>
            </Label>
            <Input
              id="pay-date"
              type="date"
              max={today}
              value={draft.paidOn}
              aria-invalid={Boolean(errors.paidOn) || undefined}
              onChange={(e) => change({ paidOn: e.target.value }, ["paidOn"])}
            />
            <FieldError message={errors.paidOn} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Paid by</Label>
          <ChoiceChips
            label="Paid by"
            required
            options={PAID_BY.map((v) => ({ value: v, label: v }))}
            value={draft.paidBy}
            onChange={(v) => v && change({ paidBy: v }, ["paidBy"])}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Type</Label>
          <ChoiceChips
            label="Type"
            required
            options={KINDS.map((v) => ({ value: v, label: v }))}
            value={draft.kind}
            onChange={(v) => v && change({ kind: v }, ["kind"])}
          />
        </div>

        {multi ? (
          <div className="space-y-1.5">
            <Label>Which plots is this for?</Label>
            <ChoiceChips
              label="Which plots is this for?"
              required
              options={[
                { value: "share", label: "Share by plot value" },
                ...order.plots.map((p) => ({
                  value: `one:${p}`,
                  label: <span className="font-mono text-xs font-bold">{shortPlot(p)} only</span>,
                })),
                { value: "split", label: "Split amounts by plot" },
              ]}
              value={modeValue}
              onChange={(v) => {
                if (!v) return;
                const clear = ["plot", "alloc", ...order.plots.map(allocKey)];
                if (v.startsWith("one:")) change({ mode: "one", plot: v.slice(4) }, clear);
                else change({ mode: v as "share" | "split", plot: "" }, clear);
              }}
            />
            <FieldError message={errors.plot} />
            {draft.mode === "share" ? (
              <p className="text-muted text-xs">
                Shared payments are divided by each plot&apos;s order value.
              </p>
            ) : null}
          </div>
        ) : null}

        {multi && draft.mode === "split" ? (
          <div
            className={cn(
              "bg-background space-y-3 rounded-xl border p-3",
              errors.alloc ? "border-danger" : "border-border",
            )}
          >
            <div className="grid gap-3 sm:grid-cols-3">
              {order.plots.map((p) => (
                <div key={p} className="space-y-1.5">
                  <Label
                    htmlFor={`pay-al-${p}`}
                    className="flex flex-wrap items-baseline gap-x-1.5"
                  >
                    {p}
                    <span className="text-muted text-xs font-normal tabular-nums">
                      {left[p] > 0.5 ? `${rupees(left[p])} left` : "nothing left"}
                    </span>
                  </Label>
                  <MoneyInput
                    id={`pay-al-${p}`}
                    placeholder="0"
                    value={draft.alloc[p] ?? ""}
                    aria-invalid={Boolean(errors[allocKey(p)]) || undefined}
                    onChange={(e) =>
                      change({ alloc: { ...draft.alloc, [p]: e.target.value } }, [
                        "alloc",
                        allocKey(p),
                      ])
                    }
                  />
                  <FieldError message={errors[allocKey(p)]} />
                </div>
              ))}
            </div>
            <div
              aria-live="polite"
              className="flex flex-wrap items-center gap-2 text-sm tabular-nums"
            >
              {!amount && sum > 0 ? (
                <>
                  <span>
                    Plot amounts total <b>{paise(sum)}</b>.
                  </span>
                  <QuickButton onClick={() => change({ amount: String(sum) }, ["amount", "alloc"])}>
                    Use {paise(sum)} as the payment amount
                  </QuickButton>
                </>
              ) : !amount ? (
                <span className="text-muted">
                  Enter the payment amount, then how much of it goes to each plot.
                </span>
              ) : Math.abs(unallocated) < 0.005 ? (
                <span className="text-success font-medium">
                  Allocated {paise(sum)} of {paise(amount)}. Plot amounts add up.
                </span>
              ) : unallocated > 0 ? (
                <>
                  <span className="text-warning">
                    Allocated {paise(sum)} of {paise(amount)} ·{" "}
                    <b className="text-danger">{paise(unallocated)} left to allocate</b>
                  </span>
                  {order.plots.map((p) => (
                    <QuickButton
                      key={p}
                      onClick={() =>
                        change(
                          {
                            alloc: {
                              ...draft.alloc,
                              [p]: String(r2(parseAmount(draft.alloc[p]) + unallocated)),
                            },
                          },
                          ["alloc"],
                        )
                      }
                    >
                      Put {paise(unallocated)} on {shortPlot(p)}
                    </QuickButton>
                  ))}
                </>
              ) : (
                <span className="text-warning">
                  Allocated {paise(sum)}, which is{" "}
                  <b className="text-danger">{paise(-unallocated)} more</b> than the payment of{" "}
                  {paise(amount)}.
                </span>
              )}
            </div>
            <QuickButton
              onClick={() => {
                if (!amount) {
                  setErrors((e) => ({
                    ...e,
                    amount: "Enter the payment amount first, then split it.",
                  }));
                  amountRef.current?.focus();
                  return;
                }
                change({ alloc: autoSplit(order, pays, draft) }, [
                  "alloc",
                  ...order.plots.map(allocKey),
                ]);
              }}
            >
              Split by what&apos;s left on each plot
            </QuickButton>
            <FieldError message={errors.alloc} />
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="pay-ref">UTR / reference</Label>
            <Input
              id="pay-ref"
              maxLength={60}
              placeholder="Bank reference or cheque no."
              value={draft.reference}
              onChange={(e) => change({ reference: e.target.value }, ["reference"])}
            />
            <FieldError message={errors.reference} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pay-note">Note</Label>
            <Input
              id="pay-note"
              maxLength={120}
              placeholder="Optional"
              value={draft.notes}
              onChange={(e) => change({ notes: e.target.value }, ["notes"])}
            />
          </div>
        </div>

        {warnings.length ? (
          <div role="alert" className="bg-warning/10 text-warning rounded-xl p-3 text-sm">
            <b className="block">Check before saving</b>
            <ul className="my-1.5 list-disc space-y-0.5 pl-5">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
            Change the details, or save anyway if this is correct.
          </div>
        ) : null}
        <FormMessage error={error} />

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted mr-auto text-sm tabular-nums">
            {amount > 0 ? (
              after < -0.5 ? (
                <span className="text-danger">{paise(-after)} more than the balance</span>
              ) : (
                `Balance after this: ${paise(after)}`
              )
            ) : null}
          </span>
          {editing ? (
            <Button variant="danger" disabled={pending} onClick={remove}>
              Delete
            </Button>
          ) : null}
          <Button type="submit" disabled={pending}>
            {warnings.length ? "Save anyway" : editing ? "Update payment" : "Save payment"}
          </Button>
        </div>
      </form>
    </Section>
  );
}
