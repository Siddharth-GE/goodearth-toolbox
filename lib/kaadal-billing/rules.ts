/**
 * What Kaadal Billing accepts, pure: the sheet's checks and its words, run on the screen as someone types and
 * again in every action before a write. `today` is passed in.
 */
import { formatDate, formatMoney } from "@/lib/format";
import {
  allocOf,
  allPlots,
  figures,
  KINDS,
  PAID_BY,
  plotSort,
  r2,
  shares,
  type Amounts,
  type Kind,
  type Ledger,
  type Order,
  type PaidBy,
  type Payment,
  type Vendor,
} from "./ledger";

export type Errors = Record<string, string>;

const paise = (n: number) => formatMoney(r2(n), { paise: true });

/** "₹25,000.50" or "25000.5" as rupees; anything else is 0 (checkAmount says why). */
export function parseAmount(value: string | number | null | undefined): number {
  const n = parseFloat(String(value ?? "").replace(/[₹,\s]/g, ""));
  return Number.isFinite(n) ? r2(n) : 0;
}

export function checkAmount(
  value: string | number | null | undefined,
  { required = true, label = "the amount", positive = true } = {},
): string {
  const s = String(value ?? "").trim();
  if (!s) return required ? `Enter ${label}.` : "";
  if (s.includes("-")) return "Amounts can't be negative.";
  if (!/^₹?\s*[\d,]*\.?\d*$/.test(s) || !/\d/.test(s))
    return "Use numbers only, like 25000 or 25,000.50.";
  if ((s.split(".")[1] ?? "").length > 2) return "Use at most two digits after the decimal point.";
  if (positive && parseAmount(s) <= 0) return "The amount must be more than zero.";
  if (parseAmount(s) >= 1e12) return "That amount is too large.";
  return "";
}

export function checkDate(value: string, label: string, today: string, required = true): string {
  if (!value) return required ? `Enter ${label}.` : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)))
    return "Pick a valid date.";
  if (value > today) return "This date is in the future. Record payments after they are made.";
  if (value < "2020-01-01") return "Check the year. This date is before 2020.";
  return "";
}

const orderDateError = (value: string, today: string) =>
  checkDate(value, "the order date", today, false).replace(
    "Record payments after they are made.",
    "Use today or an earlier date.",
  );

// ---------------------------------------------------------------------------------------------------------------
// A payment
// ---------------------------------------------------------------------------------------------------------------

export type PayMode = "share" | "one" | "split";

/** The payment form as typed: amounts stay text until saved, so "25,000." is not rewritten mid-typing. */
export type PaymentDraft = {
  id: string | null;
  amount: string;
  paidOn: string;
  paidBy: PaidBy;
  kind: Kind;
  mode: PayMode;
  plot: string;
  alloc: Record<string, string>;
  reference: string;
  notes: string;
};

export function newPaymentDraft(order: Order, pays: Payment[], today: string): PaymentDraft {
  return {
    id: null,
    amount: "",
    paidOn: today,
    paidBy: "Kaadal",
    kind: figures(order, pays).paid > 0 ? "Part payment" : "Advance",
    mode: "share",
    plot: "",
    alloc: {},
    reference: "",
    notes: "",
  };
}

export function draftFrom(payment: Payment): PaymentDraft {
  const alloc = allocOf(payment);
  const plots = alloc ? Object.keys(alloc) : [];
  return {
    id: payment.id,
    amount: String(payment.amount),
    paidOn: payment.paidOn ?? "",
    paidBy: payment.paidBy,
    kind: payment.kind,
    mode: plots.length > 1 ? "split" : plots.length === 1 ? "one" : "share",
    plot: plots.length === 1 ? plots[0] : "",
    alloc: plots.length > 1 ? Object.fromEntries(plots.map((p) => [p, String(alloc![p])])) : {},
    reference: payment.reference,
    notes: payment.notes,
  };
}

