/**
 * Store batches (0108), as pure rules.
 *
 * A batch is a store receipt line. Its name is derived — the receipt's
 * reference and the line's place on it, GRN/SAA/012-1 — never stored.
 * `planBatches` is the screen's preview of what `allocate_batches()` in
 * the database will do with an issue: the chosen batch first, then the
 * oldest; whatever no batch covers is stock from before batches ("no
 * batch", no rate). The database decides; this only lets the store-keeper
 * see it before pressing Save. Keep the two orders identical.
 */

export type Batch = {
  receiptLineId: string;
  /** e.g. "GRN/SAA/012-1". */
  label: string;
  receivedAt: string;
  quantity: number;
  /** From goods_receipt_line_rates; null for an /inventory-less reader or no rate. */
  rate: number | null;
};

/** "GRN/SAA/012" and the line's 0-based place on its receipt → "GRN/SAA/012-1". */
export function batchLabel(receiptReference: string, lineIndex: number): string {
  return `${receiptReference}-${lineIndex + 1}`;
}

export type BatchDraw = {
  receiptLineId: string | null;
  label: string;
  quantity: number;
  rate: number | null;
};

/** What an issue of `quantity` takes, batch by batch, in the database's order. */
export function planBatches(
  batches: Batch[],
  quantity: number,
  preferred: string | null = null,
): BatchDraw[] {
  const ordered = [...batches]
    .filter((batch) => batch.quantity > 0)
    .sort((a, b) => {
      if (preferred) {
        if (a.receiptLineId === preferred && b.receiptLineId !== preferred) return -1;
        if (b.receiptLineId === preferred && a.receiptLineId !== preferred) return 1;
      }
      return (
        a.receivedAt.localeCompare(b.receivedAt) || a.receiptLineId.localeCompare(b.receiptLineId)
      );
    });

  const draws: BatchDraw[] = [];
  let left = quantity;
  for (const batch of ordered) {
    if (left <= 0) break;
    const take = Math.min(left, batch.quantity);
    draws.push({
      receiptLineId: batch.receiptLineId,
      label: batch.label,
      quantity: take,
      rate: batch.rate,
    });
    left = Math.round((left - take) * 1e6) / 1e6;
  }
  if (left > 0) draws.push({ receiptLineId: null, label: "No batch", quantity: left, rate: null });
  return draws;
}

/** What an issue is worth: each draw at its batch's rate. Null if any part has no rate. */
export function issueValue(draws: BatchDraw[]): number | null {
  let total = 0;
  for (const draw of draws) {
    if (draw.rate === null) return null;
    total += draw.quantity * draw.rate;
  }
  return total;
}
