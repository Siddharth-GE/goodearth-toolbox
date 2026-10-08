/**
 * The arithmetic of one priced line — a PO line or a bill line — and the
 * GST split. Pure, no imports; shared because two tools (Purchase Orders
 * and Bills) price lines the same way and one tool never imports
 * another's code (CLAUDE.md). Each tool's own math.ts builds on this.
 *
 *   gross    = quantity × rate              (a lump sum: the rate)
 *   discount = gross × discount% , or the ₹ discount (never both — 0102)
 *   taxable  = gross − discount
 *   GST      = taxable × gst% / 100          CGST + SGST halves, or IGST
 *   total    = taxable + GST + other charges  (charges after tax, as
 *                                              vendors bill freight)
 *
 * The database mirrors this formula where it must store a figure:
 * po_billing_totals (0106) and the bill header roll-up (0106). Change one,
 * change all three.
 *
 * NULL IS NOT ZERO: a line without a rate has no amount. ROUND ONLY WHEN
 * DISPLAYING: every figure here is full precision.
 */

export type LineMoneyInput = {
  /** Null for a lump sum: the rate is the amount. */
  quantity: number | null;
  rate: number | null;
  gst_pct: number | null;
  discount_pct?: number | null;
  discount_amount?: number | null;
  other_charges?: number | null;
};

export type LineMoney = {
  gross: number;
  discount: number;
  taxable: number;
  gst: number;
  other: number;
  total: number;
};

/** Every figure of a line, or null while it has no rate or no GST %. */
export function lineMoney(line: LineMoneyInput): LineMoney | null {
  if (line.rate === null || line.gst_pct === null) return null;
  const gross = (line.quantity ?? 1) * line.rate;
  const discount =
    line.discount_pct != null
      ? gross * (line.discount_pct / 100)
      : line.discount_amount != null
        ? line.discount_amount
        : 0;
  const taxable = gross - discount;
  const gst = taxable * (line.gst_pct / 100);
  const other = line.other_charges ?? 0;
  return { gross, discount, taxable, gst, other, total: taxable + gst + other };
}

/** Kerala, as the company's default state — the 0101 column default. */
export const DEFAULT_COMPANY_STATE = "Kerala";

/**
 * Same state → CGST + SGST; another state → IGST. A vendor whose GST
 * state Masters does not know is treated as same-state, and `assumed`
 * says so, so the screen can warn rather than guess silently.
 */
export function gstRegime(
  vendorState: string | null | undefined,
  companyState: string | null | undefined,
): { interState: boolean; assumed: boolean } {
  const vendor = vendorState?.trim().toLowerCase();
  const company = (companyState?.trim() || DEFAULT_COMPANY_STATE).toLowerCase();
  if (!vendor) return { interState: false, assumed: true };
  return { interState: vendor !== company, assumed: false };
}

export type GstSplit = { cgst: number; sgst: number; igst: number };

/** A GST amount as CGST + SGST halves, or all IGST. */
export function splitGst(gst: number, interState: boolean): GstSplit {
  return interState ? { cgst: 0, sgst: 0, igst: gst } : { cgst: gst / 2, sgst: gst / 2, igst: 0 };
}
