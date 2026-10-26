// Pure PO money math (the lib/budgets/math.ts pattern). Amounts are DERIVED, never stored (0102), so a total can't disagree with its lines.
// NULL IS NOT ZERO: an unpriced line is not free; roll-ups count it separately. Round only when displaying (lib/format.ts).

import { formatPercent } from "@/lib/format";
import { lineMoney, splitGst, type DocumentCharges } from "@/lib/line-money";

export type PoLineMoney = {
  quantity: number;
  rate: number | null;
  gst_pct: number | null;
  /** 0102: a percentage OR a rupee discount, never both. */
  discount_pct?: number | null;
  discount_amount?: number | null;
  /** 0102: freight and the like, added after GST. */
  other_charges?: number | null;
};

export function lineTaxable(line: PoLineMoney): number | null {
  if (line.rate === null) return null;
  return lineMoney({ ...line, gst_pct: line.gst_pct ?? 0 })?.taxable ?? null;
}

/** GST owed on the line. Needs BOTH a rate and a GST % — see rollUpPo. */
export function lineGst(line: PoLineMoney): number | null {
  return lineMoney(line)?.gst ?? null;
}

export function lineTotal(line: PoLineMoney): number | null {
  return lineMoney(line)?.total ?? null;
}

export type PoLineFigures = {
  taxable: number;
  gst: number;
  cgst: number;
  sgst: number;
  igst: number;
  other: number;
  total: number;
};

export function lineFigures(line: PoLineMoney, interState: boolean): PoLineFigures | null {
  const money = lineMoney(line);
  if (money === null) return null;
  return {
    taxable: money.taxable,
    gst: money.gst,
    ...splitGst(money.gst, interState),
    other: money.other,
    total: money.total,
  };
}

export type PoTotals = {
  gross: number;
  discount: number;
  /** The lines' taxable value plus the additional charges, as po_billing_totals counts it (0133). */
  taxable: number;
  charges: number;
  chargesNote: string | null;
  gst: number;
  /** The GST split for this PO's vendor (lib/line-money.ts gstRegime). */
  cgst: number;
  sgst: number;
  igst: number;
  other: number;
  grand: number;
  gstBySlab: Map<number, number>;
  lineCount: number;
  pricedCount: number;
  pendingCount: number;
};

/** A line counts only when BOTH rate and gst_pct are present, so a half-priced line stays pending (issuing is blocked until none is: the 0021 guard). The PO's additional charges are taxed at their own slab. */
export function rollUpPo(
  lines: PoLineMoney[],
  interState = false,
  charges?: DocumentCharges | null,
): PoTotals {
  let gross = 0;
  let discount = 0;
  let taxable = 0;
  let gst = 0;
  let other = 0;
  let pricedCount = 0;
  const gstBySlab = new Map<number, number>();

  for (const line of lines) {
    const money = lineMoney(line);
    if (money === null || line.gst_pct === null) continue;
    pricedCount++;
    gross += money.gross;
    discount += money.discount;
    taxable += money.taxable;
    gst += money.gst;
    other += money.other;
    gstBySlab.set(line.gst_pct, (gstBySlab.get(line.gst_pct) ?? 0) + money.gst);
  }

  const chargesAmount = charges?.amount ?? 0;
  if (chargesAmount > 0) {
    const slab = charges?.gst_pct ?? 0;
    const chargesGst = chargesAmount * (slab / 100);
    taxable += chargesAmount;
    gst += chargesGst;
    gstBySlab.set(slab, (gstBySlab.get(slab) ?? 0) + chargesGst);
  }

  return {
    gross,
    discount,
    taxable,
    charges: chargesAmount,
    chargesNote: chargesAmount > 0 ? charges?.note?.trim() || null : null,
    gst,
    ...splitGst(gst, interState),
    other,
    grand: taxable + gst + other,
    gstBySlab,
    lineCount: lines.length,
    pricedCount,
    pendingCount: lines.length - pricedCount,
  };
}

export function isFullyPriced(lines: PoLineMoney[]): boolean {
  return lines.length > 0 && lines.every((line) => line.rate !== null && line.gst_pct !== null);
}

export type PoSummaryRow = { label: string; amount: number };

/** The screen and the printed PO share these rows. A discount shows Subtotal, Less discount, Taxable value; additional charges join the taxable value before GST; GST is split per slab; other charges come last, after tax. */
export function summaryRows(totals: PoTotals, interState: boolean): PoSummaryRow[] {
  const rows: PoSummaryRow[] = [];
  if (totals.discount > 0) {
    rows.push({ label: "Subtotal", amount: totals.gross });
    rows.push({ label: "Less discount", amount: totals.discount });
  }
  if (totals.charges > 0) {
    rows.push({
      label: totals.discount > 0 ? "After discount" : "Subtotal",
      amount: totals.taxable - totals.charges,
    });
    rows.push({
      label: totals.chargesNote
        ? `Additional charges — ${totals.chargesNote}`
        : "Additional charges",
      amount: totals.charges,
    });
    rows.push({ label: "Taxable value", amount: totals.taxable });
  } else {
    rows.push({
      label: totals.discount > 0 ? "Taxable value" : "Subtotal",
      amount: totals.taxable,
    });
  }
  for (const [slab, amount] of [...totals.gstBySlab.entries()].sort(([a], [b]) => a - b)) {
    if (slab === 0) continue;
    if (interState) {
      rows.push({ label: `IGST ${formatPercent(slab)}`, amount });
    } else {
      rows.push({ label: `CGST ${formatPercent(slab / 2)}`, amount: amount / 2 });
      rows.push({ label: `SGST ${formatPercent(slab / 2)}`, amount: amount / 2 });
    }
  }
  rows.push({ label: "GST total", amount: totals.gst });
  if (totals.other > 0) rows.push({ label: "Other charges", amount: totals.other });
  return rows;
}

/** The 0102 CHECKs hold the same rules in the database. A discount bigger than the line is refused here only: the database can't see the line's worth. */
export function lineChargesProblem(line: PoLineMoney): string | undefined {
  const { discount_pct: pct, discount_amount: amount, other_charges: other } = line;
  if (pct != null && amount != null) return "A discount is a percentage or an amount, not both.";
  if (pct != null && !(Number.isFinite(pct) && pct >= 0 && pct < 100)) {
    return "A discount must be from 0% to under 100%.";
  }
  if (amount != null && !(Number.isFinite(amount) && amount >= 0)) {
    return "A discount can't be negative.";
  }
  if (amount != null && line.rate !== null && amount > line.quantity * line.rate) {
    return "The discount is more than the line is worth.";
  }
  if (other != null && !(Number.isFinite(other) && other >= 0)) {
    return "Other charges can't be negative.";
  }
  return undefined;
}
