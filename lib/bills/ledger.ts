// Pure. Examples: Rs 25 lakh billed with Rs 20 lakh released leaves Rs 5 lakh pending; Rs 1 lakh paid on a Rs 1.5 lakh bill leaves Rs 50,000.
import { formatMoney } from "@/lib/format";

import { pendingOnBill } from "./math";
import { roundPaise } from "@/lib/line-money";

/** The Monday (YYYY-MM-DD) of the week a date falls in — cash_requests.week_of. */
export function mondayOf(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const offset = (date.getUTCDay() + 6) % 7; // Monday = 0
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}

export type LedgerBill = { total: number; paid: number; recovered: number };
export type LedgerAdvance = { amount: number; recovered: number };

export type ContractorPosition = {
  billed: number;
  paid: number;
  recoveredOnBills: number;
  pending: number;
  advancesGiven: number;
  advancesRecovered: number;
  advancesOutstanding: number;
};

export function contractorPosition(
  bills: LedgerBill[],
  advances: LedgerAdvance[],
): ContractorPosition {
  const billed = bills.reduce((sum, bill) => sum + bill.total, 0);
  const paid = bills.reduce((sum, bill) => sum + bill.paid, 0);
  const recoveredOnBills = bills.reduce((sum, bill) => sum + bill.recovered, 0);
  const pending = bills.reduce(
    (sum, bill) => sum + pendingOnBill(bill.total, bill.paid, bill.recovered),
    0,
  );
  const advancesGiven = advances.reduce((sum, advance) => sum + advance.amount, 0);
  const advancesRecovered = advances.reduce((sum, advance) => sum + advance.recovered, 0);
  return {
    billed: roundPaise(billed),
    paid: roundPaise(paid),
    recoveredOnBills: roundPaise(recoveredOnBills),
    pending: roundPaise(pending),
    advancesGiven: roundPaise(advancesGiven),
    advancesRecovered: roundPaise(advancesRecovered),
    advancesOutstanding: roundPaise(Math.max(0, advancesGiven - advancesRecovered)),
  };
}

export type CashRequestStatus = "draft" | "submitted" | "released" | "closed";

export const CASH_REQUEST_STATUS_LABEL: Record<CashRequestStatus, string> = {
  draft: "Being put together",
  submitted: "With the approver",
  released: "Released — paying",
  closed: "Closed",
};

export type CashRequestLine = {
  requested: number;
  /** Null until the approver releases (or cuts) it. */
  released: number | null;
  paid: number;
};

export function cashRequestFigures(lines: CashRequestLine[]): {
  requested: number;
  released: number;
  paid: number;
  toPay: number;
} {
  const requested = lines.reduce((sum, line) => sum + line.requested, 0);
  const released = lines.reduce((sum, line) => sum + (line.released ?? 0), 0);
  const paid = lines.reduce((sum, line) => sum + line.paid, 0);
  const toPay = lines.reduce((sum, line) => sum + lineLeftToPay(line), 0);
  return {
    requested: roundPaise(requested),
    released: roundPaise(released),
    paid: roundPaise(paid),
    toPay: roundPaise(toPay),
  };
}

export function lineLeftToPay(line: CashRequestLine): number {
  return Math.max(0, roundPaise((line.released ?? 0) - line.paid));
}

export type MoneyKind = "payment" | "advance" | "recovery";

export const MONEY_KIND_LABEL: Record<
  MoneyKind,
  { entry: string; reversal: string; noun: string }
> = {
  payment: { entry: "Payment", reversal: "Payment reversed", noun: "payment" },
  advance: { entry: "Advance", reversal: "Advance reversed", noun: "advance" },
  recovery: { entry: "Recovered", reversal: "Recovery reversed", noun: "recovery" },
};

/**
 * Money is reversed, never deleted (0147): once, never a reversal itself, by a bill approver or an admin; an advance
 * only once nothing is left recovered from it. `recovered` is what is recovered from an advance, net of reversals.
 */
export function moneyReversal(
  entry: { kind: MoneyKind; reversal: boolean; reversed: boolean; recovered?: number },
  decider: { isAdmin: boolean; isApprover: boolean },
): { kind: "cancel" } | { kind: "blocked"; why: string } | null {
  if (entry.reversal || entry.reversed || !(decider.isAdmin || decider.isApprover)) return null;
  const recovered = entry.recovered ?? 0;
  if (entry.kind === "advance" && recovered > 0.005) {
    return {
      kind: "blocked",
      why: `${formatMoney(recovered, { paise: true })} of it has been recovered from bills — reverse those recoveries first.`,
    };
  }
  return { kind: "cancel" };
}

/** The settlement guard's refusals, said first. `pending` is what the bill still has to settle; `cap` what is left of the released line it is paid from. */
export function paymentProblem(input: {
  amount: number;
  reference: string;
  pending: number;
  cap?: number | null;
}): string | undefined {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return "The amount must be more than zero.";
  }
  if (!input.reference.trim()) return "Type the UTR, cheque number or UPI reference.";
  if (input.amount > input.pending + 0.005) {
    return `That is more than this bill has pending (${formatMoney(input.pending, { paise: true })} left).`;
  }
  if (input.cap != null && input.amount > input.cap + 0.005) {
    return "That is more than was released for it on the cash request.";
  }
  return undefined;
}

export type LedgerEntryKind = "bill" | "payment" | "advance" | "recovery";

export type LedgerEntry = {
  id: string;
  kind: LedgerEntryKind;
  on: string;
  /** A bill's total, or money paid out; a reversal is the same amount below zero. */
  amount: number;
};

/** A day's bill comes before what paid it, so the balance never dips below what is owed on the way. */
const KIND_ORDER: Record<LedgerEntryKind, number> = { bill: 0, advance: 1, payment: 2, recovery: 3 };

/** One contractor's account, oldest first: a bill adds what is owed, a payment or an advance takes it away, and a
 * recovery only moves an advance onto a bill, so it leaves the balance alone. A balance below zero is advance
 * the contractor still holds. */
export function contractorLedger<T extends LedgerEntry>(entries: T[]): (T & { balance: number })[] {
  const sorted = [...entries].sort(
    (a, b) =>
      a.on.localeCompare(b.on) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.id.localeCompare(b.id),
  );
  let balance = 0;
  return sorted.map((entry) => {
    if (entry.kind === "bill") balance += entry.amount;
    else if (entry.kind !== "recovery") balance -= entry.amount;
    balance = roundPaise(balance);
    return { ...entry, balance };
  });
}