export const allocKey = (plot: string) => `al:${plot}`;

export function allocSum(draft: Pick<PaymentDraft, "alloc">): number {
  return r2(Object.values(draft.alloc).reduce((s, v) => s + parseAmount(v), 0));
}

/** The plots and amounts the payment will be stored with: empty means shared by value. */
export function allocToSave(order: Order, draft: PaymentDraft): Amounts {
  if (order.plots.length < 2) return {};
  if (draft.mode === "one") return { [draft.plot]: parseAmount(draft.amount) };
  if (draft.mode === "split") {
    const out: Amounts = {};
    for (const plot of order.plots) {
      const v = parseAmount(draft.alloc[plot]);
      if (v > 0) out[plot] = v;
    }
    return out;
  }
  return {};
}

/** What is left to pay on each plot, with this payment's own earlier marks given back when editing it. */
export function leftOnPlots(order: Order, pays: Payment[], editingId: string | null): Amounts {
  const all = shares(order, pays);
  const earlier = editingId
    ? (allocOf(pays.find((p) => p.id === editingId) ?? { alloc: {} }) ?? {})
    : {};
  return Object.fromEntries(
    order.plots.map((p) => [p, r2((all[p]?.balance ?? 0) + (earlier[p] ?? 0))]),
  );
}

/** Errors block the save; warnings ask "Save anyway". */
export function validatePayment(
  order: Order,
  pays: Payment[],
  draft: PaymentDraft,
  today: string,
): { errors: Errors; warnings: string[] } {
  const errors: Errors = {};
  const warnings: string[] = [];
  const multi = order.plots.length > 1;
  const amountError = checkAmount(draft.amount, { label: "the amount paid" });
  if (amountError) errors.amount = amountError;
  const amount = parseAmount(draft.amount);
  const dateError = checkDate(draft.paidOn, "the date paid", today);
  if (dateError) errors.paidOn = dateError;
  if (!PAID_BY.includes(draft.paidBy)) errors.paidBy = "Choose who paid.";
  if (!KINDS.includes(draft.kind)) errors.kind = "Choose the payment type.";
  if (draft.reference.length > 60) errors.reference = "Keep the reference under 60 characters.";
  if (draft.notes.length > 120) errors.notes = "Keep the note under 120 characters.";
  if (multi && draft.mode === "one" && !order.plots.includes(draft.plot))
    errors.plot = "Pick the plot this payment is for.";
  if (multi && draft.mode === "split") {
    let bad = false;
    for (const plot of order.plots) {
      const e = checkAmount(draft.alloc[plot], { required: false, positive: false });
      if (e) {
        errors[allocKey(plot)] = e;
        bad = true;
      }
    }
    const sum = allocSum(draft);
    const used = order.plots.filter((p) => parseAmount(draft.alloc[p]) > 0).length;
    if (!bad && !errors.amount) {
      if (Math.abs(sum - amount) > 0.009)
        errors.alloc =
          sum < amount
            ? `The plot amounts add up to ${paise(sum)}. That is ${paise(amount - sum)} less than the payment of ${paise(amount)}. They must match exactly.`
            : `The plot amounts add up to ${paise(sum)}. That is ${paise(sum - amount)} more than the payment of ${paise(amount)}. They must match exactly.`;
      else if (used < 2)
        errors.alloc =
          "A split needs amounts on at least two plots. To put the whole payment on one plot, choose that plot above.";
    }
  }
  if (Object.keys(errors).length) return { errors, warnings };

  const f = figures(order, pays);
  const earlier = draft.id ? (pays.find((p) => p.id === draft.id)?.amount ?? 0) : 0;
  const after = r2(f.balance + earlier - amount);
  if (after < -0.5)
    warnings.push(
      `This is ${paise(-after)} more than what's left to pay on this order (${paise(Math.max(f.balance + earlier, 0))}).`,
    );
  if (multi && draft.mode !== "share") {
    const left = leftOnPlots(order, pays, draft.id);
    for (const [plot, v] of Object.entries(allocToSave(order, draft))) {
      if (v - left[plot] > 0.5)
        warnings.push(
          `${plot} only has ${paise(Math.max(left[plot], 0))} left to pay on this order, but ${paise(v)} is marked for it.`,
        );
    }
  }
  const twin = pays.find(
    (p) =>
      p.id !== draft.id && Math.abs(p.amount - amount) < 0.01 && (p.paidOn ?? "") === draft.paidOn,
  );
  if (twin)
    warnings.push(
      `A payment of ${paise(amount)} on ${formatDate(draft.paidOn)} is already recorded for this order. Make sure it isn't entered twice.`,
    );
  return { errors, warnings };
}

