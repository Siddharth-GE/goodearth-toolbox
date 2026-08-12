/**
 * Derived line arithmetic. Pure, imported by queries.ts when a dataset
 * declares derived fields (the money datasets, Stage 6).
 *
 * The two rules, both borrowed from lib/purchase-orders/math.ts:
 * FULL PRECISION until display — rounding happens in lib/format.ts and
 * nowhere earlier, so a column of rounded lines still adds up — and a
 * NULL PROPAGATES, never becomes 0. An unpriced line has no value; a
 * free line has value 0. Conflating them is how a quote goes out with
 * something given away.
 */

/**
 * quantity × rate × (1 + gst/100). Null quantity or rate → null.
 * A null GST rate means "no GST typed", which is 0% — GST-free items
 * exist; rate-free items are just unpriced.
 */
export function lineValue(
  quantity: number | null | undefined,
  rate: number | null | undefined,
  gstPct: number | null | undefined,
): number | null {
  if (
    quantity === null ||
    quantity === undefined ||
    !Number.isFinite(quantity) ||
    rate === null ||
    rate === undefined ||
    !Number.isFinite(rate)
  ) {
    return null;
  }
  const gst = gstPct === null || gstPct === undefined || !Number.isFinite(gstPct) ? 0 : gstPct;
  return quantity * rate * (1 + gst / 100);
}
