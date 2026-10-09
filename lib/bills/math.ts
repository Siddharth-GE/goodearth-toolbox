/**
 * A bill's arithmetic (0106 — bills have lines). Pure.
 *
 * Each line is priced by the shared lib/line-money.ts formula, exactly as
 * a PO line is. The header figures are what the database STORES — the
 * bill_lines_roll_up trigger rounds each sum to the paisa — so this
 * module rounds the same way and the screen's live preview of a bill can
 * never disagree with the figure that lands.
 */
import { lineMoney, type LineMoneyInput } from "@/lib/line-money";

export type BillLineMoney = LineMoneyInput;

export type BillTotals = {
  taxable: number;
  gst: number;
  other: number;
  total: number;
  /** Lines without a rate yet — they add nothing and are counted aloud. */
  unpricedCount: number;
};

const paisa = (value: number) => Math.round(value * 100) / 100;

/** The header a bill's lines make, rounded as the database stores it. */
export function rollUpBill(lines: BillLineMoney[]): BillTotals {
  let taxable = 0;
  let gst = 0;
  let other = 0;
  let unpricedCount = 0;
  for (const line of lines) {
    // A bill line always has a GST % (default 0 in the table), so only a
    // missing rate leaves it unpriced.
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

/** What is still to pay on a bill: its total less payments and advance recoveries. */
export function pendingOnBill(total: number, paid: number, recovered: number): number {
  return Math.max(0, paisa(total - paid - recovered));
}

/** One line's figures — taxable, GST, other, total — or null while it has no rate. */
export function billLineMoney(line: BillLineMoney) {
  return lineMoney({ ...line, gst_pct: line.gst_pct ?? 0 });
}
