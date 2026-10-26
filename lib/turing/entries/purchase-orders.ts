/** Purchase orders: bought from approved indents' lines, through Purchase Orders' own saves. */
import type { Field, Value } from "../catalogue-fields";
import { defineEntries } from "./define";

type Values = Record<string, Value>;
const priceOf = (values: Values, key: string) =>
  typeof values[key] === "string" && values[key] !== "" ? Number(values[key]) : null;

/** Quantities to six places, as Purchase Orders' left-to-buy is, so 0.1 + 0.2 is 0.3. */
export const roundQuantity = (quantity: number) => Math.round(quantity * 1e6) / 1e6;

export type PoolPick = {
  indentLineId: string;
  quantity: number;
  /** null: not given, so the pool add's own value stands (no rate; Masters' GST). */
  rate: number | null;
  gstPct: number | null;
};

/** A bulk PO's rows, one pick per indent line: quantities added, one rate and one GST % each. */
export function poolPicks(lines: Values[]): { picks: PoolPick[] } | { error: string } {
  const picks = new Map<string, PoolPick>();
  for (const line of lines) {
    const id = String(line.indent_line_id);
    const pick = picks.get(id) ?? { indentLineId: id, quantity: 0, rate: null, gstPct: null };
    pick.quantity = roundQuantity(pick.quantity + Number(line.quantity));
    for (const [key, field, label] of [
      ["rate", "rate", "rates"],
      ["gst_pct", "gstPct", "GST %s"],
    ] as const) {
      const price = priceOf(line, key);
      if (price === null) continue;
      if (pick[field] !== null && pick[field] !== price) {
        return {
          error: `One indent line is given two ${label}, ${pick[field]} and ${price}. Give it one.`,
        };
      }
      pick[field] = price;
    }
    picks.set(id, pick);
  }
  return { picks: [...picks.values()] };
}

/** A discount is a percentage or rupees: one given clears the other, as the screen's switch does. */
export function withDiscountSwitch(values: Values): { values: Values } | { error: string } {
  const pct = priceOf(values, "discount_pct") !== null;
  const rupees = priceOf(values, "discount_amount") !== null;
  if (pct && rupees) return { error: "A discount is a percentage or rupees, not both." };
  if (pct) return { values: { ...values, discount_amount: "" } };
  if (rupees) return { values: { ...values, discount_pct: "" } };
  return { values };
}

const po: Field = { key: "po_id", label: "PO", kind: "id", table: "purchase_orders", record: true };
const poLine: Field = {
  key: "line_id",
  label: "Line",
  kind: "id",
  table: "purchase_order_lines",
  record: true,
};
const indentLine: Field = {
  key: "indent_line_id",
  label: "Indent line",
  kind: "id",
  table: "indent_lines",
};
const quantity: Field = { key: "quantity", label: "Quantity", kind: "amount" };
const rate: Field = { key: "rate", label: "Rate", kind: "amount", optional: true };
const gst: Field = { key: "gst_pct", label: "GST %", kind: "amount", optional: true };

const PRICES =
  "Rate is per unit before GST, in rupees; GST % is one of the active gst_rates, and left out it takes the item's own from Masters where it has one. A rate may be left for later, but every line needs both before the PO can be issued.";

