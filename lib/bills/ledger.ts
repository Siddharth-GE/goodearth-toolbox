/**
 * Payments, as pure rules (0107): the week a cash request is for, and a
 * contractor's position — what was billed, paid and is pending, and what
 * was advanced, recovered and is still out. The founder's examples are
 * the tests: ₹25 lakh billed with ₹20 lakh released leaves ₹5 lakh
 * pending; ₹1 lakh paid on a ₹1.5 lakh bill leaves ₹50,000.
 */
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
  /** Bills settled from advances. */
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
