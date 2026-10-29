/**
 * Kaadal Billing's figures, pure: an order's net, paid and balance, its split across plots, the totals under a
 * plot filter, the plots and vendors at a glance, and the Checks tab. The rules are the founder's Kaadal Billing
 * sheet's, kept exactly (the tool's PLAN.md). `today` is passed in; nothing reads a clock.
 */
import { formatDate, formatMoney } from "@/lib/format";

export const GRANT = "/kaadal-billing";
export const BASE_PLOTS = ["Plot 11", "Plot 14", "Plot 24", "Plot 45-46", "Site"] as const;
export const KINDS = ["Advance", "Part payment", "Final payment", "Full payment"] as const;
export const PAID_BY = ["Kaadal", "Client"] as const;

export type Kind = (typeof KINDS)[number];
export type PaidBy = (typeof PAID_BY)[number];
export type Amounts = Record<string, number>;

export type Vendor = {
  id: string;
  name: string;
  bank: string;
  updatedAt: string;
  updatedBy: string | null;
};

export type Order = {
  id: string;
  vendorId: string;
  plots: string[];
  gross: number;
  /** The value per plot from the quote; empty means split evenly. */
  split: Amounts;
  deduction: number;
  /** The plot the deduction sits on; null means shared by value. */
  deductionPlot: string | null;
  deductionNote: string;
  item: string;
  payNote: string;
  notes: string;
  orderedOn: string | null;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
};

export type Payment = {
  id: string;
  orderId: string;
  amount: number;
  paidOn: string | null;
  paidBy: PaidBy;
  kind: Kind;
  /** The plots it is for; empty means shared by each plot's value. */
  alloc: Amounts;
  reference: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
};

export type Ledger = { vendors: Vendor[]; orders: Order[]; payments: Payment[] };

export type PayState = "none" | "part" | "paid";

/** Rupees to the paisa. Every sum goes through it, so 0.1 + 0.2 never shows as a balance. */
export const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** Within half a rupee counts as settled, as on the sheet. */
const SETTLED = 0.5;

const money = (n: number) => formatMoney(r2(n), { paise: !Number.isInteger(r2(n)) });

export const shortPlot = (plot: string) => plot.replace(/^Plot /, "");

/** Plot 11 before Plot 14 before Plot 45-46, and labels with no number (Site) last. */
export function plotSort(a: string, b: string): number {
  const na = parseFloat(a.replace(/\D+/, " "));
  const nb = parseFloat(b.replace(/\D+/, " "));
  if (Number.isNaN(na) && Number.isNaN(nb)) return a.localeCompare(b);
  if (Number.isNaN(na)) return 1;
  if (Number.isNaN(nb)) return -1;
  return na - nb;
}

/** Every plot the ledger knows: the five it started with and any an order names. */
export function allPlots(ledger: Pick<Ledger, "orders">): string[] {
  const set = new Set<string>(BASE_PLOTS);
  for (const order of ledger.orders) for (const plot of order.plots) set.add(plot);
  return [...set].sort(plotSort);
}

/** The plots a payment is marked for, or null when it is shared by value. */
export function allocOf(payment: Pick<Payment, "alloc">): Amounts | null {
  const entries = Object.entries(payment.alloc ?? {}).filter(([, v]) => Number(v) > 0);
  return entries.length ? Object.fromEntries(entries.map(([k, v]) => [k, Number(v)])) : null;
}

export function allocLabel(payment: Pick<Payment, "alloc">): string {
  const alloc = allocOf(payment);
  if (!alloc) return "";
  const plots = Object.keys(alloc).sort(plotSort);
  if (plots.length === 1) return `for ${plots[0]}`;
  return "split " + plots.map((p) => `${shortPlot(p)} ${formatMoney(alloc[p])}`).join(" · ");
}

export function orderLabel(order: Pick<Order, "item" | "plots">): string {
  return (order.item ? order.item + " · " : "") + order.plots.join(", ");
}

/** Payments by order, each list oldest first (no date first, as the sheet sorted them). */
export function paymentsByOrder(payments: Payment[]): Map<string, Payment[]> {
  const map = new Map<string, Payment[]>();
  for (const payment of payments) {
    const list = map.get(payment.orderId) ?? [];
    list.push(payment);
    map.set(payment.orderId, list);
  }
  for (const list of map.values()) {
    list.sort(
      (a, b) =>
        (a.paidOn ?? "0").localeCompare(b.paidOn ?? "0") || a.createdAt.localeCompare(b.createdAt),
    );
  }
  return map;
}

