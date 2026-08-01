/**
 * Carrying pricing forward from one revision's budget to the next.
 *
 * Pure — no database, no imports — so the rules can be tested directly.
 * This is the payoff for everything `line_key` has been doing since
 * migration 0006: when a designer issues R3 having changed two items, the
 * budget team should find two lines waiting, not two hundred.
 *
 * The four cases, and why each behaves as it does:
 *
 *   Unchanged line     → cost, margin, vendor AND the budget team's own
 *                        adjusted quantity all copy over. Nothing to do.
 *   Quantity changed   → take the DESIGNER'S new quantity, because the
 *      by the designer     design changed and the team's old measurement
 *                        is stale. Keep the unit cost — the item didn't
 *                        change, only how much of it — and flag it for
 *                        review. Flagged, not blocked: the line has a
 *                        price, it just deserves a second look.
 *   New line           → no row at all. The pricing screen takes its
 *                        spine from the revision's own lines, so this
 *                        still appears; it arrives with the product's
 *                        default margin and an empty cost.
 *   Removed line       → absent. Its old budget line stays attached to
 *                        the old revision as history.
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

/** Just enough of a selection line to compare revisions. */
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
  /** Rows to insert into the new budget. */
  lines: CarriedLine[];
  /** Arrived priced and untouched — the whole point of the exercise. */
  carried: number;
  /** Priced, but the designer moved the quantity. Worth a look. */
  needsReview: number;
  /** No usable previous price: new items, and lines never priced before. */
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
  const previousDesign = new Map(previousSelectionLines.map((line) => [line.line_key, line.quantity]));

  const lines: CarriedLine[] = [];
  let carried = 0;
  let needsReview = 0;
  let fresh = 0;

  for (const line of currentSelectionLines) {
    const previous = previousBudget.get(line.line_key);
    if (!previous) {
      // Genuinely new to this revision. No row is written; the screen
      // fills the margin in from item_margins when it renders.
      fresh++;
      continue;
    }

    const designedBefore = previousDesign.get(line.line_key);
    // Undefined means the line had a budget row but no previous design
    // line — not something the revision model produces, but treating it
    // as "unchanged" is the harmless reading.
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

    // A previous line that was never priced carries its vendor and margin
    // forward but still needs a cost, so it counts as work remaining
    // rather than as something settled.
    if (previous.unit_cost === null) fresh++;
    else if (quantityChanged) needsReview++;
    else carried++;
  }

  return { lines, carried, needsReview, fresh };
}
