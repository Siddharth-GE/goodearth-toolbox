"use server";

import { requireTool } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// Type-only import, and deliberately NOT re-exported — see the note in
// lib/purchase-orders/actions.ts: a bare `export type { X };` in a
// "use server" file crashes every action in its compiled chunk at load.
import type { ActionState } from "@/lib/action-state";

/**
 * Writes for Inventory. The real rules live in the database (migration
 * 0023: grn_lines_qty_guard, stock_issue_lines_qty_guard,
 * stock_adjustments_qty_guard, the two permanence guards and the PO
 * completion trigger) — these actions validate first so refusals arrive
 * as friendly messages, but a write that slips past the UI is still
 * stopped DB-side.
 */

/** The guards raise human-readable messages (written for exactly this).
 * Surface the known ones instead of a generic "try again". */
function guardError(error: { message: string }, fallback: string): ActionState {
  const message = error.message;
  if (
    message.includes("still to come") ||
    message.includes("is in that store") ||
    message.includes("ISSUED purchase order") ||
    message.includes("no longer exists") ||
    message.includes("permanent") ||
    message.includes("short code") ||
    message.includes("inactive") ||
    message.includes("where the goods went") ||
    message.includes("no site to deliver to") ||
    message.includes("one place") ||
    message.includes("different store") ||
    message.includes("Pick a store") ||
    message.includes("Pick the store") ||
    message.includes("Pick the project") ||
    message.includes("which work") ||
    message.includes("serves no work") ||
    message.includes("names it later")
  ) {
    return { error: message.replace(/^.*?:\s*/, "") };
  }
  return { error: fallback };
}

/* ------------------------------------------------------------------ *
 * Receiving goods against a purchase order
 * ------------------------------------------------------------------ */

export type ReceiveLineInput = {
  /** purchase_order_lines.id — the provenance anchor. */
  poLineId: string;
  quantity: number;
};

export type RecordReceiptInput = {
  poId: string;
  /** Exactly one of these two: a store, or straight to the PO's site. */
  storeId: string | null;
  toSite: boolean;
  /** The work a to-site delivery serves (0081); never sent for a store. */
  workItemId: string | null;
  challanNo: string | null;
  receivedAt: string | null;
  note: string | null;
  lines: ReceiveLineInput[];
};

/**
 * Records one delivery: mints the GRN, then writes its lines.
 *
 * The item and uom are re-read server-side from po_line_facts — the
 * client says only which line and how many. The over-receipt guard caps
 * each line at what was ordered across every receipt, so a race between
 * two store-keepers cannot book the same delivery twice, and the PO
 * completes itself once nothing is outstanding.
 */
