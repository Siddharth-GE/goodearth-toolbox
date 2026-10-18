/**
 * One priced line (PO or bill) and the GST split. Pure; shared because tools never import each other.
 * gross = quantity × rate (lump sum: the rate); taxable = gross − discount (% or ₹, never both);
 * GST = taxable × gst% / 100 as CGST + SGST halves or IGST; total = taxable + GST + charges (after tax).
 * The database mirrors this in po_billing_totals and the bill roll-up (0106): change all three.
 * NULL IS NOT ZERO: a line without a rate has no amount. ROUND ONLY WHEN DISPLAYING.
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

/** Kerala, the company's default state (0101). */
export const DEFAULT_COMPANY_STATE = "Kerala";

/** Same state: CGST + SGST; another: IGST. A vendor with no known state counts as same-state and `assumed` says so. */
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

export function splitGst(gst: number, interState: boolean): GstSplit {
  return interState ? { cgst: 0, sgst: 0, igst: gst } : { cgst: gst / 2, sgst: gst / 2, igst: 0 };
}

/**
 * To the paisa, half away from zero, as the figure reads in decimal: 1.005 is
 * 1.01, as Postgres's round(x, 2) has it, though the float underneath is 1.00499….
 */
export function roundPaise(value: number): number {
  const paise = Math.round(Number((Math.abs(value) * 100).toPrecision(15)));
  return paise === 0 ? 0 : (Math.sign(value) * paise) / 100;
}
