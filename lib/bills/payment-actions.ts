"use server";

// Type-only import, never re-exported from a "use server" file — the
// 2026-08-03 outage rule, enforced by npm run check:actions.
import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { dbErrorMessage } from "@/lib/db-error";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { mondayOf } from "./ledger";

/**
 * Writes for payments (0107, plan.md B8). The database holds the rules:
 * bill_settlement_guard (money only against an approved bill, never past
 * its total, an advance recovered only from the same contractor's bills
 * and never past what is left of it), the trigger that marks a bill paid
 * once settled in full, and the cash-request guards (who may submit,
 * release, cut or send back, and when). Money is append-only: payments,
 * advances and recoveries are never edited or deleted. Each guard's
 * refusal is written for a person, so it is passed on as it is.
 */

const done = (): ActionState => {
  revalidatePath("/bills", "layout");
  return undefined;
};

const refused = (where: string, error: { message: string } | null): ActionState => {
  console.error(`${where} failed:`, error);
  return { error: dbErrorMessage(error ?? { message: "" }, "Could not save. Try again.") };
};

const cleanRef = (value: string) => value.trim();

/** Money out against an approved bill — a part or the rest of what is pending. */
export async function recordBillPayment(
  billId: string,
  input: {
    amount: number;
    paidOn: string;
    reference: string;
    note: string | null;
    cashRequestItemId?: string | null;
  },
): Promise<ActionState> {
  const user = await requireTool("/bills");
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { error: "The amount must be more than zero." };
  }
  if (!cleanRef(input.reference)) return { error: "Type the UTR, cheque number or UPI reference." };
  if (!input.paidOn) return { error: "Pick the day it was paid." };

  const supabase = await createClient();
  const { error } = await supabase.from("bill_payments").insert({
    bill_id: billId,
    amount: Math.round(input.amount * 100) / 100,
    paid_on: input.paidOn,
    payment_ref: cleanRef(input.reference),
    note: input.note?.trim() || null,
    cash_request_item_id: input.cashRequestItemId ?? null,
    created_by: user.id,
    updated_by: user.id,
  });
  if (error) return refused("recordBillPayment", error);
  return done();
}

/** Part of a contractor's advance set against one of their approved bills. */
export async function recoverAdvance(
  billId: string,
  input: { advanceId: string; amount: number; recoveredOn: string; note: string | null },
): Promise<ActionState> {
  const user = await requireTool("/bills");
  if (!input.advanceId) return { error: "Pick the advance to recover from." };
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { error: "The amount must be more than zero." };
  }
  if (!input.recoveredOn) return { error: "Pick the day." };

  const supabase = await createClient();
  const { error } = await supabase.from("advance_recoveries").insert({
    advance_id: input.advanceId,
    bill_id: billId,
    amount: Math.round(input.amount * 100) / 100,
    recovered_on: input.recoveredOn,
    note: input.note?.trim() || null,
    created_by: user.id,
    updated_by: user.id,
  });
  if (error) return refused("recoverAdvance", error);
  return done();
}

/** Money out to a contractor before any bill — from a cash request line, or directly. */
export async function recordAdvance(input: {
  vendorId: string;
  projectId: string;
  labourContractId: string | null;
  amount: number;
  paidOn: string;
  reference: string;
  note: string | null;
  cashRequestItemId?: string | null;
}): Promise<ActionState> {
  const user = await requireTool("/bills");
  if (!input.vendorId) return { error: "Pick the contractor." };
  if (!input.projectId) return { error: "Pick the project." };
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { error: "The amount must be more than zero." };
  }
  if (!cleanRef(input.reference)) return { error: "Type the UTR, cheque number or UPI reference." };
  if (!input.paidOn) return { error: "Pick the day it was paid." };

  const supabase = await createClient();
  const { error } = await supabase.from("contractor_advances").insert({
    vendor_id: input.vendorId,
    project_id: input.projectId,
    labour_contract_id: input.labourContractId || null,
    amount: Math.round(input.amount * 100) / 100,
    paid_on: input.paidOn,
    payment_ref: cleanRef(input.reference),
    note: input.note?.trim() || null,
    cash_request_item_id: input.cashRequestItemId ?? null,
    created_by: user.id,
    updated_by: user.id,
  });
  if (error) return refused("recordAdvance", error);
  return done();
}

/* ------------------------------------------------------------------ *
 * The weekly cash request
 * ------------------------------------------------------------------ */