export async function recordGoodsReceipt(input: RecordReceiptInput): Promise<ActionState> {
  const user = await requireTool("/inventory");

  if (!input.poId) return { error: "Pick a purchase order first." };
  if (input.lines.length === 0) return { error: "Enter what arrived on at least one line." };
  if (input.lines.some((line) => !Number.isFinite(line.quantity) || line.quantity <= 0)) {
    return { error: "Quantities must be more than 0." };
  }
  if ((input.storeId != null) === input.toSite) {
    return { error: "Choose where the goods went: a store, or the site." };
  }
  if (input.toSite && !input.workItemId) {
    return { error: "Say which work this delivery is for." };
  }

  const supabase = await createClient();

  // po_line_facts, not purchase_order_lines: a store-keeper holds
  // /inventory and usually not /purchase-orders, and this view is the
  // sanctioned money-free window (migration 0022).
  const { data: sources, error: sourcesError } = await supabase
    .from("po_line_facts")
    .select("id, po_id, item_id, uom")
    .eq("po_id", input.poId)
    .in(
      "id",
      input.lines.map((line) => line.poLineId),
    );
  if (sourcesError) {
    console.error("recordGoodsReceipt lookup failed:", sourcesError);
    return { error: "Could not record this delivery. Try again." };
  }

  // Every column of a view is typed nullable by the generator (a view
  // carries no NOT NULL metadata), so the rows are narrowed once here —
  // a line missing its anchor or item is dropped rather than inserted
  // with a hole in it.
  const byId = new Map(
    (sources ?? [])
      .filter(
        (source): source is typeof source & { id: string; item_id: string; uom: string } =>
          source.id != null && source.item_id != null && source.uom != null,
      )
      .map((source) => [source.id, source]),
  );
  const usable = input.lines.filter((line) => byId.has(line.poLineId));
  if (usable.length === 0) {
    return { error: "Those lines are not on this purchase order any more. Reload and try again." };
  }

  const { data: receiptId, error } = await supabase.rpc("create_goods_receipt", {
    p_po_id: input.poId,
    p_store_id: (input.storeId || null) as unknown as string,
    p_to_site: input.toSite,
    // Named args pick the 7-arg signature; the 0081 wrapper keeps the
    // old one alive for code deployed before the migration.
    p_work_item_id: (input.toSite ? input.workItemId : null) as unknown as string,
    p_challan_no: (input.challanNo?.trim() || null) as unknown as string,
    p_received_at: (input.receivedAt || null) as unknown as string,
    p_note: (input.note?.trim() || null) as unknown as string,
  });
  if (error) {
    console.error("create_goods_receipt failed:", error);
    return guardError(error, "Could not record this delivery. Try again.");
  }
  if (!receiptId) return { error: "Could not record this delivery. Try again." };

  // One line at a time, deliberately: the over-receipt guard raises per
  // line with the figure still to come, and a batch insert would fail
  // wholesale on the first refusal — losing the lines that were fine.
  //
  // The cost of that choice: a refusal part-way leaves a delivery note
  // holding fewer lines than arrived, and there is no way to add lines
  // to a receipt afterwards. Recording a SECOND receipt against the same
  // PO for the rest is the recovery, and the over-receipt guard makes it
  // safe — so that is what the message below must say.
  let added = 0;
  for (const line of usable) {
    const source = byId.get(line.poLineId)!;
    const { error: lineError } = await supabase.from("goods_receipt_lines").insert({
      receipt_id: receiptId,
      po_line_id: source.id,
      item_id: source.item_id,
      quantity: line.quantity,
      uom: source.uom,
      created_by: user.id,
      updated_by: user.id,
    });
    if (lineError) {
      console.error("recordGoodsReceipt line insert failed:", lineError);
      revalidatePath("/inventory", "layout");
      const friendly = guardError(lineError, "A line was refused.");
      return {
        error:
          added > 0
            ? `Recorded ${added} ${added === 1 ? "line" : "lines"}, then stopped: ${friendly?.error ?? "a line was refused."} Those ${added} are saved on this delivery note and can't be changed — record a second delivery against the same order for whatever else arrived.`
            : `${friendly?.error ?? "A line was refused."} Nothing was recorded against this delivery note.`,
      };
    }
    added++;
  }

  revalidatePath("/inventory", "layout");
  revalidatePath("/inventory/stock");
  revalidatePath(`/purchase-orders/${input.poId}`);
  redirect(`/inventory/receipts/${receiptId}`);
}

/* ------------------------------------------------------------------ *
 * Issuing material out of a store
 * ------------------------------------------------------------------ */

export type IssueLineInput = {
  itemId: string;
  quantity: number;
  uom: string;
};

export type RecordIssueInput = {
  storeId: string;
  /** Exactly one: another store (a transfer) or a plot (used at site). */
  toStoreId: string | null;
  plotId: string | null;
  /** The work the material serves (0080) — required for a plot issue,
   * never sent for a transfer. */
  workItemId: string | null;
  /** Only consulted for a transfer out of a store with no project. */
  projectId: string | null;
  issuedAt: string | null;
  note: string | null;
  lines: IssueLineInput[];
  /** When this issue answers a supervisor's request (Step H), the
   * request to stamp fulfilled once the issue is recorded. */
  requestId?: string | null;
};

