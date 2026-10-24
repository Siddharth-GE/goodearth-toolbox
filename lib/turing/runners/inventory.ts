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
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";

import { totalled, type INVENTORY } from "../entries/inventory";
import { roundQuantity } from "../entries/purchase-orders";
import { idFrom } from "../redirects";
import {
  failed,
  given,
  recordNow,
  retired,
  saving,
  type RunResult,
  type Runners,
  type Values,
} from "./kit";

type Key = (typeof INVENTORY)[number]["key"];
type Refusal = { error: string } | null;
type Pick = { id: string; quantity: number };

const text = (values: Values, key: string) =>
  typeof values[key] === "string" && values[key] ? String(values[key]) : null;

/** A delivery's or issue's number, for the result line. */
async function referenceOf(table: "goods_receipts" | "stock_issues", id: string): Promise<string> {
  const now = await recordNow(table, { column: "id", id }, ["reference"], null);
  return "row" in now && now.row.reference ? String(now.row.reference) : "it";
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

const aboveZero = (picks: Pick[]): Refusal =>
  picks.some((pick) => !(pick.quantity > 0)) ? { error: "Quantities must be more than 0." } : null;

/**
 * A delivery the receive screen would send: against an issued PO, every line on it, each no more
 * than is still to come — checked before the delivery note is made, so a refusal leaves none behind.
 * (The save itself skips a line not on the PO without a word.)
 */
async function receiptRefused(poId: string, picks: Pick[], toSite: boolean): Promise<Refusal> {
  const refused = aboveZero(picks);
  if (refused) return refused;
  const po = await recordNow(
    "purchase_orders",
    { column: "id", id: poId },
    ["status", "plot_id", "unit_id"],
    "That PO is gone.",
  );
  if ("error" in po) return po;
  if (po.row.status !== "issued") return { error: "Goods are received only against an issued PO." };
  if (toSite && !po.row.plot_id && !po.row.unit_id) {
    return { error: "That PO is a general one: its goods go into a store, not to a villa." };
  }

  const supabase = await createClient();
  const ids = picks.map((pick) => pick.id);
  let lines;
  let received;
  try {
    [lines, received] = await Promise.all([
      fetchAll((from, to) =>
        supabase
          .from("purchase_order_lines")
          .select("id, quantity")
          .eq("po_id", poId)
          .in("id", ids)
          .order("id")
          .range(from, to),
      ),
      fetchAll((from, to) =>
        supabase
          .from("goods_receipt_lines")
          .select("id, po_line_id, quantity")
          .in("po_line_id", ids)
          .order("id")
          .range(from, to),
      ),
    ]);
  } catch (error) {
    return failed("purchase_order_lines", error);
  }
  const ordered = new Map(lines.map((line) => [line.id, line.quantity]));
  const came = new Map<string, number>();
  for (const line of received) {
    came.set(line.po_line_id, (came.get(line.po_line_id) ?? 0) + line.quantity);
  }
  for (const pick of picks) {
    const quantity = ordered.get(pick.id);
    if (quantity === undefined) return { error: "A line is not on that PO." };
    const left = Math.max(0, roundQuantity(quantity - (came.get(pick.id) ?? 0)));
    if (pick.quantity > left) {
      return {
        error:
          left > 0
            ? `A line has ${left} still to come, not ${pick.quantity}.`
            : "A line has already all come.",
      };
    }
  }
  return null;
}

/** An issue the screen would send: only what the store holds, each no more than it holds. */
async function stockShort(storeId: string, picks: Pick[]): Promise<Refusal> {
  const refused = aboveZero(picks);
  if (refused) return refused;
  const supabase = await createClient();
  let held;
  try {
    held = await fetchAll((from, to) =>
      supabase
        .from("stock_on_hand")
        .select("item_id, quantity")
        .eq("store_id", storeId)
        .in(
          "item_id",
          picks.map((pick) => pick.id),
        )
        .order("item_id")
        .range(from, to),
    );
  } catch (error) {
    return failed("stock_on_hand", error);
  }
  const onHand = new Map(held.map((row) => [row.item_id, row.quantity ?? 0]));
  for (const pick of picks) {
    const has = roundQuantity(onHand.get(pick.id) ?? 0);
    if (pick.quantity > has) {
      return {
        error:
          has > 0
            ? `That store holds ${has} of an item, not ${pick.quantity}.`
            : "That store holds none of an item.",
      };
    }
  }
  return null;
}

export const INVENTORY_RUNNERS: Runners<Key> = {
  receipt_new: {
    lines: async (header, lines) => {
      const toSite = header.to_site === true;
      const poId = String(header.po_id);
      const picks = totalled(lines, "po_line_id");
      const storeId = toSite ? null : text(header, "store_id");
      const workItemId = toSite ? text(header, "work_item_id") : null;
      const refused =
        (await retired("stores", storeId)) ??
        (await retired("work_items", workItemId)) ??
        (await receiptRefused(poId, picks, toSite));
      if (refused) return refused;
      return made("goods_receipts", "/inventory/receipts/", () =>
        recordGoodsReceipt({
          poId,
          storeId,
          toSite,
          workItemId,
          challanNo: text(header, "challan_no"),
          invoiceNo: text(header, "invoice_no"),
          invoiceDate: text(header, "invoice_date"),
          receivedAt: text(header, "received_at"),
          note: text(header, "note"),
          lines: picks.map(({ id, quantity }) => ({ poLineId: id, quantity })),
        }),
      );
    },
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
    lines: async (header, lines) => {
      const storeId = String(header.store_id);
      const plotId = text(header, "plot_id");
      const workItemId = plotId ? text(header, "work_item_id") : null;
      const picks = totalled(lines, "item_id");
      const store = await recordNow(
        "stores",
        { column: "id", id: storeId },
        ["is_active", "project_id"],
        "That store is gone.",
      );
      if ("error" in store) return store;
      if (store.row.is_active === false) return { error: "That store is retired in Masters." };
      // The screen asks for a project only on a transfer out of a store tied to none.
      const needsProject = !plotId && !store.row.project_id;
      if (needsProject && !text(header, "project_id")) {
        return { error: "That store is tied to no project, so a transfer from it names one." };
      }
      const refused =
        (await retired("stores", text(header, "to_store_id"))) ??
        (await retired("work_items", workItemId)) ??
        (await stockShort(storeId, picks));
      if (refused) return refused;
      return made("stock_issues", "/inventory/issues/", () =>
        recordStockIssue({
          storeId,
          toStoreId: text(header, "to_store_id"),
          plotId,
          workItemId,
          projectId: needsProject ? text(header, "project_id") : null,
          issuedAt: text(header, "issued_at"),
          note: text(header, "note"),
          workClass: plotId ? text(header, "work_class") : null,
          lines: picks.map(({ id, quantity }) => ({ itemId: id, quantity })),
        }),
      );
    },
  },
  adjustment_new: async (v) => {
    const refused = await retired("stores", String(v.store_id));
    if (refused) return refused;
    return recordStockAdjustment({
      storeId: String(v.store_id),
      itemId: String(v.item_id),
      quantity: Number(v.quantity),
      reason: String(v.reason),
      adjustedAt: text(v, "adjusted_at"),
    });
  },
  issue_work_class: (v) => setIssueWorkClass(String(v.issue_id), String(v.work_class)),
  issue_work: async (v) => {
    const refused = await retired("work_items", String(v.work_item_id));
    return refused ?? retagIssueWork(String(v.issue_id), String(v.work_item_id));
  },
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
