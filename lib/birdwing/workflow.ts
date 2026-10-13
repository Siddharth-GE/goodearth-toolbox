/**
 * A stay's status machine, as pure rules — the mirror that decides which
 * buttons render. The real boundary is birdwing_stays_guard (0115), which
 * holds against any write; this exists so the screens can be tested
 * without a database (the lib/bills/workflow.ts pattern).
 *
 *   enquiry → confirmed → checked_in → checked_out
 *   checked_in ↩ confirmed, checked_out ↩ checked_in   (undo a slip)
 *   enquiry | confirmed → cancelled                      (releases the rooms)
 *   blocked → cancelled                                  (a room block, removed)
 *
 * Cancelled is final. An issued invoice freezes the charges until it is
 * cancelled; a room block carries no charges at all.
 */
import type { StayStatus } from "./shared";

const NEXT: Record<StayStatus, readonly StayStatus[]> = {
  enquiry: ["confirmed", "cancelled"],
  confirmed: ["checked_in", "cancelled"],
  checked_in: ["checked_out", "confirmed"],
  checked_out: ["checked_in"],
  blocked: ["cancelled"],
  cancelled: [],
};

/** Where a stay may go from here — the guard's list, in button order. */
export function nextStatuses(status: StayStatus): readonly StayStatus[] {
  return NEXT[status];
}

export function canMove(from: StayStatus, to: StayStatus): boolean {
  return NEXT[from].includes(to);
}

/** The words on the button that makes the move. */
export function moveLabel(from: StayStatus, to: StayStatus): string {
  if (to === "confirmed") return from === "checked_in" ? "Undo check-in" : "Confirm";
  if (to === "checked_in") return from === "checked_out" ? "Undo check-out" : "Check in";
  if (to === "checked_out") return "Check out";
  if (to === "cancelled") return from === "blocked" ? "Remove block" : "Cancel stay";
  return to;
}

/** Undo moves are quiet buttons; the forward move is the primary one. */
export function isUndo(from: StayStatus, to: StayStatus): boolean {
  return (
    (from === "checked_in" && to === "confirmed") || (from === "checked_out" && to === "checked_in")
  );
}

/** Rooms are the stay's record once it has ended or been cancelled. */
export function canEditRooms(status: StayStatus): boolean {
  return status !== "cancelled" && status !== "checked_out";
}

/** Guest, dates, party and money fields: everything but a cancelled stay. */
export function canEditDetails(status: StayStatus): boolean {
  return status !== "cancelled";
}

export function canEditCharges(input: { isBlock: boolean; hasIssuedInvoice: boolean }): boolean {
  return !input.isBlock && !input.hasIssuedInvoice;
}

/** Why Issue is not offered, or null when it is. */
export function issueBlocker(input: {
  isBlock: boolean;
  hasIssuedInvoice: boolean;
  chargeCount: number;
  hasCompany: boolean;
}): string | null {
  if (input.isBlock) return "A room block has nothing to invoice.";
  if (input.hasIssuedInvoice) return "The invoice has been issued.";
  if (input.chargeCount === 0) return "Add a charge first.";
  if (!input.hasCompany) {
    return "An admin needs to choose the invoicing company in Birdwing → Settings first.";
  }
  return null;
}
