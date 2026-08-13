"use server";

import { requireTool } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// Type-only import, and deliberately NOT re-exported — see the note in
// lib/budgets/actions.ts: a bare `export type { X };` in a "use server"
// file crashes every action in its compiled chunk at load time.
import type { ActionState } from "@/lib/action-state";

/**
 * Writes for Purchase Orders. The real rules live in the database
 * (purchase_orders_guard, po_lines_draft_only, po_lines_qty_guard,
 * migration 0021) — these actions validate first so refusals arrive as
 * friendly messages, but a write that slips past the UI is still
 * stopped DB-side.
 */

/** The guards raise human-readable messages (written for exactly this).
 * Surface the known ones instead of a generic "try again". */
function guardError(error: { message: string }, fallback: string): ActionState {
  const message = error.message;
  if (
    message.includes("draft") ||
    message.includes("permanent") ||
    message.includes("no longer be edited") ||
    message.includes("unordered") ||
    message.includes("APPROVED") ||
    message.includes("short code") ||
    message.includes("inactive") ||
    message.includes("not both") ||
    message.includes("before issuing") ||
    message.includes("rate and a GST") ||
    message.includes("no longer exists") ||
    message.includes("deletion request") ||
    message.includes("admin can approve") ||
    message.includes("receiving its goods") ||
    // Migration 0023: an issued PO whose goods are already in a store
    // can no longer be cancelled.
    message.includes("already been received") ||
    message.includes("still outstanding")
  ) {
    return { error: message.replace(/^.*?:\s*/, "") };
  }
  return { error: fallback };
}

export type CreatePoInput = {
  projectId: string;
  plotId: string | null;
  unitId: string | null;
  vendorId: string;
  deliverStoreId: string | null;
  deliverNote: string | null;
  expectedBy: string | null;
  terms: string | null;
  note: string | null;
};

export async function createPurchaseOrder(input: CreatePoInput): Promise<ActionState> {
  await requireTool("/purchase-orders");

  if (!input.projectId) return { error: "Pick a project first." };
  if (!input.vendorId) return { error: "Pick a vendor — a purchase order is for one vendor." };
  if (input.plotId && input.unitId) {
    return { error: "A purchase order is for one plot or one unit, not both." };
  }

  const supabase = await createClient();

  // The casts paper over a typegen limitation (the create_indent
  // precedent): it types every function argument non-null, but these
  // are genuinely optional and PostgREST passes the JSON null through.
  const { data: poId, error } = await supabase.rpc("create_purchase_order", {
    p_project_id: input.projectId,
    p_plot_id: (input.plotId || null) as unknown as string,
    p_unit_id: (input.unitId || null) as unknown as string,
    p_vendor_id: input.vendorId,
    p_deliver_store_id: (input.deliverStoreId || null) as unknown as string,
    p_deliver_note: (input.deliverNote?.trim() || null) as unknown as string,
    p_expected_by: (input.expectedBy || null) as unknown as string,
    p_terms: (input.terms?.trim() || null) as unknown as string,
    p_note: (input.note?.trim() || null) as unknown as string,
  });
  if (error) {
    console.error("createPurchaseOrder failed:", error);
    return guardError(error, "Could not create the purchase order. Try again.");
  }
  if (!poId) return { error: "Could not create the purchase order. Try again." };

  revalidatePath("/purchase-orders", "layout");
  redirect(`/purchase-orders/${poId}`);
}

export type PoolLineInput = {
  indentLineId: string;
  quantity: number;
};

/**
 * Commits the pool basket onto a draft PO. Everything except which lines
 * and how many is re-read server-side: the item and uom come from the
 * indent line, never from the client. Lines already on this PO are
 * skipped rather than merged — the unique (po_id, indent_line_id) pair
 * means one row per indent line, and the over-ordering guard
 * (po_lines_qty_guard) holds the quantity cap even against a race.
 */
