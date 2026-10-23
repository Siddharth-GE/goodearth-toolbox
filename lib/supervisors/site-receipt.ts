// Pure. The site confirms what reached it (0135): every line of the issue or delivery, never more than was sent, and a
// shortage says why. The database holds the quantity rule; the note is this action's.

export type ReceiptLine = { lineId: string; sent: number; received: number | null };

/** Waiting for the site: a delivery with lines and no confirmation, or one whose confirmation did not reach every line. */
export function awaitsConfirmation(delivery: {
  confirmed: boolean;
  lines: { received: number | null }[];
}): boolean {
  return (
    delivery.lines.length > 0 &&
    (!delivery.confirmed || delivery.lines.some((line) => line.received === null))
  );
}

export function isShort(line: { sent: number; received: number | null }): boolean {
  return line.received !== null && line.received < line.sent;
}

export function siteReceiptProblem(lines: ReceiptLine[], note: string | null): string | undefined {
  if (lines.length === 0) return "There is nothing on this to confirm.";
  if (lines.some((line) => line.received === null || !Number.isFinite(line.received))) {
    return "Give the quantity that arrived for every line — 0 if none did.";
  }
  if (lines.some((line) => (line.received ?? 0) < 0)) return "A quantity can't be below zero.";
  if (lines.some((line) => (line.received ?? 0) > line.sent)) {
    return "More than was sent can't have arrived — check the quantity.";
  }
  if (lines.some(isShort) && !note?.trim()) return "Something is short — say why.";
  return undefined;
}