/**
 * Records material leaving a store. The negative-stock guard refuses
 * any line that would take the store below zero, checked under an
 * advisory lock so two people issuing the same material at once cannot
 * both succeed against the same balance.
 */
export async function recordStockIssue(input: RecordIssueInput): Promise<ActionState> {
  const user = await requireTool("/inventory");

  if (!input.storeId) return { error: "Pick the store the goods are leaving." };
  if ((input.toStoreId != null) === (input.plotId != null)) {
    return { error: "Send this to one place: another store, or a plot." };
  }
  if (input.toStoreId && input.toStoreId === input.storeId) {
    return { error: "A transfer needs a different store to go to." };
  }
  if (input.plotId && !input.workItemId) {
    return { error: "Say which work this material is for." };
  }
  if (input.lines.length === 0) return { error: "Add at least one item." };
  if (input.lines.some((line) => !Number.isFinite(line.quantity) || line.quantity <= 0)) {
    return { error: "Quantities must be more than 0." };
  }
  const itemIds = new Set(input.lines.map((line) => line.itemId));
  if (itemIds.size !== input.lines.length) {
    return { error: "The same item appears twice — combine those into one line." };
  }

  const supabase = await createClient();

  const { data: issueId, error } = await supabase.rpc("create_stock_issue", {
    p_store_id: input.storeId,
    p_to_store_id: (input.toStoreId || null) as unknown as string,
    p_plot_id: (input.plotId || null) as unknown as string,
    // Named args pick the 7-arg signature; the 0080 wrapper keeps the
    // old 6-arg one alive for code deployed before the migration.
    p_work_item_id: (input.plotId ? input.workItemId : null) as unknown as string,
    p_project_id: (input.projectId || null) as unknown as string,
    p_issued_at: (input.issuedAt || null) as unknown as string,
    p_note: (input.note?.trim() || null) as unknown as string,
  });
  if (error) {
    console.error("create_stock_issue failed:", error);
    return guardError(error, "Could not record this issue. Try again.");
  }
  if (!issueId) return { error: "Could not record this issue. Try again." };

  // One at a time, same reason as a goods receipt: the negative-stock
  // guard raises per line with the quantity actually in the store. Same
  // cost too — a refusal part-way leaves an issue note short, lines
  // can't be added to it afterwards, and recording a second issue from
  // the same store is the recovery.
  let added = 0;
  for (const line of input.lines) {
    const { error: lineError } = await supabase.from("stock_issue_lines").insert({
      issue_id: issueId,
      item_id: line.itemId,
      quantity: line.quantity,
      uom: line.uom,
      created_by: user.id,
      updated_by: user.id,
    });
    if (lineError) {
      console.error("recordStockIssue line insert failed:", lineError);
      revalidatePath("/inventory/issues");
      const friendly = guardError(lineError, "A line was refused.");
      return {
        error:
          added > 0
            ? `Issued ${added} ${added === 1 ? "line" : "lines"}, then stopped: ${friendly?.error ?? "a line was refused."} Those ${added} have left the store and can't be changed — record a second issue for anything still to go.`
            : `${friendly?.error ?? "A line was refused."} Nothing was issued.`,
      };
    }
    added++;
  }

  // The issue is recorded either way; stamping the supervisor's request
  // fulfilled is best-effort on top. If it fails the request simply
  // stays in the queue — decline it there with "issued as …" rather
  // than lying to the store-keeper that the issue itself failed.
  // Writing issue_requests from here is the fifth documented cross-tool
  // write exception (STATUS.md); 0084's guard trigger only lets this
  // side move requested → fulfilled/declined.
  if (input.requestId) {
    const { error: stampError } = await supabase
      .from("issue_requests")
      .update({ status: "fulfilled", fulfilled_issue_id: issueId, updated_by: user.id })
      .eq("id", input.requestId)
      .eq("status", "requested");
    if (stampError) console.error("recordStockIssue: request stamp failed:", stampError);
    revalidatePath("/inventory/requests");
    revalidatePath("/supervisors", "layout");
  }

  revalidatePath("/inventory/issues");
  revalidatePath("/inventory/stock");
  redirect(`/inventory/issues/${issueId}`);
}

