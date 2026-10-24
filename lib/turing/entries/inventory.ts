/** Inventory: deliveries in, issues out, stock counts corrected, through Inventory's own saves. */
import { WORK_CLASSES, WORK_CLASS_LABEL } from "@/lib/masters/work-classes";

import type { Field, Value } from "../catalogue-fields";
import { defineEntries } from "./define";
import { roundQuantity } from "./purchase-orders";

/** The same line or item twice is one, its quantities added, as one row on the screen. */
export function totalled(
  lines: Record<string, Value>[],
  key: string,
): { id: string; quantity: number }[] {
  const totals = new Map<string, number>();
  for (const line of lines) {
    const id = String(line[key]);
    totals.set(id, roundQuantity((totals.get(id) ?? 0) + Number(line.quantity)));
  }
  return [...totals].map(([id, quantity]) => ({ id, quantity }));
}

const receipt: Field = {
  key: "receipt_id",
  label: "Delivery",
  kind: "id",
  table: "goods_receipts",
  record: true,
};
const issue: Field = {
  key: "issue_id",
  label: "Issue",
  kind: "id",
  table: "stock_issues",
  record: true,
};
const quantity: Field = { key: "quantity", label: "Quantity", kind: "amount" };
const reason: Field = { key: "reason", label: "Why", kind: "text" };
const workClass: Field = {
  key: "work_class",
  label: "Work class",
  kind: "choice",
  choices: WORK_CLASSES,
  labels: WORK_CLASS_LABEL,
};

