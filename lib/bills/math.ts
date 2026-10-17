// Pure. Header figures are what the database STORES (bill_lines_roll_up rounds each sum to the paisa), so this rounds the same way and the live preview never disagrees.
import { lineMoney, type LineMoneyInput } from "@/lib/line-money";

export type BillLineMoney = LineMoneyInput;

export type BillTotals = {
  taxable: number;
  gst: number;
  other: number;
  total: number;
  unpricedCount: number;
};

const paisa = (value: number) => Math.round(value * 100) / 100;

export function rollUpBill(lines: BillLineMoney[]): BillTotals {
  let taxable = 0;
  let gst = 0;
  let other = 0;
  let unpricedCount = 0;
  for (const line of lines) {
    // A bill line always has a GST % (default 0), so only a missing rate leaves it unpriced.
    const money = lineMoney({ ...line, gst_pct: line.gst_pct ?? 0 });
    if (money === null) {
      unpricedCount++;
      continue;
    }
    taxable += money.taxable;
    gst += money.gst;
    other += money.other;
  }
  const t = paisa(taxable);
  const g = paisa(gst);
  const o = paisa(other);
  return { taxable: t, gst: g, other: o, total: paisa(t + g + o), unpricedCount };
}

export function pendingOnBill(total: number, paid: number, recovered: number): number {
  return Math.max(0, paisa(total - paid - recovered));
}

export function billLineMoney(line: BillLineMoney) {
  return lineMoney({ ...line, gst_pct: line.gst_pct ?? 0 });
}
