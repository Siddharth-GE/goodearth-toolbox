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

// ---------------------------------------------------------------------
// Derived fields
// ---------------------------------------------------------------------
// A registry field whose value is arithmetic over the row's other
// fields rather than a column. The FieldDef names one of these keys in
// `derive` (a plain string there, to keep datasets.ts import-free;
// datasets.test.ts asserts every named key exists here), and
// extractRows computes it from the already-flattened row. Derived
// fields have no filterColumn and no sortColumn — nothing to push down.

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export const DERIVED: Record<string, (row: Record<string, unknown>) => number | null> = {
  /** A PO line's ordered value: quantity × rate × (1 + gst/100). */
  po_line_value: (row) => lineValue(num(row.quantity), num(row.rate), num(row.gst_pct)),
  /** A budget line's cost: quantity × unit cost. No GST at budget level. */
  budget_cost_value: (row) => lineValue(num(row.quantity), num(row.unit_cost), 0),
  /** The same line at the client's rate. */
  budget_client_value: (row) => lineValue(num(row.quantity), num(row.client_rate), 0),
  /**
   * Margin in rupees: client value − cost value. Null if EITHER side is
   * missing — a margin over an unpriced cost is not 100%, it is unknown.
   */
  budget_margin_value: (row) => {
    const cost = lineValue(num(row.quantity), num(row.unit_cost), 0);
    const client = lineValue(num(row.quantity), num(row.client_rate), 0);
    if (cost === null || client === null) return null;
    return client - cost;
  },
  /**
   * What is still to collect on a milestone: due − received. Null when
   * no due amount is set (an unpriced rung is not "fully collected");
   * received defaults to 0 because the view coalesces it — a rung
   * nobody has paid genuinely has received 0.
   */
  crm_balance_due: (row) => {
    const due = num(row.due_amount);
    if (due === null) return null;
    return due - (num(row.received_amount) ?? 0);
  },
};