export const INVENTORY = defineEntries([
  {
    key: "receipt_new",
    tool: "/inventory",
    title: "A delivery, received",
    description:
      "Records goods that arrived against an issued PO: one row per PO line (purchase_order_lines.id of that PO) with the quantity that came, in the line's unit — never more than is still to come. They went into a store, or straight to the PO's villa (to_site true, with the work they serve; a general PO's goods always go into a store). Challan, the supplier's invoice number and date, and the day received (today if left out) as on the delivery note.",
    adds: true,
    lines: { noun: "Delivery" },
    check: (v) =>
      Boolean(v.store_id) === (v.to_site === true)
        ? "Say where the goods went: a store, or straight to the site."
        : v.to_site === true && !v.work_item_id
          ? "A delivery straight to site says which work it is for."
          : undefined,
    fields: [
      { key: "po_id", label: "PO", kind: "id", table: "purchase_orders", header: true },
      {
        key: "store_id",
        label: "Into store",
        kind: "id",
        table: "stores",
        optional: true,
        header: true,
      },
      {
        key: "to_site",
        label: "Straight to site",
        kind: "yesno",
        optional: true,
        start: false,
        header: true,
      },
      {
        key: "work_item_id",
        label: "For the work",
        kind: "id",
        table: "work_items",
        optional: true,
        header: true,
      },
      { key: "challan_no", label: "Challan", kind: "text", optional: true, header: true },
      { key: "invoice_no", label: "Invoice", kind: "text", optional: true, header: true },
      { key: "invoice_date", label: "Invoice date", kind: "date", optional: true, header: true },
      { key: "received_at", label: "Received", kind: "date", optional: true, header: true },
      { key: "note", label: "Note", kind: "text", optional: true, header: true },
      {
        key: "po_line_id",
        label: "PO line",
        kind: "id",
        table: "purchase_order_lines",
      },
      quantity,
    ],
  },
  {
    key: "receipt_rate",
    tool: "/inventory",
    title: "A delivered line's rate",
    description:
      "Changes the rate and GST % a delivered line is valued at, when the supplier's bill differs from the PO (goods_receipt_lines.id); the PO's own figures stay beside it.",
    fields: [
      {
        key: "receipt_line_id",
        label: "Line",
        kind: "id",
        table: "goods_receipt_lines",
        record: true,
      },
      { key: "rate", label: "Rate", kind: "amount", optional: true, keep: true },
      { key: "gst_pct", label: "GST %", kind: "amount", optional: true, keep: true },
      { key: "note", label: "Why", kind: "text", optional: true },
    ],
  },
  {
    key: "issue_new",
    tool: "/inventory",
    title: "Stock, issued",
    description:
      "Takes stock out of a store: to a villa (plot_id, with the work it serves and its work class) or to another store (to_store_id, a transfer). One row per item the store holds, in the item's Masters unit, never more than it holds; the oldest batch goes first. project_id is needed only for a transfer out of a store with no project. The day issued is today if left out.",
    adds: true,
    lines: { noun: "Issue" },
    check: (v) =>
      Boolean(v.to_store_id) === Boolean(v.plot_id)
        ? "Send it to one place: another store, or a villa."
        : v.plot_id && !v.work_item_id
          ? "An issue to a villa says which work it is for."
          : undefined,
    fields: [
      { key: "store_id", label: "From store", kind: "id", table: "stores", header: true },
      {
        key: "plot_id",
        label: "To villa",
        kind: "id",
        table: "plots",
        optional: true,
        header: true,
      },
      {
        key: "to_store_id",
        label: "To store",
        kind: "id",
        table: "stores",
        optional: true,
        header: true,
      },
      {
        key: "work_item_id",
        label: "For the work",
        kind: "id",
        table: "work_items",
        optional: true,
        header: true,
      },
      { ...workClass, optional: true, start: "standard", header: true },
      {
        key: "project_id",
        label: "Project",
        kind: "id",
        table: "projects",
        optional: true,
        header: true,
      },
      { key: "issued_at", label: "Issued", kind: "date", optional: true, header: true },
      { key: "note", label: "Note", kind: "text", optional: true, header: true },
      { key: "item_id", label: "Item", kind: "id", table: "items" },
      quantity,
    ],
  },
  {
    key: "adjustment_new",
    tool: "/inventory",
    title: "A stock count, corrected",
    description:
      "Corrects a store's count of an item with a reason: a positive quantity adds, a negative one removes, in the item's Masters unit. The only change to stock without a movement, so the reason is required.",
    adds: true,
    fields: [
      { key: "store_id", label: "Store", kind: "id", table: "stores" },
      { key: "item_id", label: "Item", kind: "id", table: "items" },
      { ...quantity, signed: true },
      reason,
      { key: "adjusted_at", label: "On", kind: "date", optional: true },
    ],
  },
  {
    key: "issue_work_class",
    tool: "/inventory",
    title: "An issue's work class, corrected",
    description:
      "Corrects whether an issue to a villa was standard work, additional work or rework.",
    fields: [issue, workClass],
  },
  {
    key: "issue_work",
    tool: "/inventory",
    title: "An issue's work, corrected",
    description:
      "Corrects which work an issue to a villa served; quantities and numbers are untouched.",
    fields: [issue, { key: "work_item_id", label: "Work", kind: "id", table: "work_items" }],
  },
  {
    key: "receipt_delete",
    tool: "/inventory",
    title: "A delivery, deleted",
    description:
      "Deletes a delivery recorded by mistake, with the reason. Refused once anything has drawn on it, a bill counts it, or the site has confirmed it.",
    fields: [receipt, reason],
  },
  {
    key: "issue_delete",
    tool: "/inventory",
    title: "An issue, deleted",
    description:
      "Deletes an issue recorded by mistake, with the reason; the stock returns. Refused once the site has confirmed it or a transfer's material has moved on.",
    fields: [issue, reason],
  },
  {
    key: "site_request_decline",
    tool: "/inventory",
    title: "A site's request, declined",
    description:
      "Declines a supervisor's request for material (issue_requests, status requested), with the reason the supervisor sees at site.",
    fields: [
      { key: "request_id", label: "Request", kind: "id", table: "issue_requests", record: true },
      reason,
    ],
  },
]);
