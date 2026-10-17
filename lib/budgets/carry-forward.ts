/**
 * Unchanged line: everything copies. Quantity changed by the designer: take the designer's quantity, keep the unit cost, flag it (flagged, not blocked).
 * New line: no row, arrives with the default margin and empty cost. Removed line: absent; its budget line stays with the old revision.
 */

export type PreviousBudgetLine = {
  line_key: string;
  /** The budget team's adjusted figure, not the designer's. */
  quantity: number;
  expected_vendor_id: string | null;
  unit_cost: number | null;
  margin_pct: number | null;
  notes: string | null;
};

export type KeyedQuantity = { line_key: string; quantity: number };

export type CarriedLine = {
  line_key: string;
  quantity: number;
  expected_vendor_id: string | null;
  unit_cost: number | null;
  margin_pct: number | null;
  notes: string | null;
  needs_review: boolean;
};

export type CarryForwardPlan = {
  lines: CarriedLine[];
  carried: number;
  needsReview: number;
  fresh: number;
};

export function planCarryForward({
  previousBudgetLines,
  previousSelectionLines,
  currentSelectionLines,
}: {
  previousBudgetLines: PreviousBudgetLine[];
  previousSelectionLines: KeyedQuantity[];
  currentSelectionLines: KeyedQuantity[];
}): CarryForwardPlan {
  const previousBudget = new Map(previousBudgetLines.map((line) => [line.line_key, line]));
  const previousDesign = new Map(
    previousSelectionLines.map((line) => [line.line_key, line.quantity]),
  );

  const lines: CarriedLine[] = [];
  let carried = 0;
  let needsReview = 0;
  let fresh = 0;

  for (const line of currentSelectionLines) {
    const previous = previousBudget.get(line.line_key);
    if (!previous) {
      // Genuinely new: no row is written; the screen fills the margin from item_margins.
      fresh++;
      continue;
    }

    const designedBefore = previousDesign.get(line.line_key);
    // Undefined: a budget row with no previous design line. Treated as unchanged.
    const quantityChanged = designedBefore !== undefined && designedBefore !== line.quantity;

    lines.push({
      line_key: line.line_key,
      quantity: quantityChanged ? line.quantity : previous.quantity,
      expected_vendor_id: previous.expected_vendor_id,
      unit_cost: previous.unit_cost,
      margin_pct: previous.margin_pct,
      notes: previous.notes,
      needs_review: quantityChanged,
    });

    // A never-priced previous line carries vendor and margin but still needs a cost, so it counts as work remaining.
    if (previous.unit_cost === null) fresh++;
    else if (quantityChanged) needsReview++;
    else carried++;
  }

  return { lines, carried, needsReview, fresh };
}
