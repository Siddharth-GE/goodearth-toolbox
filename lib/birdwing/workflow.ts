// Mirror of birdwing_stays_guard (0115), the real boundary: enquiry → confirmed → checked_in → checked_out (each undoable one step),
// enquiry | confirmed → cancelled (final), blocked → cancelled. An issued invoice freezes the charges; a block has none.
import type { StayStatus } from "./shared";

const NEXT: Record<StayStatus, readonly StayStatus[]> = {
  enquiry: ["confirmed", "cancelled"],
  confirmed: ["checked_in", "cancelled"],
  checked_in: ["checked_out", "confirmed"],
  checked_out: ["checked_in"],
  blocked: ["cancelled"],
  cancelled: [],
};

export function nextStatuses(status: StayStatus): readonly StayStatus[] {
  return NEXT[status];
}

export function canMove(from: StayStatus, to: StayStatus): boolean {
  return NEXT[from].includes(to);
}

export function moveLabel(from: StayStatus, to: StayStatus): string {
  if (to === "confirmed") return from === "checked_in" ? "Undo check-in" : "Confirm";
  if (to === "checked_in") return from === "checked_out" ? "Undo check-out" : "Check in";
  if (to === "checked_out") return "Check out";
  if (to === "cancelled") return from === "blocked" ? "Remove block" : "Cancel stay";
  return to;
}

export function isUndo(from: StayStatus, to: StayStatus): boolean {
  return (
    (from === "checked_in" && to === "confirmed") || (from === "checked_out" && to === "checked_in")
  );
}

export function canEditRooms(status: StayStatus): boolean {
  return status !== "cancelled" && status !== "checked_out";
}

export function canEditDetails(status: StayStatus): boolean {
  return status !== "cancelled";
}

export function canEditCharges(input: { isBlock: boolean; hasIssuedInvoice: boolean }): boolean {
  return !input.isBlock && !input.hasIssuedInvoice;
}

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
