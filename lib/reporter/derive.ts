// Derived line arithmetic, pure. Full precision until display (rounding lives in lib/format.ts),
// and null propagates, never 0: an unpriced line has no value, a free line has 0.

/** A null GST rate means no GST typed (0%); a null quantity or rate gives null. */
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

// Derived fields have no filterColumn or sortColumn. FieldDef.derive names a key here
// (datasets.test.ts asserts it exists).

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export const DERIVED: Record<string, (row: Record<string, unknown>) => number | null> = {
  po_line_value: (row) => lineValue(num(row.quantity), num(row.rate), num(row.gst_pct)),
  budget_cost_value: (row) => lineValue(num(row.quantity), num(row.unit_cost), 0),
  budget_client_value: (row) => lineValue(num(row.quantity), num(row.client_rate), 0),
  // Null if EITHER side is missing: a margin over an unpriced cost is unknown, not 100%.
  budget_margin_value: (row) => {
    const cost = lineValue(num(row.quantity), num(row.unit_cost), 0);
    const client = lineValue(num(row.quantity), num(row.client_rate), 0);
    if (cost === null || client === null) return null;
    return client - cost;
  },
  // Null when no due amount is set; received defaults to 0 because the view coalesces it.
  crm_balance_due: (row) => {
    const due = num(row.due_amount);
    if (due === null) return null;
    return due - (num(row.received_amount) ?? 0);
  },
};