export async function addPoolLines(poId: string, lines: PoolLineInput[]): Promise<ActionState> {
  const user = await requireTool("/purchase-orders");

  if (lines.length === 0) return { error: "Pick at least one line." };
  if (lines.some((line) => !Number.isFinite(line.quantity) || line.quantity <= 0)) {
    return { error: "Quantities must be more than 0." };
  }

  const supabase = await createClient();
  const sourceIds = lines.map((line) => line.indentLineId);

  const [{ data: sources, error: sourcesError }, { data: existing, error: existingError }] =
    await Promise.all([
      supabase.from("indent_lines").select("id, item_id, uom").in("id", sourceIds),
      supabase
        .from("purchase_order_lines")
        .select("indent_line_id")
        .eq("po_id", poId)
        .in("indent_line_id", sourceIds),
    ]);
  if (sourcesError || existingError) {
    console.error("addPoolLines lookup failed:", sourcesError ?? existingError);
    return { error: "Could not add those lines. Try again." };
  }

  const byId = new Map((sources ?? []).map((source) => [source.id, source]));
  const already = new Set((existing ?? []).map((line) => line.indent_line_id));

  const inserts = [];
  for (const line of lines) {
    const source = byId.get(line.indentLineId);
    if (!source || already.has(line.indentLineId)) continue;
    inserts.push({
      po_id: poId,
      item_id: source.item_id,
      quantity: line.quantity,
      uom: source.uom,
      indent_line_id: source.id,
      created_by: user.id,
      updated_by: user.id,
    });
  }

  const skipped = lines.length - inserts.length;
  if (inserts.length === 0) {
    return { error: "Every one of those lines is already on this purchase order." };
  }

  // One at a time, deliberately: the qty guard raises per line with the
  // item's remaining figure, and a batch insert would fail wholesale on
  // the first refusal — losing the lines that were fine.
  let added = 0;
  for (const insert of inserts) {
    const { error } = await supabase.from("purchase_order_lines").insert(insert);
    if (error) {
      console.error("addPoolLines insert failed:", error);
      revalidatePath(`/purchase-orders/${poId}`);
      const friendly = guardError(error, "Could not add those lines. Try again.");
      return {
        error:
          added > 0
            ? `Added ${added}, then stopped: ${friendly?.error ?? "a line was refused."}`
            : (friendly?.error ?? "Could not add those lines. Try again."),
      };
    }
    added++;
  }

  revalidatePath(`/purchase-orders/${poId}`);
  revalidatePath(`/purchase-orders/${poId}/pull`);
  if (skipped > 0) {
    // Only reachable if the PO changed underneath (another tab, a
    // colleague): the screen disables lines it already holds.
    return {
      error: `Added ${added}. ${skipped} ${skipped === 1 ? "line was" : "lines were"} already on this purchase order and ${skipped === 1 ? "was" : "were"} not added again.`,
    };
  }
  return undefined;
}

/** Save-on-blur target for a row: quantity, rate, GST %, note. The uom
 * is NOT editable — it stays the indent line's unit, because the
 * over-ordering guard compares quantities in that unit. No revalidate —
 * the values are already on screen (the updateLine pattern). */