/* ------------------------------------------------------------------ *
 * Answering a supervisor's request without stock
 * ------------------------------------------------------------------ */

export async function declineSiteRequest(id: string, reason: string): Promise<ActionState> {
  const user = await requireTool("/inventory");
  if (!id) return { error: "Which request?" };
  const trimmed = reason.trim();
  if (!trimmed) return { error: "Say why — the supervisor sees this reason at site." };
  if (trimmed.length > 500) return { error: "Keep the reason under 500 characters." };

  const supabase = await createClient();
  const { error, count } = await supabase
    .from("issue_requests")
    .update(
      { status: "declined", declined_reason: trimmed, updated_by: user.id },
      { count: "exact" },
    )
    .eq("id", id)
    .eq("status", "requested");
  if (error) {
    if (error.code === "P0001") return { error: error.message };
    console.error("declineSiteRequest failed:", error);
    return { error: "Could not decline the request. Try again." };
  }
  if (!count) return { error: "This request has already been answered." };

  revalidatePath("/inventory/requests");
  revalidatePath("/supervisors", "layout");
  return undefined;
}

/* ------------------------------------------------------------------ *
 * Adjusting a count by hand
 * ------------------------------------------------------------------ */

export type RecordAdjustmentInput = {
  storeId: string;
  itemId: string;
  /** Signed: positive adds (opening stock, a found box), negative removes. */
  quantity: number;
  uom: string;
  reason: string;
  adjustedAt: string | null;
};

/**
 * The only way a balance changes without a movement behind it, which is
 * why the reason is mandatory both here and at the database. Opening
 * stock is simply a positive adjustment.
 */
export async function recordStockAdjustment(input: RecordAdjustmentInput): Promise<ActionState> {
  const user = await requireTool("/inventory");

  if (!input.storeId) return { error: "Pick a store." };
  if (!input.itemId) return { error: "Pick an item." };
  if (!Number.isFinite(input.quantity) || input.quantity === 0) {
    return { error: "Enter how much to add (or a minus figure to remove)." };
  }
  if (!input.reason.trim()) {
    return { error: "Say why this count is being changed — a reason is required." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("stock_adjustments").insert({
    store_id: input.storeId,
    item_id: input.itemId,
    quantity: input.quantity,
    uom: input.uom,
    reason: input.reason.trim(),
    adjusted_at: input.adjustedAt || undefined,
    created_by: user.id,
    updated_by: user.id,
  });
  if (error) {
    console.error("recordStockAdjustment failed:", error);
    return guardError(error, "Could not save that adjustment. Try again.");
  }

  revalidatePath("/inventory/adjustments");
  revalidatePath("/inventory/stock");
  return undefined;
}

/**
 * Retag which work a plot issue served (0080). A label fix, not a
 * movement: quantities, store, destination and number are untouched,
 * and audit_row() records the change. Transfers carry no work.
 */
export async function retagIssueWork(issueId: string, workItemId: string): Promise<ActionState> {
  const user = await requireTool("/inventory");
  if (!workItemId) return { error: "Pick the work." };

  const supabase = await createClient();
  const { data: issue, error: readError } = await supabase
    .from("stock_issues")
    .select("id, plot_id")
    .eq("id", issueId)
    .maybeSingle();
  if (readError) {
    console.error("retagIssueWork read failed:", readError);
    return { error: "Could not save. Try again." };
  }
  if (!issue) return { error: "That issue no longer exists." };
  if (!issue.plot_id) return { error: "A transfer between stores serves no work." };

  const { error } = await supabase
    .from("stock_issues")
    .update({ work_item_id: workItemId, updated_by: user.id })
    .eq("id", issueId);
  if (error) {
    console.error("retagIssueWork failed:", error);
    return guardError(error, "Could not save. Try again.");
  }

  revalidatePath("/inventory/issues");
  return undefined;
}
