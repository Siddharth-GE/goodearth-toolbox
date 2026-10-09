/**
 * A bill's lines (0106, plan.md B7) — pure, no database.
 *
 * A line is a material from the bill's PO, daily wages by trade (nmr),
 * piece-work by quantity (pw_qty) or as a lump sum (pw_lump), or anything
 * else (other). Its money is the shared line formula (lib/line-money.ts):
 * quantity × rate − discount, GST on that, other charges after tax; a
 * lump sum's rate is its amount. The database rewrites the bill's header
 * from its lines (bill_lines_roll_up), and lib/bills/math.ts rolls them
 * up the same way for the screen.
 *
 * Here: what is wrong with a line in words, and the lines a bill starts
 * with — the PO's materials still to bill, or a work order's works.
 */

import type { BillLineMoney } from "./math";

export const BILL_LINE_KINDS = ["material", "nmr", "pw_qty", "pw_lump", "other"] as const;
export type BillLineKind = (typeof BILL_LINE_KINDS)[number];

export type BillLineDraft = {
  kind: BillLineKind;
  poLineId: string | null;
  itemId: string | null;
  labourLogId: string | null;
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
};

export const lineMoneyOf = (line: BillLineDraft): BillLineMoney => ({
  quantity: line.kind === "pw_lump" ? null : line.quantity,
  rate: line.rate,
  gst_pct: line.gstPct,
  discount_amount: line.discountAmount,
  other_charges: line.otherCharges,
});

const paisa = (value: number) => Math.round(value * 100) / 100;

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

/** What stops a bill's lines being saved, in words — or undefined. */
export function billLinesProblem(lines: BillLineDraft[]): string | undefined {
  if (lines.length === 0) return "A bill needs at least one line.";
  for (const line of lines) {
    const problem = billLineProblem(line);
    if (problem) return problem;
  }
  return undefined;
}

/** A PO line as po_line_billing_facts gives it, with the material's name. */
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

/** Received but not yet billed — what a new material bill offers. */
export const leftToBill = (line: PoLineForBill) =>
  Math.max(0, Math.round((line.received - line.billed) * 1e6) / 1e6);

/**
 * A material bill's starting lines: every PO line with something received
 * and not yet billed, at that quantity, with the PO's rate and GST. A
 * percentage discount becomes rupees on the quantity billed; a rupee
 * discount and other charges are shared out by the quantity billed of
 * the quantity ordered. Every figure is editable to match the invoice.
 */
export function linesFromPo(poLines: PoLineForBill[]): BillLineDraft[] {
  return poLines
    .filter((line) => leftToBill(line) > 0)
    .map((line) => {
      const quantity = leftToBill(line);
      const share = line.ordered > 0 ? quantity / line.ordered : 0;
      const rate = line.rate;
      const discount =
        line.discount_pct != null && rate !== null
          ? paisa((quantity * rate * line.discount_pct) / 100)
          : line.discount_amount != null
            ? paisa(line.discount_amount * share)
            : null;
      return {
        kind: "material" as const,
        poLineId: line.po_line_id,
        itemId: line.item_id,
        labourLogId: null,
        workItemId: null,
        description: line.item_code ? `${line.item_name} (${line.item_code})` : line.item_name,
        uom: line.uom,
        quantity,
        rate,
        gstPct: line.gst_pct ?? 0,
        discountAmount: discount || null,
        otherCharges: line.other_charges ? paisa(line.other_charges * share) : null,
        note: null,
      };
    });
}

/** A work order's work, as a bill against it starts from it. */
export type WorkOrderLineForBill = {
  work_item_id: string | null;
  description: string;
  is_lump_sum: boolean;
  uom: string | null;
  rate: number;
};

/**
 * A bill against a work order starts from its works: a measured work at
 * its rate with the quantity left for the billing team to enter, a lump
 * sum at its full amount to cut to the stage being billed.
 */
export function linesFromWorkOrder(workLines: WorkOrderLineForBill[]): BillLineDraft[] {
  return workLines.map((line) => ({
    kind: line.is_lump_sum ? ("pw_lump" as const) : ("pw_qty" as const),
    poLineId: null,
    itemId: null,
    labourLogId: null,
    workItemId: line.work_item_id,
    description: line.description,
    uom: line.is_lump_sum ? null : line.uom,
    quantity: null,
    rate: line.rate,
    gstPct: 0,
    discountAmount: null,
    otherCharges: null,
    note: null,
  }));
}

export type DayRates = { mason: number | null; helper: number | null; other: number | null };

/** The trades a Send to Bill daily-wages bill writes (0106), by line description. */
const TRADE_BY_DESCRIPTION: Record<string, keyof DayRates> = {
  "Masons (man-days)": "mason",
  "Helpers (man-days)": "helper",
  "Other labour (man-days)": "other",
};

/** The day rates on a contractor's last daily-wages bill — what the next one suggests. */
export function dayRatesFromLines(lines: { description: string; rate: number }[]): DayRates {
  const rates: DayRates = { mason: null, helper: null, other: null };
  for (const line of lines) {
    const trade = TRADE_BY_DESCRIPTION[line.description];
    if (trade && rates[trade] === null) rates[trade] = line.rate;
  }
  return rates;
}