export async function updatePoLine(
  lineId: string,
  input: { quantity: number; rate: number | null; gstPct: number | null; note: string | null },
): Promise<ActionState> {
  const user = await requireTool("/purchase-orders");

  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    return { error: "Quantity must be more than 0" };
  }
  if (input.rate !== null && (!Number.isFinite(input.rate) || input.rate < 0)) {
    return { error: "The rate can't be negative" };
  }
  if (input.gstPct !== null && (!Number.isFinite(input.gstPct) || input.gstPct < 0)) {
    return { error: "Pick a GST rate from the list" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("purchase_order_lines")
    .update({
      quantity: input.quantity,
      rate: input.rate,
      gst_pct: input.gstPct,
      note: input.note?.trim() || null,
      updated_by: user.id,
    })
    .eq("id", lineId);
  if (error) {
    console.error("updatePoLine failed:", error);
    return guardError(error, "Could not save. Try again.");
  }
  return undefined;
}

export async function removePoLine(poId: string, lineId: string): Promise<ActionState> {
  await requireTool("/purchase-orders");

  const supabase = await createClient();
  const { error } = await supabase.from("purchase_order_lines").delete().eq("id", lineId);
  if (error) {
    console.error("removePoLine failed:", error);
    return guardError(error, "Could not remove that line. Try again.");
  }

  revalidatePath(`/purchase-orders/${poId}`);
  return undefined;
}

/** Save-on-blur target for the header fields editable in draft (the
 * scope and number are permanent — re-scope means delete and re-raise). */
export async function updatePoHeader(
  poId: string,
  input: {
    vendorId: string;
    deliverStoreId: string | null;
    deliverNote: string | null;
    expectedBy: string | null;
    terms: string | null;
    note: string | null;
  },
): Promise<ActionState> {
  const user = await requireTool("/purchase-orders");

  if (!input.vendorId) return { error: "A purchase order needs a vendor." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("purchase_orders")
    .update({
      vendor_id: input.vendorId,
      deliver_store_id: input.deliverStoreId || null,
      deliver_note: input.deliverNote?.trim() || null,
      expected_by: input.expectedBy || null,
      terms: input.terms?.trim() || null,
      note: input.note?.trim() || null,
      updated_by: user.id,
    })
    .eq("id", poId);
  if (error) {
    console.error("updatePoHeader failed:", error);
    return guardError(error, "Could not save. Try again.");
  }
  return undefined;
}

/**
 * Issues a draft to the vendor. The guard re-checks under the row lock
 * that every line is priced (rate + GST) and at least one exists — the
 * checks here only make the refusal read well in the common case.
 */
export async function issuePo(poId: string): Promise<ActionState> {
  const user = await requireTool("/purchase-orders");
  const supabase = await createClient();

  const [{ count, error: countError }, { count: unpriced, error: unpricedError }] =
    await Promise.all([
      supabase
        .from("purchase_order_lines")
        .select("id", { count: "exact", head: true })
        .eq("po_id", poId),
      supabase
        .from("purchase_order_lines")
        .select("id", { count: "exact", head: true })
        .eq("po_id", poId)
        .or("rate.is.null,gst_pct.is.null"),
    ]);
  if (countError || unpricedError) {
    console.error("issuePo count failed:", countError ?? unpricedError);
    return { error: "Could not issue. Try again." };
  }
  if ((count ?? 0) === 0) {
    return { error: "Add at least one line before issuing." };
  }
  if ((unpriced ?? 0) > 0) {
    return {
      error: `${unpriced} ${unpriced === 1 ? "line still needs" : "lines still need"} a rate and a GST % before issuing.`,
    };
  }

  const { error } = await supabase
    .from("purchase_orders")
    .update({
      status: "issued",
      issued_by: user.id,
      issued_at: new Date().toISOString(),
      updated_by: user.id,
    })
    // No status filter — filtering to drafts would make an issue on a
    // locked PO match zero rows and "succeed" silently. The guard's
    // refusal is worth showing (the submitIndent rule).
    .eq("id", poId);
  if (error) {
    console.error("issuePo failed:", error);
    return guardError(error, "Could not issue. Try again.");
  }

  revalidatePath(`/purchase-orders/${poId}`);
  revalidatePath("/purchase-orders", "layout");
  return undefined;
}

/**
 * Asks for an issued PO to be removed — the founder's rule: anyone with
 * the app can ask (with a reason), only an admin's yes cancels it.
 */
export async function requestPoDeletion(poId: string, note: string): Promise<ActionState> {
  const user = await requireTool("/purchase-orders");

  const reason = note.trim();
  if (!reason) {
    return { error: "Say why this purchase order should be removed — the admin reads this." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("purchase_orders")
    .update({
      status: "deletion_requested",
      deletion_note: reason,
      deletion_requested_by: user.id,
      deletion_requested_at: new Date().toISOString(),
      updated_by: user.id,
    })
    .eq("id", poId);
  if (error) {
    console.error("requestPoDeletion failed:", error);
    return guardError(error, "Could not request deletion. Try again.");
  }

  revalidatePath(`/purchase-orders/${poId}`);
  revalidatePath("/purchase-orders", "layout");
  return undefined;
}

/** Takes a deletion request back (the requester) or refuses it (an
 * admin) — either way the PO reads as plainly issued again. */
export async function withdrawPoDeletion(poId: string): Promise<ActionState> {
  const user = await requireTool("/purchase-orders");
  const supabase = await createClient();

  const { error } = await supabase
    .from("purchase_orders")
    .update({
      status: "issued",
      deletion_note: null,
      deletion_requested_by: null,
      deletion_requested_at: null,
      updated_by: user.id,
    })
    .eq("id", poId);
  if (error) {
    console.error("withdrawPoDeletion failed:", error);
    return guardError(error, "Could not withdraw the request. Try again.");
  }

  revalidatePath(`/purchase-orders/${poId}`);
  revalidatePath("/purchase-orders", "layout");
  return undefined;
}

/**
 * The admin's yes: cancels a deletion-requested PO. Its quantities
 * return to the unordered pool (the qty guard skips cancelled POs), and
 * its number stays burnt. Admin-only, enforced by the guard DB-side.
 */
export async function approvePoDeletion(poId: string): Promise<ActionState> {
  const user = await requireTool("/purchase-orders");
  const supabase = await createClient();

  const { error } = await supabase
    .from("purchase_orders")
    .update({
      status: "cancelled",
      cancelled_by: user.id,
      cancelled_at: new Date().toISOString(),
      updated_by: user.id,
    })
    .eq("id", poId);
  if (error) {
    console.error("approvePoDeletion failed:", error);
    return guardError(error, "Could not cancel this purchase order. Try again.");
  }

  revalidatePath(`/purchase-orders/${poId}`);
  revalidatePath("/purchase-orders", "layout");
  return undefined;
}

/** Only a draft can go, and only its creator's (or an admin's) — the RPC
 * re-checks both under a row lock. The number stays burnt (gaps are
 * accepted and expected). */
export async function deleteDraftPo(poId: string): Promise<ActionState> {
  await requireTool("/purchase-orders");
  const supabase = await createClient();

  const { error } = await supabase.rpc("delete_draft_purchase_order", { p_po_id: poId });
  if (error) {
    console.error("deleteDraftPo failed:", error);
    // Written for a person to read by the RAISE EXCEPTION in the function.
    return {
      error: error.message.replace(/^.*?:\s*/, "") || "Could not delete this purchase order.",
    };
  }

  revalidatePath("/purchase-orders", "layout");
  redirect("/purchase-orders/list");
}
