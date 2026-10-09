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

/**
 * What an issue line actually drew, read back from the batch movements the
 * database recorded for it. Whatever no batch covered came from stock older
 * than batches, and is shown as "No batch" — the same tail `planBatches`
 * previews.
 */
export function recordedDraws(
  quantity: number,
  drawn: { receiptLineId: string; label: string; quantity: number; rate: number | null }[],
): BatchDraw[] {
  const draws: BatchDraw[] = drawn.map((draw) => ({ ...draw }));
  const covered = drawn.reduce((total, draw) => total + draw.quantity, 0);
  const left = Math.round((quantity - covered) * 1e6) / 1e6;
  if (left > 0) draws.push({ receiptLineId: null, label: "No batch", quantity: left, rate: null });
  return draws;
}

/**
 * Each receipt line's 0-based place on its receipt, given the lines in the
 * receipt's own order (created_at, then id — the order the delivery note
 * lists them). The place is half of a batch's name.
 */
export function placesOnReceipts(lines: { id: string; receiptId: string }[]): Map<string, number> {
  const counted = new Map<string, number>();
  const places = new Map<string, number>();
  for (const line of lines) {
    const place = counted.get(line.receiptId) ?? 0;
    places.set(line.id, place);
    counted.set(line.receiptId, place + 1);
  }
  return places;
}

/** A receipt line's money, as goods_receipt_line_rates holds it. */
export type LineRate = {
  rate: number | null;
  gstPct: number | null;
  /** The PO's net rate and GST, copied at receiving — never changed. */
  poRate: number | null;
  poGstPct: number | null;
};

/** The delivery bill said something other than the PO — flagged for accounts. */
export function differsFromPo(line: LineRate): boolean {
  return line.rate !== line.poRate || line.gstPct !== line.poGstPct;
}

export type Amount = { taxable: number | null; gst: number | null; total: number | null };

/** Quantity × rate, and the GST on it. An unknown rate or GST is an unknown
 * amount — never ₹0 (BUGCATCHER #13). */
export function lineAmount(quantity: number, rate: number | null, gstPct: number | null): Amount {
  const taxable = rate === null ? null : quantity * rate;
  const gst = taxable === null || gstPct === null ? null : (taxable * gstPct) / 100;
  return { taxable, gst, total: taxable === null || gst === null ? null : taxable + gst };
}

/** Column totals: each one unknown if any line's is. */
export function sumAmounts(amounts: Amount[]): Amount {
  const sum = (pick: (amount: Amount) => number | null) =>
    amounts.reduce<number | null>((total, amount) => {
      const value = pick(amount);
      return total === null || value === null ? null : total + value;
    }, 0);
  return {
    taxable: sum((amount) => amount.taxable),
    gst: sum((amount) => amount.gst),
    total: sum((amount) => amount.total),
  };
}
