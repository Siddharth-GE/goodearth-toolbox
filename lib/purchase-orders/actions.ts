"use server";

import { requireTool } from "@/lib/auth/access";
import { dbErrorMessage, guardError } from "@/lib/db-error";
import { getDefaultTerms } from "@/lib/masters/terms";
import {
  leftToBuy,
  orderedByIndentLine,
  picksProblem,
  splitByVendor,
  type IndentPick,
} from "@/lib/purchase-orders/from-indent";
import { documentChargesProblem, type DocumentCharges } from "@/lib/line-money";
import { lineChargesProblem } from "@/lib/purchase-orders/math";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// Type-only and not re-exported: `export type { X }` in a "use server" file crashes the chunk at load.
import type { ActionState } from "@/lib/action-state";

// The rules live in the database (purchase_orders_guard, po_lines_draft_only, po_lines_qty_guard, 0021); actions pre-check so refusals read as sentences.

/** The guards raise human-readable messages; surface the known ones. */
const PO_GUARD_PHRASES = [
  "draft",
  "permanent",
  "no longer be edited",
  "unordered",
  "APPROVED",
  "short code",
  "inactive",
  "not both",
  "before issuing",
  "rate and a GST",
  "no longer exists",
  "deletion request",
  "admin can approve",
  "receiving its goods",
  // 0023: an issued PO whose goods are already in a store cannot be cancelled.
  "already been received",
  "still outstanding",
] as const;

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

  // The casts paper over typegen typing every RPC argument non-null; PostgREST passes null through.
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
    return guardError(error, "Could not create the purchase order. Try again.", PO_GUARD_PHRASES);
  }
  if (!poId) return { error: "Could not create the purchase order. Try again." };

  revalidatePath("/purchase-orders", "layout");
  redirect(`/purchase-orders/${poId}`);
}

export type PoolLineInput = {
  indentLineId: string;
  quantity: number;
};

// Item and uom come from the indent line, never the client. Lines already on the PO are skipped (unique (po_id, indent_line_id)); po_lines_qty_guard holds the cap even in a race.
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
      supabase.from("indent_lines").select("id, item_id, uom, items(gst_pct)").in("id", sourceIds),
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
      // Masters' GST for the item, where someone has entered one; the rate stays the buyer's.
      gst_pct: (source.items as { gst_pct: number | null } | null)?.gst_pct ?? null,
      indent_line_id: source.id,
      created_by: user.id,
      updated_by: user.id,
    });
  }

  const skipped = lines.length - inserts.length;
  if (inserts.length === 0) {
    return { error: "Every one of those lines is already on this purchase order." };
  }

  // One at a time: the qty guard raises per line, and a batch insert would fail wholesale.
  let added = 0;
  for (const insert of inserts) {
    const { error } = await supabase.from("purchase_order_lines").insert(insert);
    if (error) {
      console.error("addPoolLines insert failed:", error);
      revalidatePath("/purchase-orders", "layout");
      const friendly = guardError(error, "Could not add those lines. Try again.", PO_GUARD_PHRASES);
      return {
        error:
          added > 0
            ? `Added ${added}, then stopped: ${friendly?.error ?? "a line was refused."}`
            : (friendly?.error ?? "Could not add those lines. Try again."),
      };
    }
    added++;
  }

  revalidatePath("/purchase-orders", "layout");
  if (skipped > 0) {
    // Only reachable if the PO changed underneath; the screen disables lines it holds.
    return {
      error: `Added ${added}. ${skipped} ${skipped === 1 ? "line was" : "lines were"} already on this purchase order and ${skipped === 1 ? "was" : "were"} not added again.`,
    };
  }
  return undefined;
}

// uom is not editable: the over-ordering guard compares quantities in the indent line's unit. No revalidate: the values are on screen.
export async function updatePoLine(
  lineId: string,
  input: {
    quantity: number;
    rate: number | null;
    gstPct: number | null;
    /** A percentage OR a rupee discount (0102) — the other stays null. */
    discountPct: number | null;
    discountAmount: number | null;
    otherCharges: number | null;
    note: string | null;
  },
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
  const chargesProblem = lineChargesProblem({
    quantity: input.quantity,
    rate: input.rate,
    gst_pct: input.gstPct,
    discount_pct: input.discountPct,
    discount_amount: input.discountAmount,
    other_charges: input.otherCharges,
  });
  if (chargesProblem) return { error: chargesProblem };

  const supabase = await createClient();
  const { error } = await supabase
    .from("purchase_order_lines")
    .update({
      quantity: input.quantity,
      rate: input.rate,
      gst_pct: input.gstPct,
      discount_pct: input.discountPct,
      discount_amount: input.discountAmount,
      other_charges: input.otherCharges,
      note: input.note?.trim() || null,
      updated_by: user.id,
    })
    .eq("id", lineId);
  if (error) {
    console.error("updatePoLine failed:", error);
    // 0113: a direct line added before PO lines came only from indents can't be saved again on a draft.
    if (error.message.includes("purchase_order_lines_from_an_indent")) {
      return {
        error:
          "This line was added directly, which is no longer allowed — remove it and add the item from an approved indent.",
      };
    }
    return guardError(error, "Could not save. Try again.", PO_GUARD_PHRASES);
  }
  return undefined;
}

