/**
 * Purchase order arithmetic — pure functions, no database, no imports.
 *
 * The lib/budgets/math.ts pattern, for the same reasons: this is the one
 * module allowed to compute PO money, and it is testable without I/O.
 * The database stores quantity, rate and gst_pct; every amount here is
 * DERIVED, never stored, so a printed total can't disagree with its own
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

export type PoLineMoney = {
  quantity: number;
  /** Purchase price per uom agreed with the vendor; null while drafting. */
  rate: number | null;
  /** Snapshot of the picked GST slab; null while drafting. */
  gst_pct: number | null;
};

/** Value before tax for the whole line, or null while unpriced. */
export function lineTaxable(line: PoLineMoney): number | null {
  if (line.rate === null) return null;
  return line.quantity * line.rate;
}

/** GST owed on the line. Needs BOTH a rate and a GST % — see rollUpPo. */
export function lineGst(line: PoLineMoney): number | null {
  const taxable = lineTaxable(line);
  if (taxable === null || line.gst_pct === null) return null;
  return taxable * (line.gst_pct / 100);
}

/** What the vendor invoices for the line: taxable + GST. */
export function lineTotal(line: PoLineMoney): number | null {
  const taxable = lineTaxable(line);
  const gst = lineGst(line);
  if (taxable === null || gst === null) return null;
  return taxable + gst;
}

export type PoTotals = {
  /** Full precision. Round at display, never here. */
  taxable: number;
  gst: number;
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
 * blocked until nothing is pending — the 0021 guard.)
 */
export function rollUpPo(lines: PoLineMoney[]): PoTotals {
  let taxable = 0;
  let gst = 0;
  let pricedCount = 0;
  const gstBySlab = new Map<number, number>();

  for (const line of lines) {
    const lineTax = lineTaxable(line);
    const lineTaxAmount = lineGst(line);
    if (lineTax === null || lineTaxAmount === null || line.gst_pct === null) continue;

    pricedCount++;
    taxable += lineTax;
    gst += lineTaxAmount;
    gstBySlab.set(line.gst_pct, (gstBySlab.get(line.gst_pct) ?? 0) + lineTaxAmount);
  }

  return {
    taxable,
    gst,
    grand: taxable + gst,
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