export type Figures = {
  net: number;
  paid: number;
  byKaadal: number;
  byClient: number;
  balance: number;
  state: PayState;
  over: boolean;
  /** The latest payment with a date. */
  last: Payment | null;
  count: number;
};

const stateOf = (net: number, paid: number, balance: number): PayState =>
  net > 0 && balance <= SETTLED ? "paid" : paid > SETTLED ? "part" : "none";

/** One order as a whole. */
export function figures(order: Order, pays: Payment[]): Figures {
  const net = r2(order.gross - order.deduction);
  const paid = r2(pays.reduce((s, p) => s + p.amount, 0));
  const byKaadal = r2(pays.filter((p) => p.paidBy !== "Client").reduce((s, p) => s + p.amount, 0));
  const balance = r2(net - paid);
  const dated = pays.filter((p) => p.paidOn);
  return {
    net,
    paid,
    byKaadal,
    byClient: r2(paid - byKaadal),
    balance,
    // The sheet counted any payment at all as part paid on a whole order.
    state: net > 0 && balance <= SETTLED ? "paid" : paid > 0 ? "part" : "none",
    over: balance < -SETTLED,
    last: dated[dated.length - 1] ?? null,
    count: pays.length,
  };
}

export type Share = {
  value: number;
  deduction: number;
  net: number;
  paid: number;
  byKaadal: number;
  balance: number;
};

/**
 * One order split across its plots: the value by the plot split (or evenly), the deduction on its plot (or shared
 * by value), a payment marked for plots on those plots, and an unmarked one shared by each plot's net value.
 */
export function shares(order: Order, pays: Payment[]): Record<string, Share> {
  const plots = order.plots.length ? order.plots : ["Unassigned"];
  const splitSum = plots.reduce((s, p) => s + (Number(order.split[p]) || 0), 0);
  const out: Record<string, Share> = {};
  for (const plot of plots) {
    const value =
      splitSum > 0
        ? (order.gross * (Number(order.split[plot]) || 0)) / splitSum
        : order.gross / plots.length;
    let deduction = 0;
    if (order.deduction) {
      if (plots.length === 1) deduction = order.deduction;
      else if (order.deductionPlot && plots.includes(order.deductionPlot))
        deduction = order.deductionPlot === plot ? order.deduction : 0;
      else
        deduction = order.gross
          ? (order.deduction * value) / order.gross
          : order.deduction / plots.length;
    }
    out[plot] = { value, deduction, net: value - deduction, paid: 0, byKaadal: 0, balance: 0 };
  }
  const totalNet = Object.values(out).reduce((s, x) => s + x.net, 0);
  for (const payment of pays) {
    const kaadal = payment.paidBy !== "Client";
    const alloc = allocOf(payment);
    if (alloc && Object.keys(alloc).every((p) => out[p])) {
      for (const [plot, v] of Object.entries(alloc)) {
        out[plot].paid += v;
        if (kaadal) out[plot].byKaadal += v;
      }
    } else {
      for (const plot of plots) {
        const part = payment.amount * (totalNet ? out[plot].net / totalNet : 1 / plots.length);
        out[plot].paid += part;
        if (kaadal) out[plot].byKaadal += part;
      }
    }
  }
  for (const share of Object.values(out)) share.balance = share.net - share.paid;
  return out;
}

export type OrderView = Figures & { shared: boolean };

/** An order's figures under a plot filter: the whole order for "All", its share of the plot otherwise. */
export function view(order: Order, pays: Payment[], plot: string): OrderView | null {
  const whole = figures(order, pays);
  if (plot === "All") return { ...whole, shared: false };
  const share = shares(order, pays)[plot];
  if (!share) return null;
  const net = r2(share.net);
  const paid = r2(share.paid);
  const balance = r2(share.balance);
  return {
    ...whole,
    net,
    paid,
    balance,
    byKaadal: r2(share.byKaadal),
    byClient: r2(paid - share.byKaadal),
    state: stateOf(net, paid, balance),
    over: balance < -SETTLED,
    shared: order.plots.length > 1,
  };
}

export const inPlot = (order: Order, plot: string) => plot === "All" || order.plots.includes(plot);

