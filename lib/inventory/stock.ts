// A balance is never stored, only computed from movements. Mirrors stock_on_hand and the negative-stock
// guards (0023) so the screen shows the number the database will enforce. Pure and import-free.

/** The four kinds are the four branches of stock_on_hand; a transfer is an "issue" out and a "transfer_in". */
export type MovementKind = "receipt" | "issue" | "transfer_in" | "adjustment";

export type Movement = {
  kind: MovementKind;
  store_id: string;
  item_id: string;
  /** As recorded: signed only for an adjustment, where negative removes. */
  quantity: number;
};

export function signedQuantity(movement: Movement): number {
  return movement.kind === "issue" ? -movement.quantity : movement.quantity;
}

export function balanceOf(movements: Movement[]): number {
  return movements.reduce((total, movement) => total + signedQuantity(movement), 0);
}

/** Keyed `${store_id}:${item_id}`. Zero balances are kept: "had some, has none" differs from "never held". */
export function balancesByStoreItem(movements: Movement[]): Map<string, number> {
  const balances = new Map<string, number>();
  for (const movement of movements) {
    const key = `${movement.store_id}:${movement.item_id}`;
    balances.set(key, (balances.get(key) ?? 0) + signedQuantity(movement));
  }
  return balances;
}

/** Clamped at zero so a hand-corrected over-receipt never shows negative. */
export function remainingToReceive(ordered: number, received: number): number {
  return Math.max(0, ordered - received);
}

export function isFullyReceived(ordered: number, received: number): boolean {
  return received >= ordered;
}

/** A PO completes when every line has fully arrived (purchase_orders_guard()); lets the screen say so early. */
export function isFullyReceivedOrder(lines: { ordered: number; received: number }[]): boolean {
  return lines.length > 0 && lines.every((l) => isFullyReceived(l.ordered, l.received));
}

/** Whether this issue would take the store below zero (stock_issue_lines_qty_guard); the database is still the boundary. */
export function wouldGoNegative(available: number, quantity: number): boolean {
  return quantity > available;
}
