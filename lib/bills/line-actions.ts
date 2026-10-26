"use server";

// Type-only, never re-exported from a "use server" file (npm run check:actions).
import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { guardError } from "@/lib/db-error";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { billLinesProblem, lineMoneyOf, receivedCapProblem, type BillLineDraft } from "./lines";
import { rollUpBill } from "./math";
import { documentChargesProblem, roundPaise, type DocumentCharges } from "@/lib/line-money";

// Rules live in the database: bill_lines_guard (lines move only while the bill is recorded; a material names a line of the bill's own PO, 0111) and bill_lines_roll_up (header from lines, to the paisa).

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
  "has arrived",
] as const;

type Client = Awaited<ReturnType<typeof createClient>>;

/** What arrived and what other bills took, per PO line on these lines: so a bill past what arrived is refused before
 * anything is written, not half-saved by bill_lines_guard (0156). A message, or undefined to go ahead. */
async function receivedCheck(
  supabase: Client,
  billId: string | null,
  lines: BillLineDraft[],
): Promise<string | undefined> {
  const ids = [
    ...new Set(
      lines.flatMap((line) => (line.kind === "material" && line.poLineId ? [line.poLineId] : [])),
    ),
  ];
  if (ids.length === 0) return undefined;
  const [facts, own] = await Promise.all([
    supabase
      .from("po_line_billing_facts")
      .select("po_line_id, received_quantity, billed_quantity")
      .in("po_line_id", ids),
    billId
      ? supabase
          .from("bill_lines")
          .select("po_line_id, quantity")
          .eq("bill_id", billId)
          .in("po_line_id", ids)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (facts.error || own.error) {
    console.error("receivedCheck failed:", facts.error ?? own.error);
    return "Could not check what was received. Try again.";
  }
  const onThisBill = new Map<string, number>();
  for (const line of own.data ?? []) {
    if (line.po_line_id) {
      onThisBill.set(
        line.po_line_id,
        (onThisBill.get(line.po_line_id) ?? 0) + (line.quantity ?? 0),
      );
    }
  }
  const received = new Map<string, number>();
  const billedElsewhere = new Map<string, number>();
  for (const fact of facts.data ?? []) {
    if (!fact.po_line_id) continue;
    received.set(fact.po_line_id, fact.received_quantity ?? 0);
    billedElsewhere.set(
      fact.po_line_id,
      (fact.billed_quantity ?? 0) - (onThisBill.get(fact.po_line_id) ?? 0),
    );
  }
  return receivedCapProblem(lines, received, billedElsewhere);
}

export type BillLineSave = BillLineDraft & { id?: string };

const row = (billId: string, userId: string, line: BillLineDraft, sortOrder: number) => ({
  bill_id: billId,
  sort_order: sortOrder,
  line_kind: line.kind,
  po_line_id: line.poLineId,
  item_id: line.itemId,
  labour_log_id: line.labourLogId,
  labour_contract_line_id: line.labourContractLineId,
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

/** Updates in place, adds new, removes missing. A Send-to-Bill bill keeps its lines and quantities (they come from stamped labour entries); only the money may change. */
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

  const capProblem = await receivedCheck(supabase, billId, lines);
  if (capProblem) return { error: capProblem };

  // Removals first, then lines that drop, then rises and new lines, so a quantity moved between lines of one PO line
  // never passes what arrived on the way.
  const removedIds = [...before.keys()].filter((id) => !kept.has(id));
  if (removedIds.length) {
    const { error } = await supabase.from("bill_lines").delete().in("id", removedIds);
    if (error) {
      console.error("saveBillLines delete failed:", error);
      revalidatePath("/bills", "layout");
      return guardError(error, "Could not remove a line. Try again.", LINE_GUARD_PHRASES);
    }
  }
  const rises = (line: BillLineSave) =>
    !line.id || (line.quantity ?? 0) > (before.get(line.id)?.quantity ?? 0);
  const ordered = [
    ...[...lines.entries()].filter(([, line]) => !rises(line)),
    ...[...lines.entries()].filter(([, line]) => rises(line)),
  ];
  for (const [index, line] of ordered) {
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

  revalidatePath("/bills", "layout");
  return undefined;
}

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

/** An NMR muster roll can total differently from heads × rates: a total with a note sets the override, no total clears it. */
export async function setBillTotalOverride(
  billId: string,
  input: { total: number | null; note: string | null },
): Promise<ActionState> {
  const user = await requireTool("/bills");
  const supabase = await createClient();
  const [{ data: bill, error: billError }, { data: lines, error: linesError }] = await Promise.all([
    supabase
      .from("bills")
      .select("kind, status, charges_amount, charges_gst_pct")
      .eq("id", billId)
      .maybeSingle(),
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
    const sum = rollUpBill(
      (lines ?? []).map((line) => ({ ...line })),
      { amount: bill.charges_amount, gst_pct: bill.charges_gst_pct },
    );
    update = { total_amount: Math.max(sum.total, 0.01), total_override_note: null };
  } else {
    if (!Number.isFinite(input.total) || input.total <= 0) {
      return { error: "The total must be more than zero." };
    }
    if (!input.note?.trim()) return { error: "Say why the total differs from heads × rates." };
    update = {
      total_amount: roundPaise(input.total),
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

/** Freight, loading and the like (0133). bills_charges_roll_up re-sums the header of a bill with lines; the guard freezes them once approved. */
export async function updateBillCharges(
  billId: string,
  input: DocumentCharges,
): Promise<ActionState> {
  const user = await requireTool("/bills");
  const problem = documentChargesProblem(input);
  if (problem) return { error: problem };

  const supabase = await createClient();
  const { error } = await supabase
    .from("bills")
    .update({
      charges_amount: input.amount,
      charges_gst_pct: input.amount === null ? null : input.gst_pct,
      charges_note: input.amount === null ? null : input.note?.trim() || null,
      updated_by: user.id,
    })
    .eq("id", billId);
  if (error) {
    console.error("updateBillCharges failed:", error);
    return guardError(error, "Could not save the charges. Try again.", LINE_GUARD_PHRASES);
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
  projectId: string | null;
  plotId: string | null;
  unitId: string | null;
  invoiceNo: string;
  invoiceDate: string;
  note: string | null;
  lines: BillLineDraft[];
};

/** Header minted at the lines' figures (create_bill or create_nmr_bill), then lines go in and the database rolls the header up, same figures to the paisa. */
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
  if (input.kind === "po") {
    const capProblem = await receivedCheck(supabase, null, input.lines);
    if (capProblem) return { error: capProblem };
  }
  // The casts paper over typegen (see createBill).
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