/** "Split by what's left on each plot": the amount spread by each plot's remaining balance, the last plot taking the paisa. */
export function autoSplit(
  order: Order,
  pays: Payment[],
  draft: PaymentDraft,
): Record<string, string> {
  const amount = parseAmount(draft.amount);
  const left = leftOnPlots(order, pays, draft.id);
  let weights = order.plots.map((p) => Math.max(0, left[p]));
  if (weights.reduce((a, b) => a + b, 0) <= 0) {
    const all = shares(order, pays);
    weights = order.plots.map((p) => Math.max(0, all[p]?.net ?? 0));
  }
  if (!weights.some((w) => w > 0)) weights = order.plots.map(() => 1);
  const total = weights.reduce((a, b) => a + b, 0);
  let run = 0;
  const out: Record<string, string> = {};
  order.plots.forEach((plot, i) => {
    const v = i === order.plots.length - 1 ? r2(amount - run) : r2((amount * weights[i]) / total);
    run = r2(run + v);
    out[plot] = String(v);
  });
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// A new order
// ---------------------------------------------------------------------------------------------------------------

export const NEW_VENDOR = "__new";

export type NewOrderDraft = {
  vendorId: string;
  newVendor: string;
  bank: string;
  plots: string[];
  item: string;
  gross: string;
  split: Record<string, string>;
  orderedOn: string;
  payNote: string;
  notes: string;
  advance: string;
  advanceOn: string;
  advanceBy: PaidBy;
};

export function vendorNameError(name: string, vendors: Vendor[], selfId: string | null): string {
  const n = name.trim();
  if (!n) return selfId ? "A vendor needs a name." : "Type the new vendor's name.";
  if (n.length > 60) return "Keep the name under 60 characters.";
  const twin = vendors.find(
    (v) => v.id !== selfId && v.name.trim().toLowerCase() === n.toLowerCase(),
  );
  if (twin)
    return selfId
      ? `${twin.name} already exists. Use a different name.`
      : `${twin.name} is already a vendor. Pick it from the list instead.`;
  return "";
}

export function validateNewOrder(draft: NewOrderDraft, vendors: Vendor[], today: string): Errors {
  const errors: Errors = {};
  if (!draft.vendorId) errors.vendor = "Choose a vendor, or pick “Add a new vendor”.";
  else if (draft.vendorId === NEW_VENDOR) {
    const e = vendorNameError(draft.newVendor, vendors, null);
    if (e) errors.newVendor = e;
  } else if (!vendors.some((v) => v.id === draft.vendorId))
    errors.vendor = "Choose a vendor from the list.";
  if (draft.bank.length > 1000) errors.bank = "Keep the bank details under 1,000 characters.";
  if (!draft.plots.length) errors.plots = "Pick at least one plot.";
  if (draft.plots.length > 20) errors.plots = "An order can name at most 20 plots.";
  if (draft.item.length > 80) errors.item = "Keep this under 80 characters.";
  if (draft.payNote.length > 80) errors.payNote = "Keep this under 80 characters.";
  if (draft.notes.length > 2000) errors.notes = "Keep the notes under 2,000 characters.";
  const grossError = checkAmount(draft.gross, { label: "the order value" });
  if (grossError) errors.gross = grossError;
  const gross = parseAmount(draft.gross);
  const dateError = orderDateError(draft.orderedOn, today);
  if (dateError) errors.orderedOn = dateError;
  if (draft.plots.length > 1) {
    const filled = draft.plots.filter((p) => String(draft.split[p] ?? "").trim() !== "");
    let bad = false;
    for (const plot of draft.plots) {
      const e = checkAmount(draft.split[plot], { required: false });
      if (e) {
        errors[`split:${plot}`] = e;
        bad = true;
      }
    }
    if (!bad && filled.length && filled.length < draft.plots.length)
      errors.split =
        "Enter a value for every plot, or leave them all blank to split the order evenly.";
    else if (!bad && filled.length && !grossError) {
      const sum = r2(draft.plots.reduce((s, p) => s + parseAmount(draft.split[p]), 0));
      if (Math.abs(sum - gross) > 0.009)
        errors.split = `The plot values add up to ${paise(sum)}, but the order value is ${paise(gross)}. Difference: ${paise(Math.abs(gross - sum))}.`;
    }
  }
  if (String(draft.advance).trim()) {
    const e = checkAmount(draft.advance, { label: "the advance" });
    if (e) errors.advance = e;
    else if (!grossError && parseAmount(draft.advance) > gross)
      errors.advance = `The advance can't be more than the order value of ${paise(gross)}.`;
    const d = checkDate(draft.advanceOn, "the date the advance was paid", today);
    if (d) errors.advanceOn = d;
    if (!PAID_BY.includes(draft.advanceBy)) errors.advanceBy = "Choose who paid.";
  }
  return errors;
}

/** The plot values to store from what was typed: all blank is none (split evenly). */
export function splitToSave(plots: string[], typed: Record<string, string>): Amounts {
  if (plots.length < 2) return {};
  const out: Amounts = {};
  for (const plot of plots) {
    const v = parseAmount(typed[plot]);
    if (v > 0) out[plot] = v;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Editing an order
// ---------------------------------------------------------------------------------------------------------------

export const ORDER_FIELDS = [
  "vendorId",
  "item",
  "orderedOn",
  "gross",
  "deduction",
  "deductionPlot",
  "deductionNote",
  "payNote",
  "notes",
] as const;
export type OrderField = (typeof ORDER_FIELDS)[number];

export function validateOrderField(
  order: Order,
  pays: Payment[],
  field: OrderField,
  raw: string,
  vendors: Vendor[],
  today: string,
): string {
  const paid = figures(order, pays).paid;
  if (field === "gross") {
    const e = checkAmount(raw, { label: "the order value" });
    if (e) return e;
    const gross = parseAmount(raw);
    if (order.deduction >= gross) return "The order value must be more than the deduction.";
    if (gross - order.deduction < paid - 0.5)
      return `After deductions this would be ${paise(gross - order.deduction)}, less than the ${paise(paid)} already paid. Edit the payments first.`;
  }
  if (field === "deduction") {
    const e = checkAmount(raw, { required: false, positive: false });
    if (e) return e;
    const d = parseAmount(raw);
    if (d >= order.gross)
      return `The deduction must be less than the order value of ${paise(order.gross)}.`;
    if (order.gross - d < paid - 0.5)
      return `After this deduction the order would be ${paise(order.gross - d)}, less than the ${paise(paid)} already paid. Edit the payments first.`;
  }
  if (field === "deductionPlot" && raw && !order.plots.includes(raw))
    return "Pick a plot on this order.";
  if (field === "orderedOn") return orderDateError(raw, today);
  if (field === "vendorId" && !vendors.some((v) => v.id === raw))
    return "Choose a vendor from the list.";
  if ((field === "item" || field === "payNote" || field === "deductionNote") && raw.length > 80)
    return "Keep this under 80 characters.";
  if (field === "notes" && raw.length > 2000) return "Keep the notes under 2,000 characters.";
  return "";
}

/** A new order value keeps the plot values in proportion, the last plot taking the paisa. */
export function scaleSplit(order: Order, gross: number): Amounts {
  const keys = order.plots.filter((p) => p in order.split);
  const sum = keys.reduce((s, p) => s + (Number(order.split[p]) || 0), 0);
  const k = sum ? gross / sum : 0;
  let run = 0;
  const out: Amounts = {};
  keys.forEach((plot, i) => {
    const v = i === keys.length - 1 ? r2(gross - run) : r2(order.split[plot] * k);
    run = r2(run + v);
    out[plot] = v;
  });
  return out;
}

export function validateSplit(order: Order, typed: Record<string, string>): Errors {
  const errors: Errors = {};
  let bad = false;
  for (const plot of order.plots) {
    const e = checkAmount(typed[plot], { label: "a value for " + plot });
    if (e) {
      errors[`split:${plot}`] = e;
      bad = true;
    }
  }
  if (!bad) {
    const sum = r2(order.plots.reduce((s, p) => s + parseAmount(typed[p]), 0));
    if (Math.abs(sum - order.gross) > 0.009)
      errors.split = `The plot values add up to ${paise(sum)}, but the order value is ${paise(order.gross)}. Difference: ${paise(Math.abs(order.gross - sum))}.`;
  }
  return errors;
}

/** Adding or removing one plot: refused while payments are marked for it; plot values that no longer fit are cleared. */
export function togglePlot(
  order: Order,
  pays: Payment[],
  plot: string,
):
  | { error: string }
  | { plots: string[]; split: Amounts; deductionPlot: string | null; splitCleared: boolean } {
  const removing = order.plots.includes(plot);
  let plots = order.plots.slice();
  if (removing) {
    if (plots.length === 1) return { error: "An order needs at least one plot." };
    const marked = r2(pays.reduce((s, p) => s + ((allocOf(p) ?? {})[plot] ?? 0), 0));
    if (marked > 0)
      return {
        error: `${paise(marked)} of payments are marked for ${plot}. Change those payments first, then remove the plot.`,
      };
    plots = plots.filter((p) => p !== plot);
  } else {
    if (plots.length >= 20) return { error: "An order can name at most 20 plots." };
    plots = [...plots, plot].sort(plotSort);
  }
  const hadSplit = Object.keys(order.split).length > 0;
  let split: Amounts = {};
  if (plots.length > 1 && hadSplit && removing) {
    split = Object.fromEntries(Object.entries(order.split).filter(([k]) => plots.includes(k)));
    const sum = Object.values(split).reduce((a, b) => a + b, 0);
    if (Math.abs(sum - order.gross) > 0.5) split = {};
  }
  return {
    plots,
    split,
    deductionPlot:
      order.deductionPlot && plots.includes(order.deductionPlot) ? order.deductionPlot : null,
    splitCleared: hadSplit && plots.length > 1 && !Object.keys(split).length,
  };
}

/** A typed plot: "45" and "plot 45" both become "Plot 45"; a known plot keeps its own spelling. */
export function plotName(
  raw: string,
  ledger: Pick<Ledger, "orders">,
): { name: string } | { error: string } | null {
  let p = raw.trim().replace(/\s+/g, " ");
  if (!p) return null;
  if (/^plot\s*/i.test(p)) p = "Plot " + p.replace(/^plot\s*/i, "");
  else if (/^\d/.test(p)) p = "Plot " + p;
  if (p.length > 24) return { error: "Keep plot names under 24 characters." };
  if (!/^[A-Za-z0-9][A-Za-z0-9 \-&]*$/.test(p))
    return { error: "Plot names can use letters, numbers, spaces and hyphens only." };
  const known = allPlots(ledger).find((x) => x.toLowerCase() === p.toLowerCase());
  return { name: known ?? p };
}