export async function removePoLine(poId: string, lineId: string): Promise<ActionState> {
  await requireTool("/purchase-orders");

  const supabase = await createClient();
  const { error } = await supabase.from("purchase_order_lines").delete().eq("id", lineId);
  if (error) {
    console.error("removePoLine failed:", error);
    return guardError(error, "Could not remove that line. Try again.", PO_GUARD_PHRASES);
  }

  revalidatePath("/purchase-orders", "layout");
  return undefined;
}

// Scope and number are permanent (re-scope = delete and re-raise). Refreshes the page: a new vendor can switch CGST + SGST to IGST.
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
    return guardError(error, "Could not save. Try again.", PO_GUARD_PHRASES);
  }
  revalidatePath("/purchase-orders", "layout");
  return undefined;
}

/** Freight, loading and the like (0133): editable while draft, as the rest of the header. */
export async function updatePoCharges(poId: string, input: DocumentCharges): Promise<ActionState> {
  const user = await requireTool("/purchase-orders");
  const problem = documentChargesProblem(input);
  if (problem) return { error: problem };

  const supabase = await createClient();
  const { error } = await supabase
    .from("purchase_orders")
    .update({
      charges_amount: input.amount,
      charges_gst_pct: input.amount === null ? null : input.gst_pct,
      charges_note: input.amount === null ? null : input.note?.trim() || null,
      updated_by: user.id,
    })
    .eq("id", poId);
  if (error) {
    console.error("updatePoCharges failed:", error);
    return guardError(error, "Could not save the charges. Try again.", PO_GUARD_PHRASES);
  }
  revalidatePath("/purchase-orders", "layout");
  return undefined;
}

// The guard re-checks under the row lock that every line is priced (rate + GST); the checks here are for the message.
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
    // No status filter: filtering to drafts would make an issue on a locked PO match zero rows and "succeed".
    .eq("id", poId);
  if (error) {
    console.error("issuePo failed:", error);
    return guardError(error, "Could not issue. Try again.", PO_GUARD_PHRASES);
  }

  revalidatePath("/purchase-orders", "layout");
  revalidatePath("/purchase-orders", "layout");
  return undefined;
}

// Anyone with the app can ask (with a reason); only an admin's yes cancels.
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
    return guardError(error, "Could not request deletion. Try again.", PO_GUARD_PHRASES);
  }

  revalidatePath("/purchase-orders", "layout");
  revalidatePath("/purchase-orders", "layout");
  return undefined;
}

/** The requester withdraws, or an admin refuses; either way the PO reads as issued. */
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
    return guardError(error, "Could not withdraw the request. Try again.", PO_GUARD_PHRASES);
  }

  revalidatePath("/purchase-orders", "layout");
  revalidatePath("/purchase-orders", "layout");
  return undefined;
}

// Quantities return to the unordered pool (the qty guard skips cancelled POs); the number stays burnt. Admin-only, enforced by the guard.
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
    return guardError(error, "Could not cancel this purchase order. Try again.", PO_GUARD_PHRASES);
  }

  revalidatePath("/purchase-orders", "layout");
  revalidatePath("/purchase-orders", "layout");
  return undefined;
}

/** Only a draft, by its creator or an admin; the RPC re-checks under a row lock. The number stays burnt. */
export async function deleteDraftPo(poId: string): Promise<ActionState> {
  await requireTool("/purchase-orders");
  const supabase = await createClient();

  const { error } = await supabase.rpc("delete_draft_purchase_order", { p_po_id: poId });
  if (error) {
    console.error("deleteDraftPo failed:", error);
    // The function's RAISE EXCEPTION text is written for people.
    return { error: dbErrorMessage(error, "Could not delete this purchase order.") };
  }

  revalidatePath("/purchase-orders", "layout");
  redirect("/purchase-orders/list");
}