/** A new draft request for the week a day falls in (its Monday). */
export async function createCashRequest(day: string): Promise<ActionState> {
  const user = await requireTool("/bills");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { error: "Pick the week." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("cash_requests")
    .insert({ week_of: mondayOf(day), created_by: user.id, updated_by: user.id })
    .select("id")
    .single();
  if (error) return refused("createCashRequest", error);
  revalidatePath("/bills", "layout");
  redirect(`/bills/cash-requests/${data.id}`);
}

/** Approved bills onto a draft request, each asking for an amount (default: what is pending). */
export async function addBillsToCashRequest(
  requestId: string,
  bills: { billId: string; amount: number }[],
): Promise<ActionState> {
  const user = await requireTool("/bills");
  if (bills.length === 0) return { error: "Tick the bills to add." };
  if (bills.some((bill) => !Number.isFinite(bill.amount) || bill.amount <= 0)) {
    return { error: "Every amount asked for must be more than zero." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("cash_request_items").insert(
    bills.map((bill) => ({
      cash_request_id: requestId,
      item_kind: "bill",
      bill_id: bill.billId,
      requested_amount: Math.round(bill.amount * 100) / 100,
      created_by: user.id,
      updated_by: user.id,
    })),
  );
  if (error) {
    if (error.code === "23505") return { error: "One of those bills is already on this request." };
    return refused("addBillsToCashRequest", error);
  }
  return done();
}

/** An advance onto a draft request: a contractor, a project, an amount. */
export async function addAdvanceToCashRequest(
  requestId: string,
  input: {
    vendorId: string;
    projectId: string;
    labourContractId: string | null;
    amount: number;
    note: string | null;
  },
): Promise<ActionState> {
  const user = await requireTool("/bills");
  if (!input.vendorId) return { error: "Pick the contractor." };
  if (!input.projectId) return { error: "Pick the project." };
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { error: "The advance must be more than zero." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("cash_request_items").insert({
    cash_request_id: requestId,
    item_kind: "advance",
    vendor_id: input.vendorId,
    project_id: input.projectId,
    labour_contract_id: input.labourContractId || null,
    requested_amount: Math.round(input.amount * 100) / 100,
    note: input.note?.trim() || null,
    created_by: user.id,
    updated_by: user.id,
  });
  if (error) return refused("addAdvanceToCashRequest", error);
  return done();
}

/** While drafting: what a line asks for. While with the approver: what is released for it. */
export async function setCashRequestAmount(
  itemId: string,
  input: { requested?: number; released?: number },
): Promise<ActionState> {
  const user = await requireTool("/bills");
  const amount = input.requested ?? input.released;
  if (amount === undefined || !Number.isFinite(amount) || amount < 0) {
    return { error: "Enter an amount of zero or more." };
  }
  if (input.requested !== undefined && input.requested <= 0) {
    return { error: "The amount asked for must be more than zero." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("cash_request_items")
    .update({
      ...(input.requested !== undefined
        ? { requested_amount: Math.round(input.requested * 100) / 100 }
        : { released_amount: Math.round((input.released ?? 0) * 100) / 100 }),
      updated_by: user.id,
    })
    .eq("id", itemId);
  if (error) return refused("setCashRequestAmount", error);
  return done();
}

export async function removeCashRequestItem(itemId: string): Promise<ActionState> {
  await requireTool("/bills");
  const supabase = await createClient();
  const { error } = await supabase.from("cash_request_items").delete().eq("id", itemId);
  if (error) return refused("removeCashRequestItem", error);
  return done();
}

export async function setCashRequestNote(requestId: string, note: string): Promise<ActionState> {
  const user = await requireTool("/bills");
  const supabase = await createClient();
  const { error } = await supabase
    .from("cash_requests")
    .update({ note: note.trim() || null, updated_by: user.id })
    .eq("id", requestId);
  if (error) return refused("setCashRequestNote", error);
  return done();
}

/** draft → submitted: to the bill approvers. */
export async function submitCashRequest(requestId: string): Promise<ActionState> {
  const user = await requireTool("/bills");
  const supabase = await createClient();
  const { error } = await supabase
    .from("cash_requests")
    .update({
      status: "submitted",
      submitted_by: user.id,
      submitted_at: new Date().toISOString(),
      sent_back_note: null,
      updated_by: user.id,
    })
    // No status filter: the guard's refusal beats a silent zero rows.
    .eq("id", requestId);
  if (error) return refused("submitCashRequest", error);
  return done();
}

/** submitted → released: a bill approver's yes; lines not cut go as asked. */
export async function releaseCashRequest(requestId: string): Promise<ActionState> {
  const user = await requireTool("/bills");
  const supabase = await createClient();
  const { error } = await supabase
    .from("cash_requests")
    .update({
      status: "released",
      released_by: user.id,
      released_at: new Date().toISOString(),
      updated_by: user.id,
    })
    .eq("id", requestId);
  if (error) return refused("releaseCashRequest", error);
  return done();
}

/** submitted → draft, with what needs changing. */
export async function sendBackCashRequest(requestId: string, note: string): Promise<ActionState> {
  const user = await requireTool("/bills");
  if (!note.trim()) return { error: "Say what needs changing." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("cash_requests")
    .update({ status: "draft", sent_back_note: note.trim(), updated_by: user.id })
    .eq("id", requestId);
  if (error) return refused("sendBackCashRequest", error);
  return done();
}

/** released → closed: the week is done. */
export async function closeCashRequest(requestId: string): Promise<ActionState> {
  const user = await requireTool("/bills");
  const supabase = await createClient();
  const { error } = await supabase
    .from("cash_requests")
    .update({ status: "closed", updated_by: user.id })
    .eq("id", requestId);
  if (error) return refused("closeCashRequest", error);
  return done();
}
