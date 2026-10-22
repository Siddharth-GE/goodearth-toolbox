"use server";

import { requireTool } from "@/lib/auth/access";
import { guardError } from "@/lib/db-error";
import { createClient } from "@/lib/supabase/server";
import { WORK_CLASS_LABEL, workClassOf } from "@/lib/masters/work-classes";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// Type-only import, not re-exported: a re-export in a "use server" file crashes every action at load.
import type { ActionState } from "@/lib/action-state";

/** Rules live in the database (0023 guards); actions validate first so refusals read as friendly messages. */

/** Surface the guards' own readable messages instead of a generic "try again". */
const INVENTORY_GUARD_PHRASES = [
  "still to come",
  "is in that store",
  "ISSUED purchase order",
  "no longer exists",
  "permanent",
  "short code",
  "inactive",
  "where the goods went",
  "no site to deliver to",
  "one place",
  "different store",
  "Pick a store",
  "Pick the store",
  "Pick the project",
  "which work",
  "serves no work",
  "names it later",
] as const;

export type ReceiveLineInput = {
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
  /** The supplier's invoice, as it came with the goods; the bill offers it (0132). */
  invoiceNo: string | null;
  invoiceDate: string | null;
  receivedAt: string | null;
  note: string | null;
  lines: ReceiveLineInput[];
};

/** Item and uom come from po_line_facts, not the client. The over-receipt guard caps each line
 * across every receipt, so a race cannot book one delivery twice. */
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

  // po_line_facts, not the gated table: a store-keeper may lack /purchase-orders (0022).
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

  // Views type every column nullable; narrow once, dropping lines missing an anchor or item.
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
    // Named args pick the 7-arg signature (0081).
    p_work_item_id: (input.toSite ? input.workItemId : null) as unknown as string,
    p_challan_no: (input.challanNo?.trim() || null) as unknown as string,
    p_received_at: (input.receivedAt || null) as unknown as string,
    p_note: (input.note?.trim() || null) as unknown as string,
  });
  if (error) {
    console.error("create_goods_receipt failed:", error);
    return guardError(error, "Could not record this delivery. Try again.", INVENTORY_GUARD_PHRASES);
  }
  if (!receiptId) return { error: "Could not record this delivery. Try again." };

  // One line at a time: the over-receipt guard raises per line, and a batch insert would fail wholesale.
  // A refusal part-way leaves a short note; recording a second receipt for the rest is the recovery.
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
      const friendly = guardError(lineError, "A line was refused.", INVENTORY_GUARD_PHRASES);
      return {
        error:
          added > 0
            ? `Recorded ${added} ${added === 1 ? "line" : "lines"}, then stopped: ${friendly?.error ?? "a line was refused."} Those ${added} are saved on this delivery note and can't be changed — record a second delivery against the same order for whatever else arrived.`
            : `${friendly?.error ?? "A line was refused."} Nothing was recorded against this delivery note.`,
      };
    }
    added++;
  }

  // create_goods_receipt predates the invoice (additive-only), so it rides a second write once the lines are in.
  const invoiceNo = input.invoiceNo?.trim() || null;
  if (invoiceNo || input.invoiceDate) {
    const { error: invoiceError } = await supabase
      .from("goods_receipts")
      .update({
        invoice_no: invoiceNo,
        invoice_date: input.invoiceDate || null,
        updated_by: user.id,
      })
      .eq("id", receiptId);
    if (invoiceError) {
      console.error("recordGoodsReceipt invoice failed:", invoiceError);
      revalidatePath("/inventory", "layout");
      revalidatePath(`/purchase-orders/${input.poId}`);
      return {
        error:
          "The delivery is recorded with all its lines, but its invoice number could not be saved — type it on the bill instead.",
      };
    }
  }

  revalidatePath("/inventory", "layout");
  revalidatePath(`/purchase-orders/${input.poId}`);
  redirect(`/inventory/receipts/${receiptId}`);
}

export type ReceiptRateInput = {
  rate: number;
  gstPct: number;
  note: string | null;
};

/** Changes a receipt line's rate when the bill differs from the PO. The PO's own figures
 * stay beside it, so accounts always see the difference. */
