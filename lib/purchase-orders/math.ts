/**
 * Purchase order arithmetic — pure functions, no database.
 *
 * The lib/budgets/math.ts pattern, for the same reasons: this is the one
 * module allowed to compute PO money, and it is testable without I/O.
 * The database stores quantity, rate, gst_pct, a discount and other
 * charges (0102); every amount here is DERIVED, never stored, so a printed total can't disagree with its own
 * lines.
 *
 * The two budget-math rules apply unchanged:
 *
 * 1. NULL IS NOT ZERO. An unpriced line has no amount — it is not free.
 *    Roll-ups count unpriced lines separately instead of adding nothing.
 *
 * 2. ROUND ONLY WHEN DISPLAYING. Totals sum full-precision values;
 *    rounding happens in lib/format.ts (formatAmount in PDFs) at the
 *    very end.
 */

import { formatPercent } from "@/lib/format";
import { lineMoney, splitGst } from "@/lib/line-money";

export type PoLineMoney = {
  quantity: number;
  /** Purchase price per uom agreed with the vendor; null while drafting. */
  rate: number | null;
  /** Snapshot of the picked GST slab; null while drafting. */
  gst_pct: number | null;
  /** 0102: a percentage OR a rupee discount, never both. */
  discount_pct?: number | null;
  discount_amount?: number | null;
  /** 0102: freight and the like, added after GST. */
  other_charges?: number | null;
};

/** Value before tax for the whole line (after its discount), or null while unpriced. */
export function lineTaxable(line: PoLineMoney): number | null {
  if (line.rate === null) return null;
  return lineMoney({ ...line, gst_pct: line.gst_pct ?? 0 })?.taxable ?? null;
}

/** GST owed on the line. Needs BOTH a rate and a GST % — see rollUpPo. */
export function lineGst(line: PoLineMoney): number | null {
  return lineMoney(line)?.gst ?? null;
}

/** What the vendor invoices for the line: taxable + GST + other charges. */
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

/** One line's figures with its GST split, or null while it is unpriced. */
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
  /** Full precision. Round at display, never here. */
  gross: number;
  discount: number;
  taxable: number;
  gst: number;
  /** The GST split for this PO's vendor (lib/line-money.ts gstRegime). */
  cgst: number;
  sgst: number;
  igst: number;
  other: number;
  grand: number;
  /** GST subtotal per slab (key: the gst_pct), for the PDF's totals box. */
  gstBySlab: Map<number, number>;
  lineCount: number;
  pricedCount: number;
  pendingCount: number;
};

/**
 * Rolls a PO's lines into one set of figures.
 *
 * A line counts only when BOTH rate and gst_pct are present — the same
 * both-or-neither rule budget math applies, so a half-priced line stays
 * pending rather than entering one total but not the other. (Issuing is
 * blocked until nothing is pending — the 0021 guard.) `interState`
 * decides whether the GST reads as IGST or as CGST + SGST halves.
 */
export function rollUpPo(lines: PoLineMoney[], interState = false): PoTotals {
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

  return {
    gross,
    discount,
    taxable,
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

/** True when every line is fully priced — the condition for issuing. */
export function isFullyPriced(lines: PoLineMoney[]): boolean {
  return lines.length > 0 && lines.every((line) => line.rate !== null && line.gst_pct !== null);
}

export type PoSummaryRow = { label: string; amount: number };

/**
 * The totals box, row by row, so the screen and the printed PO say the
 * same thing in the same order. A discount shows as Subtotal → Less
 * discount → Taxable value; without one, the taxable value is the
 * subtotal. GST is split per slab — CGST 9% + SGST 9% for an 18% slab
 * in-state, IGST 18% out of state — then totalled. Other charges come
 * last, after tax, as vendors bill them. The grand total is `totals.grand`.
 */
export function summaryRows(totals: PoTotals, interState: boolean): PoSummaryRow[] {
  const rows: PoSummaryRow[] = [];
  if (totals.discount > 0) {
    rows.push({ label: "Subtotal", amount: totals.gross });
    rows.push({ label: "Less discount", amount: totals.discount });
  }
  rows.push({ label: totals.discount > 0 ? "Taxable value" : "Subtotal", amount: totals.taxable });
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

/**
 * What is wrong with a line's discount and charges, in words, or
 * undefined. The 0102 CHECKs hold the same rules in the database; this
 * says them before a save is refused. A discount bigger than the line is
 * refused here only — the database cannot see the line's worth.
 */
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