export function matches(order: Order, vendorName: string, q: string): boolean {
  if (!q) return true;
  return [
    vendorName,
    order.item,
    order.plots.join(" "),
    order.notes,
    order.payNote,
    order.deductionNote,
  ]
    .join(" ")
    .toLowerCase()
    .includes(q.toLowerCase());
}

export type Totals = {
  net: number;
  paid: number;
  byKaadal: number;
  byClient: number;
  balance: number;
  orders: number;
  open: number;
};

/** The band at the top: every order (or every share of a plot) added up. */
export function totals(ledger: Ledger, plot: string): Totals {
  const pays = paymentsByOrder(ledger.payments);
  const t = { net: 0, paid: 0, byKaadal: 0, byClient: 0, orders: 0, open: 0 };
  for (const order of ledger.orders) {
    if (!inPlot(order, plot)) continue;
    const v = view(order, pays.get(order.id) ?? [], plot);
    if (!v) continue;
    t.orders++;
    t.net += v.net;
    t.paid += v.paid;
    t.byKaadal += v.byKaadal;
    t.byClient += v.byClient;
    if (v.state !== "paid") t.open++;
  }
  return {
    net: r2(t.net),
    paid: r2(t.paid),
    byKaadal: r2(t.byKaadal),
    byClient: r2(t.byClient),
    balance: r2(t.net - t.paid),
    orders: t.orders,
    open: t.open,
  };
}

/** A payment's amount inside a plot filter: its mark for that plot, else its share by value. */
export function amountIn(payment: Payment, order: Order, pays: Payment[], plot: string): number {
  if (plot === "All" || order.plots.length <= 1) return payment.amount;
  const alloc = allocOf(payment);
  if (alloc) return r2(alloc[plot] ?? 0);
  const all = shares(order, pays);
  const total = Object.values(all).reduce((s, x) => s + x.net, 0);
  return r2(payment.amount * (total && all[plot] ? all[plot].net / total : 0));
}

export type PlotTotal = {
  plot: string;
  value: number;
  deduction: number;
  net: number;
  paid: number;
  balance: number;
  vendors: number;
  rows: { order: Order; share: Share }[];
};

export function plotTotals(ledger: Ledger): PlotTotal[] {
  const pays = paymentsByOrder(ledger.payments);
  const byPlot = new Map<string, PlotTotal & { vendorIds: Set<string> }>();
  for (const order of ledger.orders) {
    for (const [plot, share] of Object.entries(shares(order, pays.get(order.id) ?? []))) {
      const t = byPlot.get(plot) ?? {
        plot,
        value: 0,
        deduction: 0,
        net: 0,
        paid: 0,
        balance: 0,
        vendors: 0,
        rows: [],
        vendorIds: new Set<string>(),
      };
      t.value += share.value;
      t.deduction += share.deduction;
      t.net += share.net;
      t.paid += share.paid;
      t.balance += share.balance;
      t.vendorIds.add(order.vendorId);
      t.rows.push({ order, share });
      byPlot.set(plot, t);
    }
  }
  return [...byPlot.values()]
    .sort((a, b) => plotSort(a.plot, b.plot))
    .map(({ vendorIds, ...t }) => ({ ...t, vendors: vendorIds.size }));
}

export function plotState(t: Pick<PlotTotal, "net" | "paid" | "balance">): {
  label: string;
  tone: "success" | "warning" | "danger";
} {
  if (t.net > 0 && t.balance <= SETTLED) return { label: "Fully paid", tone: "success" };
  if (t.paid > SETTLED) return { label: "Balance pending", tone: "warning" };
  return { label: "Not paid", tone: "danger" };
}

export function vendorTotals(ledger: Ledger, vendorId: string) {
  const pays = paymentsByOrder(ledger.payments);
  let net = 0;
  let paid = 0;
  let orders = 0;
  for (const order of ledger.orders) {
    if (order.vendorId !== vendorId) continue;
    const f = figures(order, pays.get(order.id) ?? []);
    net += f.net;
    paid += f.paid;
    orders++;
  }
  return { net: r2(net), paid: r2(paid), balance: r2(net - paid), orders };
}

export type Check = {
  level: "bad" | "warn";
  text: string;
  fix: string;
  orderId: string | null;
  paymentId: string | null;
  vendorId: string | null;
};

