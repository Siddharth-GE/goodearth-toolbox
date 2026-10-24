import "server-only";

import {
  declineSiteRequest,
  deleteGoodsReceipt,
  deleteStockIssue,
  recordGoodsReceipt,
  recordStockAdjustment,
  recordStockIssue,
  retagIssueWork,
  setIssueWorkClass,
  updateReceiptLineRate,
} from "@/lib/inventory/actions";

import type { INVENTORY } from "../entries/inventory";
import { idFrom } from "../redirects";
import { given, recordNow, saving, type RunResult, type Runners, type Values } from "./kit";

type Key = (typeof INVENTORY)[number]["key"];

const text = (values: Values, key: string) =>
  typeof values[key] === "string" && values[key] ? String(values[key]) : null;

/** A delivery's or issue's number, for the result line. */
async function referenceOf(table: "goods_receipts" | "stock_issues", id: string): Promise<string> {
  const now = await recordNow(table, { column: "id", id }, ["reference"], null);
  return "row" in now && now.row.reference ? String(now.row.reference) : "it";
}

/** The same line or item twice is one, its quantities added, as one row on the screen. */
function totalled(lines: Values[], key: string): { id: string; quantity: number }[] {
  const totals = new Map<string, number>();
  for (const line of lines) {
    const id = String(line[key]);
    totals.set(id, (totals.get(id) ?? 0) + Number(line.quantity));
  }
  return [...totals].map(([id, quantity]) => ({ id, quantity }));
}

/** A save that ends on the record it made: its number, or the tool's refusal. */
async function made(
  table: "goods_receipts" | "stock_issues",
  prefix: string,
  call: () => ReturnType<typeof recordGoodsReceipt>,
): Promise<RunResult> {
  const done = await saving(call, prefix);
  if ("error" in done) return done;
  const id = idFrom(done.path, prefix);
  return id ? { saved: await referenceOf(table, id) } : undefined;
}

export const INVENTORY_RUNNERS: Runners<Key> = {
  receipt_new: {
    lines: (header, lines) =>
      made("goods_receipts", "/inventory/receipts/", () =>
        recordGoodsReceipt({
          poId: String(header.po_id),
          storeId: header.to_site === true ? null : text(header, "store_id"),
          toSite: header.to_site === true,
          workItemId: header.to_site === true ? text(header, "work_item_id") : null,
          challanNo: text(header, "challan_no"),
          invoiceNo: text(header, "invoice_no"),
          invoiceDate: text(header, "invoice_date"),
          receivedAt: text(header, "received_at"),
          note: text(header, "note"),
          lines: totalled(lines, "po_line_id").map(({ id, quantity }) => ({
            poLineId: id,
            quantity,
          })),
        }),
      ),
  },
  receipt_rate: async (v) => {
    const now = await recordNow(
      "goods_receipt_line_rates",
      { column: "receipt_line_id", id: String(v.receipt_line_id) },
      ["rate", "gst_pct", "note"],
      "That line has no rate to change.",
    );
    if ("error" in now) return now;
    const row = now.row as { rate: number | null; gst_pct: number | null; note: string | null };
    return updateReceiptLineRate(String(v.receipt_line_id), {
      rate: Number(given(v, "rate", row.rate)),
      gstPct: Number(given(v, "gst_pct", row.gst_pct)),
      note: given(v, "note", row.note) || null,
    });
  },
  issue_new: {
    lines: (header, lines) =>
      made("stock_issues", "/inventory/issues/", () =>
        recordStockIssue({
          storeId: String(header.store_id),
          toStoreId: text(header, "to_store_id"),
          plotId: text(header, "plot_id"),
          workItemId: text(header, "plot_id") ? text(header, "work_item_id") : null,
          projectId: text(header, "project_id"),
          issuedAt: text(header, "issued_at"),
          note: text(header, "note"),
          workClass: text(header, "plot_id") ? text(header, "work_class") : null,
          lines: totalled(lines, "item_id").map(({ id, quantity }) => ({ itemId: id, quantity })),
        }),
      ),
  },
  adjustment_new: (v) =>
    recordStockAdjustment({
      storeId: String(v.store_id),
      itemId: String(v.item_id),
      quantity: Number(v.quantity),
      reason: String(v.reason),
      adjustedAt: text(v, "adjusted_at"),
    }),
  issue_work_class: (v) => setIssueWorkClass(String(v.issue_id), String(v.work_class)),
  issue_work: (v) => retagIssueWork(String(v.issue_id), String(v.work_item_id)),
  receipt_delete: async (v) => {
    const done = await saving(
      () => deleteGoodsReceipt(String(v.receipt_id), String(v.reason)),
      "/inventory/receive",
    );
    return "error" in done ? done : undefined;
  },
  issue_delete: async (v) => {
    const done = await saving(
      () => deleteStockIssue(String(v.issue_id), String(v.reason)),
      "/inventory/issues",
    );
    return "error" in done ? done : undefined;
  },
  site_request_decline: (v) => declineSiteRequest(String(v.request_id), String(v.reason)),
};
