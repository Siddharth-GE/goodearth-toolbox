"use server";

// Type-only, never re-exported from a "use server" file (npm run check:actions).
import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { dbErrorMessage } from "@/lib/db-error";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { mondayOf, type MoneyKind } from "./ledger";
import { roundPaise } from "@/lib/line-money";

// Rules live in the database: bill_settlement_guard (money only against an approved bill, never past its total; an advance, to a contractor or a supplier, only from the same vendor's bills and never past what is left), the paid-in-full trigger, and the cash-request guards.
// Money is append-only: a mistake is reversed (0147), never edited or deleted. Each guard's refusal is written for a person, so it is passed on as is.

const done = (): ActionState => {
  revalidatePath("/bills", "layout");
  return undefined;
};

const refused = (where: string, error: { message: string } | null): ActionState => {
  console.error(`${where} failed:`, error);
  return { error: dbErrorMessage(error ?? { message: "" }, "Could not save. Try again.") };
};

const cleanRef = (value: string) => value.trim();

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
    amount: roundPaise(input.amount),
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
    amount: roundPaise(input.amount),
    recovered_on: input.recoveredOn,
    note: input.note?.trim() || null,
    created_by: user.id,
    updated_by: user.id,
  });
  if (error) return refused("recoverAdvance", error);
  return done();
}

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
  if (!input.vendorId) return { error: "Pick the contractor or supplier." };
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
    amount: roundPaise(input.amount),
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

/** An equal entry the other way, with the reason; money_reversal_guard (0147) checks the approver and copies the rest. */
export async function reverseBillMoney(
  kind: MoneyKind,
  id: string,
  reason: string,
): Promise<ActionState> {
  await requireTool("/bills");
  if (!reason.trim()) return { error: "Say why it is reversed." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("reverse_bill_money", {
    p_kind: kind,
    p_id: id,
    p_reason: reason.trim(),
  });
  if (error) {
    if (error.code === "23505") return { error: "This was reversed already." };
    return refused("reverseBillMoney", error);
  }
  return done();
}

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
      requested_amount: roundPaise(bill.amount),
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
  if (!input.vendorId) return { error: "Pick the contractor or supplier." };
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
    requested_amount: roundPaise(input.amount),
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
        ? { requested_amount: roundPaise(input.requested) }
        : { released_amount: roundPaise(input.released ?? 0) }),
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

export async function sendBackCashRequest(requestId: string, note: string): Promise<ActionState> {
  const user = await requireTool("/bills");
  if (!note.trim()) return { error: "Say what needs changing." };
  const supabase = await createClient();
  // The approver's cuts go back with it: a draft can't clear them, and the next release keeps any left.
  const { error: cutsError } = await supabase
    .from("cash_request_items")
    .update({ released_amount: null, updated_by: user.id })
    .eq("cash_request_id", requestId)
    .not("released_amount", "is", null);
  if (cutsError) return refused("sendBackCashRequest", cutsError);
  const { error } = await supabase
    .from("cash_requests")
    .update({ status: "draft", sent_back_note: note.trim(), updated_by: user.id })
    .eq("id", requestId);
  if (error) return refused("sendBackCashRequest", error);
  return done();
}

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

// Only a draft goes, with its lines (0144); a submitted one comes back to draft through its approver first.
export async function deleteCashRequest(requestId: string): Promise<ActionState> {
  await requireTool("/bills");
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_draft_cash_request", { p_request_id: requestId });
  if (error) return refused("deleteCashRequest", error);
  revalidatePath("/bills", "layout");
  redirect("/bills/cash-requests");
}