export async function updateReceiptLineRate(
  receiptLineId: string,
  input: ReceiptRateInput,
): Promise<ActionState> {
  const user = await requireTool("/inventory");

  if (!receiptLineId) return { error: "Which line?" };
  if (!Number.isFinite(input.rate) || input.rate < 0) {
    return { error: "Enter the rate as a number, 0 or more." };
  }
  if (!Number.isFinite(input.gstPct) || input.gstPct < 0 || input.gstPct > 100) {
    return { error: "GST is a percentage between 0 and 100." };
  }
  const note = input.note?.trim() || null;
  if (note && note.length > 500) return { error: "Keep the note under 500 characters." };

  const supabase = await createClient();
  const { error, count } = await supabase
    .from("goods_receipt_line_rates")
    .update(
      { rate: input.rate, gst_pct: input.gstPct, note, updated_by: user.id },
      { count: "exact" },
    )
    .eq("receipt_line_id", receiptLineId);
  if (error) {
    console.error("updateReceiptLineRate failed:", error);
    return guardError(error, "Could not save the rate. Try again.", INVENTORY_GUARD_PHRASES);
  }
  if (!count) return { error: "This line has no rate to change. Reload the page." };

  revalidatePath("/inventory", "layout");
  return undefined;
}

/** No unit is sent: lines are issued in the item's Masters unit, read on the server. */
export type IssueLineInput = {
  itemId: string;
  quantity: number;
  /** Batch to draw first (0108); null means oldest. The rest always comes oldest first. */
  preferredReceiptLineId?: string | null;
};

export type RecordIssueInput = {
  storeId: string;
  /** Exactly one: another store (a transfer) or a plot (used at site). */
  toStoreId: string | null;
  plotId: string | null;
  /** The work the material serves (0080); required for a plot issue, never for a transfer. */
  workItemId: string | null;
  /** Only consulted for a transfer out of a store with no project. */
  projectId: string | null;
  issuedAt: string | null;
  note: string | null;
  lines: IssueLineInput[];
  /** The supervisor's request to stamp fulfilled once the issue is recorded. */
  requestId?: string | null;
  /** Standard work, additional work or rework, for an issue to a plot (0132). */
  workClass?: string | null;
};