/** The Checks tab: what doesn't add up (errors) and what deserves a second look (review). Errors first. */
export function runChecks(ledger: Ledger, today: string): Check[] {
  const out: Check[] = [];
  const add = (
    level: Check["level"],
    text: string,
    fix: string,
    orderId: string | null = null,
    paymentId: string | null = null,
    vendorId: string | null = null,
  ) => out.push({ level, text, fix, orderId, paymentId, vendorId });
  const vendors = new Map(ledger.vendors.map((v) => [v.id, v]));
  const orders = new Map(ledger.orders.map((o) => [o.id, o]));
  const pays = paymentsByOrder(ledger.payments);
  const vendorName = (id: string) => vendors.get(id)?.name ?? "Unknown vendor";

  for (const p of ledger.payments) {
    const o = orders.get(p.orderId);
    if (!o) continue;
    const who = `${vendorName(o.vendorId)} · ${orderLabel(o)}`;
    const marked = Object.entries(p.alloc ?? {}).filter(([, v]) => Number(v) > 0);
    if (marked.length) {
      const sum = r2(marked.reduce((s, [, v]) => s + Number(v), 0));
      if (Math.abs(sum - p.amount) > 0.009)
        add(
          "bad",
          `${who}: a ${money(p.amount)} payment is split as ${money(sum)} across plots.`,
          "Open the payment and make the plot amounts add up to the payment.",
          o.id,
          p.id,
        );
      if (marked.some(([k]) => !o.plots.includes(k)))
        add(
          "bad",
          `${who}: a payment is marked for a plot that isn't on this order.`,
          "Open the payment and pick the right plots.",
          o.id,
          p.id,
        );
    }
    if (!p.paidOn)
      add(
        "warn",
        `${who}: the ${money(p.amount)} ${p.kind.toLowerCase()} has no date.`,
        "Open it and add the date it was paid.",
        o.id,
        p.id,
      );
    else if (p.paidOn > today)
      add(
        "warn",
        `${who}: a payment is dated ${formatDate(p.paidOn)}, which is in the future.`,
        "Check the date.",
        o.id,
        p.id,
      );
  }

  const seen = new Map<string, Payment[]>();
  for (const p of ledger.payments) {
    if (!orders.has(p.orderId) || !p.paidOn) continue;
    const key = `${p.orderId}|${r2(p.amount)}|${p.paidOn}`;
    seen.set(key, [...(seen.get(key) ?? []), p]);
  }
  for (const group of seen.values()) {
    if (group.length < 2) continue;
    const o = orders.get(group[0].orderId)!;
    add(
      "warn",
      `${vendorName(o.vendorId)} · ${orderLabel(o)}: ${group.length} payments of ${money(group[0].amount)} on ${formatDate(group[0].paidOn)}.`,
      "Check this wasn't entered twice.",
      o.id,
      group[1].id,
    );
  }

  for (const o of ledger.orders) {
    const list = pays.get(o.id) ?? [];
    const f = figures(o, list);
    const who = `${vendorName(o.vendorId)} · ${orderLabel(o)}`;
    if (f.over)
      add(
        "bad",
        `${who}: paid ${money(-f.balance)} more than the order value.`,
        "Check the payments or the order value.",
        o.id,
      );
    if (o.plots.length > 1) {
      const keys = Object.keys(o.split);
      if (keys.length) {
        const sum = r2(keys.reduce((s, k) => s + (Number(o.split[k]) || 0), 0));
        if (keys.length !== o.plots.length || Math.abs(sum - o.gross) > SETTLED)
          add(
            "warn",
            `${who}: plot values add up to ${money(sum)}, but the order value is ${money(o.gross)}.`,
            "Open the order and correct the plot values.",
            o.id,
          );
      }
      const all = shares(o, list);
      for (const plot of o.plots) {
        if (all[plot] && all[plot].balance < -SETTLED)
          add(
            "warn",
            `${who}: ${plot} is paid ${money(-all[plot].balance)} more than its share.`,
            "Check which plot each payment is marked for.",
            o.id,
          );
      }
    }
  }

  for (const v of ledger.vendors) {
    const due = ledger.orders
      .filter((o) => o.vendorId === v.id && !o.payNote)
      .reduce((s, o) => s + Math.max(0, figures(o, pays.get(o.id) ?? []).balance), 0);
    if (due > SETTLED && !v.bank.trim())
      add(
        "warn",
        `${v.name} has ${money(due)} due but no bank details.`,
        "Add the bank details on the Vendors tab.",
        null,
        null,
        v.id,
      );
  }

  return out.sort((a, b) => (a.level === "bad" ? 0 : 1) - (b.level === "bad" ? 0 : 1));
}
