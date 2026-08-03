/**
 * The arithmetic behind "how much is in that store" and "how much of
 * this order is still to come".
 *
 * Founder rule: a balance is never stored, only computed from
 * movements — receipts in, issues out, transfers both ways, signed
 * adjustments. The database says the same thing in the stock_on_hand
 * view and the two negative-stock guards (migration 0023); this module
 * is the mirror those screens render from, so a store-keeper sees the
 * number the database is about to enforce rather than finding out on
 * submit.
 *
 * Pure and import-free so it can be tested directly.
 */

/**
 * What a movement did to one store's holding of one item. The four
 * kinds are exactly the four branches of the stock_on_hand view; a
 * transfer is two movements, "issue" out of one store and
 * "transfer_in" into the other.
 */
export type MovementKind = "receipt" | "issue" | "transfer_in" | "adjustment";

export type Movement = {
  kind: MovementKind;
  store_id: string;
  item_id: string;
  /**
   * Always as recorded: positive for a receipt, an issue and a
   * transfer; SIGNED for an adjustment, where a negative number is a
   * removal. signedQuantity() below applies the direction.
   */
  quantity: number;
};

/** What one movement adds to (or takes from) the store's balance. */
export function signedQuantity(movement: Movement): number {
  return movement.kind === "issue" ? -movement.quantity : movement.quantity;
}

/** The running balance of a single (store, item) from its movements. */
export function balanceOf(movements: Movement[]): number {
  return movements.reduce((total, movement) => total + signedQuantity(movement), 0);
}

/**
 * Balances for every (store, item) the movements touch, keyed
 * `${store_id}:${item_id}` — the shape the stock screens index by.
 * Combinations that net to zero are kept, not dropped: "this store
 * had some and has none left" is a different answer from "this store
 * never held it", and the movement history should still be reachable.
 */
export function balancesByStoreItem(movements: Movement[]): Map<string, number> {
  const balances = new Map<string, number>();
  for (const movement of movements) {
    const key = `${movement.store_id}:${movement.item_id}`;
    balances.set(key, (balances.get(key) ?? 0) + signedQuantity(movement));
  }
  return balances;
}

/**
 * How much of an ordered quantity is still to arrive. Clamped at zero
 * so an over-receipt corrected by hand can never show as a negative
 * "still to come" on the receive screen.
 */
export function remainingToReceive(ordered: number, received: number): number {
  return Math.max(0, ordered - received);
}

/** A PO line nobody needs to receive again. */
export function isFullyReceived(ordered: number, received: number): boolean {
  return received >= ordered;
}

/**
 * A PO completes itself when every line has fully arrived — the
 * condition the database checks in purchase_orders_guard() before
 * admitting issued -> completed. Mirrored here so the receive screen
 * can say "this finishes the order" before the button is pressed.
 */
export function isFullyReceivedOrder(lines: { ordered: number; received: number }[]): boolean {
  return lines.length > 0 && lines.every((l) => isFullyReceived(l.ordered, l.received));
}

/**
 * Whether issuing (or removing) this much would take the store below
 * zero — the check stock_issue_lines_qty_guard enforces. Screens use
 * it to disable the button; the database is still the boundary.
 */
export function wouldGoNegative(available: number, quantity: number): boolean {
  return quantity > available;
}
