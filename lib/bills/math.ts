// Pure. Header figures are what the database STORES (bill_lines_roll_up rounds each sum to the paisa), so this rounds the same way and the live preview never disagrees.
import { lineMoney, roundPaise, type DocumentCharges, type LineMoneyInput } from "@/lib/line-money";

export type BillLineMoney = LineMoneyInput;

export type BillTotals = {
  /** The lines' taxable value plus the additional charges (0133), as the header stores it. */
  taxable: number;
  charges: number;
  chargesNote: string | null;
  gst: number;
  other: number;
  total: number;
  unpricedCount: number;
};

/** The bill's additional charges join taxable and GST, each rounded to the paisa as bill_lines_roll_up does. */
export function rollUpBill(lines: BillLineMoney[], charges?: DocumentCharges | null): BillTotals {
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
  const chargesAmount = charges?.amount ?? 0;
  const chargesGst = roundPaise(chargesAmount * ((charges?.gst_pct ?? 0) / 100));
  const t = roundPaise(roundPaise(taxable) + chargesAmount);
  const g = roundPaise(roundPaise(gst) + chargesGst);
  const o = roundPaise(other);
  return {
    taxable: t,
    charges: chargesAmount,
    chargesNote: chargesAmount > 0 ? charges?.note?.trim() || null : null,
    gst: g,
    other: o,
    total: roundPaise(t + g + o),
    unpricedCount,
  };
}

export type BillSummaryRow = { label: string; amount: number };

/** The screen and the printed bill share these rows: charges join the taxable value before GST; other charges come after tax. */
export function summaryRows(totals: BillTotals): BillSummaryRow[] {
  const rows: BillSummaryRow[] = [];
  if (totals.charges > 0) {
    rows.push({ label: "Lines", amount: roundPaise(totals.taxable - totals.charges) });
    rows.push({
      label: totals.chargesNote
        ? `Additional charges — ${totals.chargesNote}`
        : "Additional charges",
      amount: totals.charges,
    });
  }
  rows.push({ label: "Taxable value", amount: totals.taxable });
  rows.push({ label: "GST", amount: totals.gst });
  if (totals.other > 0) rows.push({ label: "Other charges", amount: totals.other });
  return rows;
}

export function pendingOnBill(total: number, paid: number, recovered: number): number {
  return Math.max(0, roundPaise(total - paid - recovered));
}

export function billLineMoney(line: BillLineMoney) {
  return lineMoney({ ...line, gst_pct: line.gst_pct ?? 0 });
}