/** The negative-stock guard refuses any line taking a store below zero, under an advisory
 * lock so concurrent issues cannot both succeed. */
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
  const workClass = workClassOf(input.workClass);
  if (!workClass)
    return { error: "Say whether it is for standard work, additional work or rework." };
  if (input.lines.length === 0) return { error: "Add at least one item." };
  if (input.lines.some((line) => !Number.isFinite(line.quantity) || line.quantity <= 0)) {
    return { error: "Quantities must be more than 0." };
  }
  const itemIds = new Set(input.lines.map((line) => line.itemId));
  if (itemIds.size !== input.lines.length) {
    return { error: "The same item appears twice — combine those into one line." };
  }

  const supabase = await createClient();

  const { data: items, error: itemsError } = await supabase
    .from("items")
    .select("id, name, default_uom")
    .in("id", [...itemIds]);
  if (itemsError) {
    console.error("recordStockIssue item read failed:", itemsError);
    return { error: "Could not record this issue. Try again." };
  }
  const uomByItem = new Map((items ?? []).map((item) => [item.id, item.default_uom]));
  const unitless = (items ?? []).find((item) => !item.default_uom);
  if (unitless) return { error: `${unitless.name} has no unit in Masters. Set one there first.` };
  if (uomByItem.size !== itemIds.size) return { error: "An item on this issue no longer exists." };

  // A chosen batch must still be in this store; refuse a stale one rather than skip it silently.
  const chosen = input.lines.filter((line) => line.preferredReceiptLineId);
  if (chosen.length > 0) {
    const { data: held, error: heldError } = await supabase
      .from("batch_on_hand")
      .select("receipt_line_id, item_id")
      .eq("store_id", input.storeId)
      .gt("quantity", 0)
      .in(
        "receipt_line_id",
        chosen.map((line) => line.preferredReceiptLineId as string),
      );
    if (heldError) {
      console.error("recordStockIssue batch read failed:", heldError);
      return { error: "Could not record this issue. Try again." };
    }
    const heldFor = new Map((held ?? []).map((row) => [row.receipt_line_id, row.item_id]));
    if (chosen.some((line) => heldFor.get(line.preferredReceiptLineId as string) !== line.itemId)) {
      return { error: "A batch you picked is no longer in this store. Reload and pick again." };
    }
  }

  const { data: issueId, error } = await supabase.rpc("create_stock_issue", {
    p_store_id: input.storeId,
    p_to_store_id: (input.toStoreId || null) as unknown as string,
    p_plot_id: (input.plotId || null) as unknown as string,
    // Named args pick the 7-arg signature (0080).
    p_work_item_id: (input.plotId ? input.workItemId : null) as unknown as string,
    p_project_id: (input.projectId || null) as unknown as string,
    p_issued_at: (input.issuedAt || null) as unknown as string,
    p_note: (input.note?.trim() || null) as unknown as string,
  });
  if (error) {
    console.error("create_stock_issue failed:", error);
    return guardError(error, "Could not record this issue. Try again.", INVENTORY_GUARD_PHRASES);
  }
  if (!issueId) return { error: "Could not record this issue. Try again." };

  // One at a time, as for receipts. A refusal part-way leaves a short note; a second issue is the recovery.
  let added = 0;
  for (const line of input.lines) {
    const { error: lineError } = await supabase.from("stock_issue_lines").insert({
      issue_id: issueId,
      item_id: line.itemId,
      quantity: line.quantity,
      uom: uomByItem.get(line.itemId) as string,
      preferred_receipt_line_id: line.preferredReceiptLineId || null,
      created_by: user.id,
      updated_by: user.id,
    });
    if (lineError) {
      console.error("recordStockIssue line insert failed:", lineError);
      revalidatePath("/inventory", "layout");
      const friendly = guardError(lineError, "A line was refused.", INVENTORY_GUARD_PHRASES);
      return {
        error:
          added > 0
            ? `Issued ${added} ${added === 1 ? "line" : "lines"}, then stopped: ${friendly?.error ?? "a line was refused."} Those ${added} have left the store and can't be changed — record a second issue for anything still to go.`
            : `${friendly?.error ?? "A line was refused."} Nothing was issued.`,
      };
    }
    added++;
  }

  // create_stock_issue predates the class (additive-only), so it rides a second write, as an indent's work does.
  let classMissed = false;
  if (input.plotId && workClass !== "standard") {
    const { error: classError } = await supabase
      .from("stock_issues")
      .update({ work_class: workClass, updated_by: user.id })
      .eq("id", issueId);
    if (classError) {
      console.error("recordStockIssue work class failed:", classError);
      classMissed = true;
    }
  }

  // Stamping the supervisor's request is best-effort: if it fails the request stays queued.
  // Cross-tool write exception (STATUS.md); the 0084 trigger only lets it move requested to fulfilled/declined.
  if (input.requestId) {
    const { error: stampError } = await supabase
      .from("issue_requests")
      .update({ status: "fulfilled", fulfilled_issue_id: issueId, updated_by: user.id })
      .eq("id", input.requestId)
      .eq("status", "requested");
    if (stampError) console.error("recordStockIssue: request stamp failed:", stampError);
    revalidatePath("/inventory", "layout");
    revalidatePath("/supervisors", "layout");
  }

  revalidatePath("/inventory", "layout");
  if (classMissed) {
    return {
      error: `The issue is recorded, but as standard work: saving it as ${WORK_CLASS_LABEL[workClass].toLowerCase()} failed. Ask an admin to correct it.`,
    };
  }
  redirect(`/inventory/issues/${issueId}`);
}

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

  revalidatePath("/inventory", "layout");
  revalidatePath("/supervisors", "layout");
  return undefined;
}

export type RecordAdjustmentInput = {
  storeId: string;
  itemId: string;
  /** Signed: positive adds, negative removes. */
  quantity: number;
  reason: string;
  adjustedAt: string | null;
};

/** The only way a balance changes without a movement, so the reason is mandatory here and in
 * the database. The unit is the item's Masters unit, so bags never mix with cft. */
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
  const { data: item, error: itemError } = await supabase
    .from("items")
    .select("default_uom")
    .eq("id", input.itemId)
    .maybeSingle();
  if (itemError) {
    console.error("recordStockAdjustment item read failed:", itemError);
    return { error: "Could not save that adjustment. Try again." };
  }
  if (!item?.default_uom)
    return { error: "This item has no unit in Masters. Set one there first." };

  const { error } = await supabase.from("stock_adjustments").insert({
    store_id: input.storeId,
    item_id: input.itemId,
    quantity: input.quantity,
    uom: item.default_uom,
    reason: input.reason.trim(),
    adjusted_at: input.adjustedAt || undefined,
    created_by: user.id,
    updated_by: user.id,
  });
  if (error) {
    console.error("recordStockAdjustment failed:", error);
    return guardError(error, "Could not save that adjustment. Try again.", INVENTORY_GUARD_PHRASES);
  }

  revalidatePath("/inventory", "layout");
  return undefined;
}

/** Retags the work a plot issue served (0080). A label fix: quantities and numbers are untouched. */
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
    return guardError(error, "Could not save. Try again.", INVENTORY_GUARD_PHRASES);
  }

  revalidatePath("/inventory", "layout");
  return undefined;
}
