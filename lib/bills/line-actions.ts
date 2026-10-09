"use server";

// Type-only import, never re-exported from a "use server" file — the
// 2026-08-03 outage rule, enforced by npm run check:actions.
import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { guardError } from "@/lib/db-error";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { billLinesProblem, lineMoneyOf, type BillLineDraft } from "./lines";
import { rollUpBill } from "./math";

/**
 * Writes for a bill's lines (0106, plan.md B7). The database holds the
 * rules: bill_lines_guard (lines move only while the bill is recorded; a
 * material names a line of the bill's own PO — 0111), and
 * bill_lines_roll_up, which rewrites the bill's taxable, GST and total
 * from its lines, to the paisa. These actions say the same things first.
 */

const LINE_GUARD_PHRASES = [
  "can no longer change",
  "not on this bill",
  "stays on the bill",
  "short code",
  "inactive",
  "approved",
  "permanent",
  "no longer exists",
  "issued purchase order",
] as const;

/** A line as the editor sends it: an id when it is already saved. */
export type BillLineSave = BillLineDraft & { id?: string };

const row = (billId: string, userId: string, line: BillLineDraft, sortOrder: number) => ({
  bill_id: billId,
  sort_order: sortOrder,
  line_kind: line.kind,
  po_line_id: line.poLineId,
  item_id: line.itemId,
  labour_log_id: line.labourLogId,
  work_item_id: line.workItemId,
  description: line.description.trim(),
  uom: line.uom || null,
  quantity: line.kind === "pw_lump" ? null : line.quantity,
  rate: line.rate ?? 0,
  gst_pct: line.gstPct,
  discount_amount: line.discountAmount || null,
  other_charges: line.otherCharges || null,
  note: line.note?.trim() || null,
  updated_by: userId,
});

/**
 * Saves a recorded bill's lines: existing lines updated in place, new
 * ones added, missing ones removed. A bill made from labour entries
 * (Send to Bill) keeps its lines and their quantities — they come from
 * the entries, which stay stamped with this bill; only the money on them
 * may change. To change those, delete the bill and send the entries again.
 */
export async function saveBillLines(billId: string, lines: BillLineSave[]): Promise<ActionState> {
  const user = await requireTool("/bills");
  const problem = billLinesProblem(lines);
  if (problem) return { error: problem };

  const supabase = await createClient();
  const [{ data: bill, error: billError }, { data: existing, error: existingError }, stamped] =
    await Promise.all([
      supabase.from("bills").select("status, kind").eq("id", billId).maybeSingle(),
      supabase.from("bill_lines").select("id, quantity, line_kind").eq("bill_id", billId),
      supabase
        .from("labour_logs")
        .select("id", { count: "exact", head: true })
        .eq("bill_id", billId),
    ]);
  if (billError || existingError || stamped.error) {
    console.error("saveBillLines read failed:", billError ?? existingError ?? stamped.error);
    return { error: "Could not read the bill. Try again." };
  }
  if (!bill) return { error: "That bill no longer exists." };
  if (bill.status !== "recorded") {
    return { error: "Only a recorded bill's lines can change — send it back first." };
  }

  const before = new Map((existing ?? []).map((line) => [line.id, line]));
  const kept = new Set(lines.flatMap((line) => (line.id ? [line.id] : [])));
  if (lines.some((line) => line.id && !before.has(line.id))) {
    return { error: "A line has changed underneath you — reload the bill and try again." };
  }
  if ((stamped.count ?? 0) > 0) {
    const removed = [...before.keys()].some((id) => !kept.has(id));
    const added = lines.some((line) => !line.id);
    const requantified = lines.some(
      (line) => line.id && before.get(line.id)?.quantity !== line.quantity,
    );
    if (removed || added || requantified) {
      return {
        error:
          "This bill was made from labour entries — its lines and quantities come from them. Change the rates here, or delete the bill and send the entries again.",
      };
    }
  }

  for (const [index, line] of lines.entries()) {
    const values = row(billId, user.id, line, index);
    const { error } = line.id
      ? await supabase.from("bill_lines").update(values).eq("id", line.id)
      : await supabase.from("bill_lines").insert({ ...values, created_by: user.id });
    if (error) {
      console.error("saveBillLines write failed:", error);
      revalidatePath("/bills", "layout");
      return guardError(error, "Could not save a line. Try again.", LINE_GUARD_PHRASES);
    }
  }
  const removedIds = [...before.keys()].filter((id) => !kept.has(id));
  if (removedIds.length) {
    const { error } = await supabase.from("bill_lines").delete().in("id", removedIds);
    if (error) {
      console.error("saveBillLines delete failed:", error);
      revalidatePath("/bills", "layout");
      return guardError(error, "Could not remove a line. Try again.", LINE_GUARD_PHRASES);
    }
  }

  revalidatePath("/bills", "layout");
  return undefined;
}

