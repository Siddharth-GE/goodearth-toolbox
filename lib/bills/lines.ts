// Pure, no database. Line money is the shared lib/line-money.ts formula (a lump sum's rate is its amount); the database rolls the header up (bill_lines_roll_up, 0106) and lib/bills/math.ts mirrors it.
// Kinds: a PO material, daily wages by trade (nmr), piece-work by quantity (pw_qty) or lump sum (pw_lump), other.

import type { BillLineMoney } from "./math";
import { roundPaise } from "@/lib/line-money";
import { NO_VILLA, type LineVilla } from "./villas";

export const BILL_LINE_KINDS = ["material", "nmr", "pw_qty", "pw_lump", "other"] as const;
export type BillLineKind = (typeof BILL_LINE_KINDS)[number];

export type BillLineDraft = {
  kind: BillLineKind;
  poLineId: string | null;
  itemId: string | null;
  labourLogId: string | null;
  /** The work order line (a stage) this bills (0136). */
  labourContractLineId: string | null;
  workItemId: string | null;
  description: string;
  uom: string | null;
  /** Null only for a lump sum. */
  quantity: number | null;
  rate: number | null;
  gstPct: number;
  discountAmount: number | null;
  otherCharges: number | null;
  note: string | null;
  /** The line's own villa on a contractor's labour bill (0166); none is the bill's. */
  villa: LineVilla;
};

export const lineMoneyOf = (line: BillLineDraft): BillLineMoney => ({
  quantity: line.kind === "pw_lump" ? null : line.quantity,
  rate: line.rate,
  gst_pct: line.gstPct,
  discount_amount: line.discountAmount,
  other_charges: line.otherCharges,
});

/** What is wrong with one line, in words — 0106's CHECKs, said first. */
export function billLineProblem(line: BillLineDraft): string | undefined {
  if (!line.description.trim()) return "Every line needs a description.";
  if (line.kind === "material" && !line.itemId) return "A material line must name its material.";
  if (line.rate === null || !Number.isFinite(line.rate) || line.rate < 0) {
    return line.kind === "pw_lump"
      ? "Enter the lump sum on every lump-sum line."
      : "Enter a rate on every line.";
  }
  if (line.kind !== "pw_lump") {
    if (line.quantity === null || !Number.isFinite(line.quantity) || line.quantity <= 0) {
      return "Enter a quantity above zero on every line.";
    }
  }
  if (!Number.isFinite(line.gstPct) || line.gstPct < 0 || line.gstPct > 100) {
    return "GST must be between 0% and 100%.";
  }
  if (line.discountAmount !== null) {
    if (!Number.isFinite(line.discountAmount) || line.discountAmount < 0) {
      return "A discount can't be negative.";
    }
    const gross = (line.kind === "pw_lump" ? 1 : (line.quantity ?? 0)) * line.rate;
    if (line.discountAmount > gross + 0.005) return "A discount is more than its line is worth.";
  }
  if (
    line.otherCharges !== null &&
    (!Number.isFinite(line.otherCharges) || line.otherCharges < 0)
  ) {
    return "Other charges can't be negative.";
  }
  return undefined;
}

/** A labour bill with no work order is PW when it is piece-work with no daily wages, else NMR (0164). */
export const isPieceWorkBill = (lines: BillLineDraft[]): boolean =>
  lines.some((line) => line.kind === "pw_qty" || line.kind === "pw_lump") &&
  !lines.some((line) => line.kind === "nmr");

export function billLinesProblem(lines: BillLineDraft[]): string | undefined {
  if (lines.length === 0) return "A bill needs at least one line.";
  for (const line of lines) {
    const problem = billLineProblem(line);
    if (problem) return problem;
  }
  return undefined;
}

export type PoLineForBill = {
  po_line_id: string;
  item_id: string;
  item_name: string;
  item_code: string | null;
  uom: string;
  ordered: number;
  received: number;
  billed: number;
  rate: number | null;
  gst_pct: number | null;
  discount_pct: number | null;
  discount_amount: number | null;
  other_charges: number | null;
};

export const leftToBill = (line: PoLineForBill) =>
  Math.max(0, Math.round((line.received - line.billed) * 1e6) / 1e6);

/** Every PO line with something received and not yet billed. A % discount becomes rupees on the quantity billed; a rupee discount and other charges are shared by billed over ordered. */
export function linesFromPo(poLines: PoLineForBill[]): BillLineDraft[] {
  return poLines
    .filter((line) => leftToBill(line) > 0)
    .map((line) => {
      const quantity = leftToBill(line);
      const share = line.ordered > 0 ? quantity / line.ordered : 0;
      const rate = line.rate;
      const discount =
        line.discount_pct != null && rate !== null
          ? roundPaise((quantity * rate * line.discount_pct) / 100)
          : line.discount_amount != null
            ? roundPaise(line.discount_amount * share)
            : null;
      return {
        kind: "material" as const,
        poLineId: line.po_line_id,
        itemId: line.item_id,
        labourLogId: null,
        labourContractLineId: null,
        workItemId: null,
        description: line.item_code ? `${line.item_name} (${line.item_code})` : line.item_name,
        uom: line.uom,
        quantity,
        rate,
        gstPct: line.gst_pct ?? 0,
        discountAmount: discount || null,
        otherCharges: line.other_charges ? roundPaise(line.other_charges * share) : null,
        note: null,
        villa: NO_VILLA,
      };
    });
}