// One draft PO per vendor, scoped to the indent's unit or plot. The client sends lines, quantities, vendor and rate; item and unit come from the indent line and what is left is re-read here.
// Lines go in row by row (see addPoolLines). A refusal part-way says what was made.
export async function createPosFromIndent(
  indentId: string,
  picks: IndentPick[],
): Promise<ActionState> {
  const user = await requireTool("/purchase-orders");
  const supabase = await createClient();

  const { data: indent, error: indentError } = await supabase
    .from("indents")
    .select("id, status, project_id, plot_id, unit_id, plots(name), units(name)")
    .eq("id", indentId)
    .maybeSingle();
  if (indentError) {
    console.error("createPosFromIndent indent read failed:", indentError);
    return { error: "Could not read the indent. Try again." };
  }
  if (!indent) return { error: "That indent no longer exists." };
  if (indent.status !== "approved") return { error: "Only an approved indent can be ordered." };

  const { data: lines, error: linesError } = await supabase
    .from("indent_lines")
    .select("id, item_id, quantity, uom")
    .eq("indent_id", indentId);
  if (linesError) {
    console.error("createPosFromIndent lines read failed:", linesError);
    return { error: "Could not read the indent. Try again." };
  }
  const lineIds = lines.map((line) => line.id);
  const { data: ordered, error: orderedError } = lineIds.length
    ? await supabase
        .from("purchase_order_lines")
        .select("indent_line_id, quantity, purchase_orders(status)")
        .in("indent_line_id", lineIds)
    : { data: [], error: null };
  if (orderedError) {
    console.error("createPosFromIndent ordered read failed:", orderedError);
    return { error: "Could not read what is already ordered. Try again." };
  }
  const orderedByLine = orderedByIndentLine(
    ordered.map((row) => ({
      indent_line_id: row.indent_line_id,
      quantity: row.quantity,
      status: (row.purchase_orders as { status: string } | null)?.status ?? "cancelled",
    })),
  );
  const left = new Map(
    lines.map((line) => [line.id, leftToBuy(line.quantity, orderedByLine.get(line.id) ?? 0)]),
  );
  const problem = picksProblem(picks, left);
  if (problem) return { error: problem };

  const byId = new Map(lines.map((line) => [line.id, line]));
  const place =
    (indent.units as { name: string } | null)?.name ??
    (indent.plots as { name: string } | null)?.name ??
    null;
  let terms: string | null;
  try {
    terms = await getDefaultTerms("po");
  } catch {
    return { error: "Could not read the default terms. Try again." };
  }

  const made: string[] = [];
  const stopped = (reason: string): ActionState => {
    revalidatePath("/purchase-orders", "layout");
    return {
      error:
        made.length > 0
          ? `Made ${made.length} draft ${made.length === 1 ? "PO" : "POs"}, then stopped: ${reason} What was made is in the list as drafts.`
          : reason,
    };
  };

  for (const group of splitByVendor(picks)) {
    const { data: poId, error } = await supabase.rpc("create_purchase_order", {
      p_project_id: indent.project_id,
      p_plot_id: (indent.unit_id ? null : indent.plot_id) as unknown as string,
      p_unit_id: indent.unit_id as unknown as string,
      p_vendor_id: group.vendorId,
      p_deliver_store_id: null as unknown as string,
      p_deliver_note: (place ? `Site — ${place}` : null) as unknown as string,
      p_expected_by: null as unknown as string,
      p_terms: terms as unknown as string,
      p_note: null as unknown as string,
    });
    if (error || !poId) {
      console.error("createPosFromIndent create failed:", error);
      return stopped(
        guardError(error ?? { message: "" }, "Could not make the purchase order.", PO_GUARD_PHRASES)
          ?.error ?? "Could not make the purchase order.",
      );
    }
    made.push(poId);

    for (const pick of group.lines) {
      const source = byId.get(pick.indentLineId);
      if (!source) return stopped("A ticked line is no longer on this indent.");
      const { error: lineError } = await supabase.from("purchase_order_lines").insert({
        po_id: poId,
        item_id: source.item_id,
        quantity: pick.quantity,
        uom: source.uom,
        indent_line_id: source.id,
        rate: pick.rate,
        gst_pct: pick.gstPct,
        created_by: user.id,
        updated_by: user.id,
      });
      if (lineError) {
        console.error("createPosFromIndent line insert failed:", lineError);
        return stopped(
          guardError(lineError, "A line was refused.", PO_GUARD_PHRASES)?.error ??
            "A line was refused.",
        );
      }
    }
  }

  revalidatePath("/purchase-orders", "layout");
  redirect(`/purchase-orders/${made[0]}?made=${made.join(",")}`);
}