/** A bill with lines: its invoice number, date and note — the figures follow the lines. */
export async function updateBillDetails(
  billId: string,
  input: { invoiceNo: string; invoiceDate: string; note: string | null },
): Promise<ActionState> {
  const user = await requireTool("/bills");
  if (!input.invoiceNo.trim()) return { error: "The invoice number can't be blank." };
  if (!input.invoiceDate) return { error: "The invoice date can't be blank." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("bills")
    .update({
      invoice_no: input.invoiceNo.trim(),
      invoice_date: input.invoiceDate,
      note: input.note?.trim() || null,
      updated_by: user.id,
    })
    .eq("id", billId);
  if (error) {
    console.error("updateBillDetails failed:", error);
    return guardError(error, "Could not save. Try again.", LINE_GUARD_PHRASES);
  }
  return undefined;
}

/**
 * An NMR bill whose muster roll totals differently from heads × rates
 * (founder: "total can be overwritten with a note"). A total with a note
 * sets the override; no total clears it, and the total goes back to the
 * lines' sum.
 */
export async function setBillTotalOverride(
  billId: string,
  input: { total: number | null; note: string | null },
): Promise<ActionState> {
  const user = await requireTool("/bills");
  const supabase = await createClient();
  const [{ data: bill, error: billError }, { data: lines, error: linesError }] = await Promise.all([
    supabase.from("bills").select("kind, status").eq("id", billId).maybeSingle(),
    supabase
      .from("bill_lines")
      .select("quantity, rate, gst_pct, discount_amount, other_charges")
      .eq("bill_id", billId),
  ]);
  if (billError || linesError) {
    console.error("setBillTotalOverride read failed:", billError ?? linesError);
    return { error: "Could not read the bill. Try again." };
  }
  if (!bill) return { error: "That bill no longer exists." };
  if (bill.kind !== "nmr") return { error: "Only a daily-wages bill's total can be set by hand." };
  if (bill.status !== "recorded") return { error: "Only a recorded bill can change." };

  let update: { total_amount: number; total_override_note: string | null };
  if (input.total === null) {
    const sum = rollUpBill((lines ?? []).map((line) => ({ ...line })));
    update = { total_amount: Math.max(sum.total, 0.01), total_override_note: null };
  } else {
    if (!Number.isFinite(input.total) || input.total <= 0) {
      return { error: "The total must be more than zero." };
    }
    if (!input.note?.trim()) return { error: "Say why the total differs from heads × rates." };
    update = {
      total_amount: Math.round(input.total * 100) / 100,
      total_override_note: input.note.trim(),
    };
  }

  const { error } = await supabase
    .from("bills")
    .update({ ...update, updated_by: user.id })
    .eq("id", billId);
  if (error) {
    console.error("setBillTotalOverride failed:", error);
    return guardError(error, "Could not save the total. Try again.", LINE_GUARD_PHRASES);
  }
  revalidatePath("/bills", "layout");
  return undefined;
}

export type BillWithLinesInput = {
  kind: "po" | "contract" | "nmr";
  poId: string | null;
  labourContractId: string | null;
  /** NMR only: the contractor, or null when the muster roll is paid directly. */
  vendorId: string | null;
  /** NMR only: the scope picked directly. */
  projectId: string | null;
  plotId: string | null;
  unitId: string | null;
  invoiceNo: string;
  invoiceDate: string;
  note: string | null;
  lines: BillLineDraft[];
};

/**
 * Records a bill with its lines: the header is minted (create_bill or
 * create_nmr_bill) at the lines' figures, then the lines go in and the
 * database rolls the header up from them — the same figures, to the
 * paisa. Lands on the new bill.
 */
export async function createBillWithLines(input: BillWithLinesInput): Promise<ActionState> {
  const user = await requireTool("/bills");
  if (!input.invoiceNo.trim()) return { error: "Type the invoice number as printed on the bill." };
  if (!input.invoiceDate) return { error: "Pick the invoice date." };
  const problem = billLinesProblem(input.lines);
  if (problem) return { error: problem };
  if (input.kind === "po" && !input.poId) return { error: "Pick the purchase order." };
  if (input.kind === "contract" && !input.labourContractId)
    return { error: "Pick the work order." };
  if (input.kind === "nmr" && !input.projectId) return { error: "Pick the project." };
  if (input.plotId && input.unitId)
    return { error: "A bill is for one plot or one unit, not both." };
  if (input.kind === "po" && input.lines.some((line) => line.kind !== "material")) {
    return { error: "A bill against a purchase order lists the PO's materials." };
  }

  const totals = rollUpBill(input.lines.map(lineMoneyOf));
  if (totals.total <= 0) return { error: "The bill's total must be more than zero." };

  const supabase = await createClient();
  // The casts paper over the typegen limitation createBill notes.
  const minted =
    input.kind === "nmr"
      ? await supabase.rpc("create_nmr_bill", {
          p_vendor_id: (input.vendorId || null) as unknown as string,
          p_project_id: input.projectId as string,
          p_plot_id: (input.plotId || null) as unknown as string,
          p_unit_id: (input.unitId || null) as unknown as string,
          p_invoice_no: input.invoiceNo.trim(),
          p_invoice_date: input.invoiceDate,
          p_taxable_amount: totals.taxable,
          p_gst_amount: totals.gst,
          p_total_amount: totals.total,
          p_note: (input.note?.trim() || null) as unknown as string,
        })
      : await supabase.rpc("create_bill", {
          p_po_id: (input.poId || null) as unknown as string,
          p_labour_contract_id: (input.labourContractId || null) as unknown as string,
          p_invoice_no: input.invoiceNo.trim(),
          p_invoice_date: input.invoiceDate,
          p_taxable_amount: totals.taxable,
          p_gst_amount: totals.gst,
          p_total_amount: totals.total,
          p_note: (input.note?.trim() || null) as unknown as string,
        });
  if (minted.error || !minted.data) {
    console.error("createBillWithLines mint failed:", minted.error);
    return guardError(
      minted.error ?? { message: "" },
      "Could not record the bill. Try again.",
      LINE_GUARD_PHRASES,
    );
  }
  const billId = minted.data as string;

  const { error } = await supabase.from("bill_lines").insert(
    input.lines.map((line, index) => ({
      ...row(billId, user.id, line, index),
      created_by: user.id,
    })),
  );
  revalidatePath("/bills", "layout");
  if (error) {
    console.error("createBillWithLines lines failed:", error);
    return {
      error:
        "The bill was recorded but its lines were refused — open it from the list, check the figures, or delete it and record it again.",
    };
  }
  redirect(`/bills/${billId}`);
}