export type WorkOrderLineForBill = {
  id: string;
  work_item_id: string | null;
  description: string;
  is_lump_sum: boolean;
  quantity: number | null;
  uom: string | null;
  rate: number;
  /** Billed against this line so far, before GST (work_order_line_billing_facts, 0136); null when a bill on the order names no stage. */
  billed: number | null;
};

/** What is left of a work order line: its value (quantity × rate, a lump sum its amount) less what is billed. */
export function leftOnWorkOrderLine(line: WorkOrderLineForBill): number | null {
  if (line.billed === null) return null;
  const value = roundPaise((line.is_lump_sum ? 1 : (line.quantity ?? 0)) * line.rate);
  return Math.max(0, roundPaise(value - line.billed));
}

/** Each line not yet fully billed, at what is left of it: a measured work as the quantity left at its rate, a lump sum
 * (a stage) as the amount left. Each names its line, so the bill pays that stage (0136). When what is billed is unknown,
 * every line comes with its quantity to enter and a lump sum at its full amount. Over-billing warns, never blocks. */
export function linesFromWorkOrder(workLines: WorkOrderLineForBill[]): BillLineDraft[] {
  return workLines
    .filter((line) => (leftOnWorkOrderLine(line) ?? 1) > 0)
    .map((line) => {
      const known = leftOnWorkOrderLine(line);
      const left = known ?? (line.is_lump_sum ? line.rate : 0);
      const measured = known !== null && !line.is_lump_sum && line.rate > 0;
      return {
        kind: line.is_lump_sum ? ("pw_lump" as const) : ("pw_qty" as const),
        poLineId: null,
        itemId: null,
        labourLogId: null,
        labourContractLineId: line.id,
        workItemId: line.work_item_id,
        description: line.description,
        uom: line.is_lump_sum ? null : line.uom,
        quantity: measured ? Math.round((left / line.rate) * 1000) / 1000 : null,
        rate: line.is_lump_sum ? left : line.rate,
        gstPct: 0,
        discountAmount: null,
        otherCharges: null,
        note: null,
        villa: NO_VILLA,
      };
    });
}

export type DayRates = { mason: number | null; helper: number | null; other: number | null };

const TRADE_BY_DESCRIPTION: Record<string, keyof DayRates> = {
  "Masons (man-days)": "mason",
  "Helpers (man-days)": "helper",
  "Other labour (man-days)": "other",
};

export function dayRatesFromLines(lines: { description: string; rate: number }[]): DayRates {
  const rates: DayRates = { mason: null, helper: null, other: null };
  for (const line of lines) {
    const trade = TRADE_BY_DESCRIPTION[line.description];
    if (trade && rates[trade] === null) rates[trade] = line.rate;
  }
  return rates;
}

/** The bill for one delivery: each PO line at what that delivery brought, never past what is left to bill. */
export function linesFromDelivery(
  poLines: PoLineForBill[],
  delivered: Record<string, number>,
): BillLineDraft[] {
  return linesFromPo(
    poLines.map((line) => {
      const brought = delivered[line.po_line_id] ?? 0;
      // Narrow what is left to this delivery's share; linesFromPo then prices it and drops a line at zero.
      const left = Math.min(leftToBill(line), brought);
      return { ...line, billed: line.received - left };
    }),
  );
}

/** Before anything is written: would these lines bill a PO line past what arrived (0156 refuses it in the database)?
 * `billedElsewhere` is each PO line's billed quantity on other bills. Names the first line over, by its description. */
export function receivedCapProblem(
  lines: Pick<BillLineDraft, "kind" | "poLineId" | "quantity" | "description">[],
  received: Map<string, number>,
  billedElsewhere: Map<string, number>,
): string | undefined {
  const wanted = new Map<string, { quantity: number; description: string }>();
  for (const line of lines) {
    if (line.kind !== "material" || !line.poLineId) continue;
    const entry = wanted.get(line.poLineId) ?? { quantity: 0, description: line.description };
    entry.quantity += line.quantity ?? 0;
    wanted.set(line.poLineId, entry);
  }
  for (const [poLineId, { quantity, description }] of wanted) {
    const left = (received.get(poLineId) ?? 0) - (billedElsewhere.get(poLineId) ?? 0);
    if (quantity > left + 0.0005) {
      return `Only ${Math.max(0, Math.round(left * 1000) / 1000)} of ${description.trim()} has arrived and is not yet billed — bill what was received.`;
    }
  }
  return undefined;
}
