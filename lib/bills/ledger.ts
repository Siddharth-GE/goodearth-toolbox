// Pure. Examples: Rs 25 lakh billed with Rs 20 lakh released leaves Rs 5 lakh pending; Rs 1 lakh paid on a Rs 1.5 lakh bill leaves Rs 50,000.
import { formatMoney } from "@/lib/format";

import { pendingOnBill } from "./math";

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

const paisa = (value: number) => Math.round(value * 100) / 100;

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
    billed: paisa(billed),
    paid: paisa(paid),
    recoveredOnBills: paisa(recoveredOnBills),
    pending: paisa(pending),
    advancesGiven: paisa(advancesGiven),
    advancesRecovered: paisa(advancesRecovered),
    advancesOutstanding: paisa(Math.max(0, advancesGiven - advancesRecovered)),
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
    requested: paisa(requested),
    released: paisa(released),
    paid: paisa(paid),
    toPay: paisa(toPay),
  };
}

export function lineLeftToPay(line: CashRequestLine): number {
  return Math.max(0, paisa((line.released ?? 0) - line.paid));
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
