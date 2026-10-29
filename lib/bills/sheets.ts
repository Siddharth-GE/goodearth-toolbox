// Pure. 0170 holds these rules in the database; the screens say them before anything is sent.

import { roundPaise } from "@/lib/line-money";

export type SheetStatus = "recorded" | "approved" | "undone";
/** What a person reads: paid is what the money says, never stored. */
export type SheetState = "waiting" | "approved" | "paid" | "undone";

export const SHEET_STATE_LABEL: Record<SheetState, string> = {
  waiting: "Waiting for approval",
  approved: "Approved",
  paid: "Paid",
  undone: "Undone",
};

export function sheetState(status: SheetStatus, total: number, pending: number): SheetState {
  if (status === "undone") return "undone";
  if (status === "recorded") return "waiting";
  return total > 0 && pending <= 0.005 ? "paid" : "approved";
}

/** Only these go on a sheet, and only on a sheet do they reach a cash request. */
export function isContractorLabourBill(bill: {
  kind: string;
  vendorIsContractor: boolean;
}): boolean {
  return bill.kind === "nmr" && bill.vendorIsContractor;
}

/** How one payment lands on a sheet's bills, given in sheet order (oldest first), as pay_bill_sheet spreads it. */
export function spreadOldestFirst(
  amount: number,
  bills: { id: string; pending: number }[],
): { parts: { id: string; amount: number }[]; left: number } {
  let left = roundPaise(amount);
  const parts: { id: string; amount: number }[] = [];
  for (const bill of bills) {
    if (left <= 0.005) break;
    const pending = roundPaise(bill.pending);
    if (pending <= 0.005) continue;
    const part = Math.min(left, pending);
    parts.push({ id: bill.id, amount: part });
    left = roundPaise(left - part);
  }
  return { parts, left };
}

export type ConsolidateResult = {
  sheets: { id: string; reference: string; added: number }[];
  skipped: { id: string; reference: string | null; reason: string }[];
};

/** What consolidate_bills answers, checked before a screen trusts it. */
export function readConsolidateResult(value: unknown): ConsolidateResult | null {
  if (!value || typeof value !== "object") return null;
  const { sheets, skipped } = value as { sheets?: unknown; skipped?: unknown };
  if (!Array.isArray(sheets) || !Array.isArray(skipped)) return null;
  const isSheet = (row: unknown): row is ConsolidateResult["sheets"][number] =>
    !!row &&
    typeof (row as { id?: unknown }).id === "string" &&
    typeof (row as { reference?: unknown }).reference === "string" &&
    typeof (row as { added?: unknown }).added === "number";
  const isSkip = (row: unknown): row is ConsolidateResult["skipped"][number] =>
    !!row &&
    typeof (row as { id?: unknown }).id === "string" &&
    typeof (row as { reason?: unknown }).reason === "string";
  if (!sheets.every(isSheet) || !skipped.every(isSkip)) return null;
  return {
    sheets,
    skipped: skipped.map((row) => ({ ...row, reference: row.reference ?? null })),
  };
}

/** What a consolidate button returns: the result to show, or the refusal. */
export type ConsolidateState = { error?: string; result?: ConsolidateResult };

/** A sheet's money row (bill_payments or advance_recoveries), grouped back into the one payment it was. */
export type SheetMoneyRow = {
  id: string;
  entry: string;
  amount: number;
  on: string;
  reference: string;
  reversesId: string | null;
  reason: string | null;
  by: string | null;
};

export type SheetMoneyEntry = {
  entry: string;
  amount: number;
  on: string;
  reference: string;
  reversal: boolean;
  /** Reversed already: a whole entry is reversed at once, so one of its rows says so. */
  reversed: boolean;
  reason: string | null;
  by: string | null;
  bills: number;
};

export function groupSheetMoney(rows: SheetMoneyRow[]): SheetMoneyEntry[] {
  const reversedRows = new Set(rows.flatMap((row) => (row.reversesId ? [row.reversesId] : [])));
  const byEntry = new Map<string, SheetMoneyEntry>();
  for (const row of rows) {
    const found = byEntry.get(row.entry);
    if (found) {
      found.amount = roundPaise(found.amount + row.amount);
      found.bills += 1;
      found.reversed ||= reversedRows.has(row.id);
      continue;
    }
    byEntry.set(row.entry, {
      entry: row.entry,
      amount: roundPaise(row.amount),
      on: row.on,
      reference: row.reference,
      reversal: row.reversesId !== null,
      reversed: reversedRows.has(row.id),
      reason: row.reason,
      by: row.by,
      bills: 1,
    });
  }
  return [...byEntry.values()].sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : 0));
}