export const PURCHASE_ORDERS = defineEntries([
  {
    key: "po_from_indent",
    tool: "/purchase-orders",
    title: "POs from an indent",
    description: `Orders from one approved indent: one row per indent line to buy (indent_lines.id of that indent), each with its vendor; one draft PO is made per vendor, for the indent's villa, with the default terms. A quantity is at most what is left to buy on its line (its quantity less what live POs already order). ${PRICES}`,
    adds: true,
    lines: { noun: "Indent" },
    fields: [
      { key: "indent_id", label: "Indent", kind: "id", table: "indents", header: true },
      indentLine,
      { key: "vendor_id", label: "Vendor", kind: "id", table: "vendors" },
      quantity,
      rate,
      gst,
    ],
  },
  {
    key: "po_general",
    tool: "/purchase-orders",
    title: "A PO gathering several indents",
    description: `A bulk buy: one draft PO to one vendor, gathering lines from approved indents across the project's villas (a general PO, plot_id left out), or from one villa's own indents. One row per indent line; rows with the same header are one PO, made with the default terms. ${PRICES}`,
    adds: true,
    lines: { noun: "PO" },
    fields: [
      { key: "project_id", label: "Project", kind: "id", table: "projects", header: true },
      { key: "plot_id", label: "Villa", kind: "id", table: "plots", optional: true, header: true },
      { key: "vendor_id", label: "Vendor", kind: "id", table: "vendors", header: true },
      {
        key: "deliver_store_id",
        label: "Deliver to store",
        kind: "id",
        table: "stores",
        optional: true,
        header: true,
      },
      { key: "deliver_note", label: "Deliver to", kind: "text", optional: true, header: true },
      { key: "expected_by", label: "Expected by", kind: "date", optional: true, header: true },
      { key: "note", label: "Note", kind: "text", optional: true, header: true },
      indentLine,
      quantity,
      rate,
      gst,
    ],
  },
  {
    key: "po_change",
    tool: "/purchase-orders",
    title: "A draft PO, changed",
    description:
      "Changes a draft PO's vendor, delivery, expected date, terms or note. Its villa and number never change.",
    fields: [
      po,
      {
        key: "vendor_id",
        label: "Vendor",
        kind: "id",
        table: "vendors",
        optional: true,
        keep: true,
      },
      {
        key: "deliver_store_id",
        label: "Deliver to store",
        kind: "id",
        table: "stores",
        optional: true,
      },
      { key: "deliver_note", label: "Deliver to", kind: "text", optional: true },
      { key: "expected_by", label: "Expected by", kind: "date", optional: true },
      { key: "terms", label: "Terms", kind: "text", optional: true, max: 8000 },
      { key: "note", label: "Note", kind: "text", optional: true },
    ],
  },
  {
    key: "po_charges",
    tool: "/purchase-orders",
    title: "A draft PO's charges",
    description:
      "Freight, loading and the like on a draft PO: an amount in rupees above 0 with its GST % (one of the active gst_rates; new charges start at 18) and a note. An empty amount removes the charges.",
    fields: [
      po,
      { key: "amount", label: "Amount", kind: "amount", optional: true },
      { key: "gst_pct", label: "GST %", kind: "amount", optional: true },
      { key: "note", label: "What for", kind: "text", optional: true },
    ],
  },
  {
    key: "po_line_change",
    tool: "/purchase-orders",
    title: "A PO line, changed",
    description:
      "Changes a line on a draft PO (purchase_order_lines.id): quantity (not above what is left on its indent line), rate per unit before GST in rupees, GST % (one of the active gst_rates), a discount as a percentage OR in rupees (never both), other charges in rupees, note. Each field left out keeps what the line has now, so a line with no GST % keeps none; every line needs a rate and GST % before the PO can be issued.",
    fields: [
      poLine,
      { ...quantity, optional: true, keep: true },
      rate,
      gst,
      { key: "discount_pct", label: "Discount %", kind: "amount", optional: true },
      { key: "discount_amount", label: "Discount ₹", kind: "amount", optional: true },
      { key: "other_charges", label: "Other charges ₹", kind: "amount", optional: true },
      { key: "note", label: "Note", kind: "text", optional: true },
    ],
  },
  {
    key: "po_line_remove",
    tool: "/purchase-orders",
    title: "A PO line, removed",
    description: "Removes a line from a draft PO; its quantity goes back to be bought.",
    fields: [poLine],
  },
  {
    key: "po_issue",
    tool: "/purchase-orders",
    title: "A PO, issued",
    description:
      "Issues a draft PO to its vendor: it can no longer be edited. Refused while it has no lines or a line lacks a rate or GST %.",
    fields: [po],
  },
  {
    key: "po_delete",
    tool: "/purchase-orders",
    title: "A draft PO, deleted",
    description:
      "Deletes a draft PO; its number stays used and its quantities go back to be bought. An issued PO is cancelled by asking (po_cancel_request) instead.",
    fields: [po],
  },
  {
    key: "po_cancel_request",
    tool: "/purchase-orders",
    title: "A PO's cancellation, asked for",
    description:
      "Asks for an issued PO to be cancelled, with the reason; an admin's yes (po_cancel_approve) cancels it.",
    fields: [po, { key: "reason", label: "Why", kind: "text" }],
  },
  {
    key: "po_cancel_withdraw",
    tool: "/purchase-orders",
    title: "A PO's cancellation, withdrawn or refused",
    description:
      "Withdraws a request to cancel a PO, or refuses someone else's; it reads as issued again.",
    fields: [po],
  },
  {
    key: "po_cancel_approve",
    tool: "/purchase-orders",
    title: "A PO's cancellation, approved",
    description:
      "Says yes to a request to cancel a PO (purchase_orders.status deletion_requested; its deletion_note says why): the PO is cancelled for good, its lines go back to be bought, and its number stays used. Refused once goods were received against it.",
    fields: [po],
  },
]);
