"use server";

import { requireTool } from "@/lib/auth/access";
import { dbErrorMessage } from "@/lib/db-error";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  GRANT,
  paymentsByOrder,
  plotSort,
  r2,
  type Order,
  type Payment,
  type Vendor,
} from "./ledger";
import { getLedger } from "./queries";
import {
  allocToSave,
  checkAmount,
  NEW_VENDOR,
  ORDER_FIELDS,
  parseAmount,
  scaleSplit,
  splitToSave,
  togglePlot,
  validateNewOrder,
  validateOrderField,
  validatePayment,
  validateSplit,
  vendorNameError,
  type Errors,
  type NewOrderDraft,
  type OrderField,
  type PaymentDraft,
} from "./rules";

/**
 * Kaadal Billing's saves. Anyone holding the grant edits the whole ledger (0169); the database stamps who. Each
 * save re-runs rules.ts on a fresh read, so the screen's checks are a convenience and these are the gate.
 */

/** What a save says back: `errors` by field, `warnings` to confirm, `note` for the undo line. */
export type Result =
  { error?: string; errors?: Errors; warnings?: string[]; id?: string; note?: string } | undefined;

const refresh = () => revalidatePath("/kaadal-billing", "layout");

function failed(error: { message: string; code?: string }, fallback: string): Result {
  if (error.code === "23505") return { error: "That vendor is already on the list." };
  if (error.code === "23503")
    return { error: "That vendor still has orders, so it can't be deleted." };
  console.error(`kaadal-billing: ${fallback}`, error);
  return { error: dbErrorMessage(error, fallback) };
}

async function context(orderId: string) {
  const ledger = await getLedger();
  const order = ledger.orders.find((o) => o.id === orderId) ?? null;
  const pays = order ? (paymentsByOrder(ledger.payments).get(order.id) ?? []) : [];
  return { ledger, order, pays };
}

const GONE = { error: "That order is no longer there. It may have been deleted." };

// ---------------------------------------------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------------------------------------------

/** Records or updates one payment. Warnings come back unsaved until `confirmed` ("Save anyway"). */
export async function savePayment(
  orderId: string,
  draft: PaymentDraft,
  confirmed: boolean,
): Promise<Result> {
  const { ledger, order, pays } = await context(orderId);
  if (!order) return GONE;
  if (draft.id && !pays.some((p) => p.id === draft.id))
    return { error: "That payment is no longer on this order." };
  const { errors, warnings } = validatePayment(order, pays, draft, ledger.today);
  if (Object.keys(errors).length) return { errors };
  if (warnings.length && !confirmed) return { warnings };

  const row = {
    amount: parseAmount(draft.amount),
    paid_on: draft.paidOn,
    paid_by: draft.paidBy,
    kind: draft.kind,
    alloc: allocToSave(order, draft),
    reference: draft.reference.trim(),
    notes: draft.notes.trim(),
  };
  const supabase = await createClient();
  if (draft.id) {
    const { data, error } = await supabase
      .from("kaadal_billing_payments")
      .update(row)
      .eq("id", draft.id)
      .select("id");
    if (error) return failed(error, "Couldn't save that change. Try again.");
    if (!data?.length) return { error: "That payment is no longer there." };
    refresh();
    return { id: draft.id };
  }
  const { data, error } = await supabase
    .from("kaadal_billing_payments")
    .insert({ order_id: order.id, ...row })
    .select("id")
    .single();
  if (error) return failed(error, "Couldn't save the payment. Try again.");
  refresh();
  return { id: data.id };
}

export async function deletePayment(paymentId: string): Promise<Result> {
  await requireTool(GRANT);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("kaadal_billing_payments")
    .delete()
    .eq("id", paymentId)
    .select("id");
  if (error) return failed(error, "Couldn't delete the payment. Try again.");
  if (!data?.length) return { error: "That payment is no longer there." };
  refresh();
  return undefined;
}

/** Undo of a delete: the same payment back under its own id. */
export async function restorePayment(payment: Payment): Promise<Result> {
  const { order } = await context(payment.orderId);
  if (!order) return GONE;
  if (checkAmount(String(payment.amount))) return { error: "That payment can't be put back." };
  const supabase = await createClient();
  const { error } = await supabase.from("kaadal_billing_payments").insert(paymentRow(payment));
  if (error) return failed(error, "Couldn't put the payment back.");
  refresh();
  return undefined;
}

const paymentRow = (p: Payment) => ({
  id: p.id,
  order_id: p.orderId,
  amount: r2(p.amount),
  paid_on: p.paidOn,
  paid_by: p.paidBy,
  kind: p.kind,
  alloc: p.alloc,
  reference: p.reference,
  notes: p.notes,
  created_at: p.createdAt,
});

// ---------------------------------------------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------------------------------------------

/** A new order, with its new vendor and its advance if given; then the order's own page. */
export async function createOrder(draft: NewOrderDraft): Promise<Result> {
  const ledger = await getLedger();
  const errors = validateNewOrder(draft, ledger.vendors, ledger.today);
  if (Object.keys(errors).length) return { errors };
  const supabase = await createClient();
  const gross = parseAmount(draft.gross);
  const advance = parseAmount(draft.advance);

  let vendorId = draft.vendorId;
  let madeVendor = false;
  if (vendorId === NEW_VENDOR) {
    const { data, error } = await supabase
      .from("kaadal_billing_vendors")
      .insert({ name: draft.newVendor.trim(), bank: draft.bank.trim() })
      .select("id")
      .single();
    if (error) return failed(error, "Couldn't add the vendor. Try again.");
    vendorId = data.id;
    madeVendor = true;
  }
  const plots = draft.plots.slice().sort(plotSort);
  const { data: made, error } = await supabase
    .from("kaadal_billing_orders")
    .insert({
      vendor_id: vendorId,
      plots,
      gross,
      split: splitToSave(plots, draft.split),
      item: draft.item.trim(),
      pay_note: draft.payNote.trim(),
      notes: draft.notes.trim(),
      ordered_on: draft.orderedOn || null,
    })
    .select("id")
    .single();
  // Nothing else hangs off a vendor made a moment ago, so taking it back is safe (BUGCATCHER #25).
  const undoVendor = async () => {
    if (!madeVendor) return;
    const { error: back } = await supabase
      .from("kaadal_billing_vendors")
      .delete()
      .eq("id", vendorId);
    if (back) console.error("kaadal-billing: a new vendor was left behind", back);
  };
  if (error) {
    await undoVendor();
    return failed(error, "Couldn't save the order. Try again.");
  }
  if (advance > 0) {
    const { error: advanceError } = await supabase.from("kaadal_billing_payments").insert({
      order_id: made.id,
      amount: advance,
      paid_on: draft.advanceOn,
      paid_by: draft.advanceBy,
      kind: advance >= gross ? "Full payment" : "Advance",
    });
    if (advanceError) {
      const { error: back } = await supabase
        .from("kaadal_billing_orders")
        .delete()
        .eq("id", made.id);
      if (back) console.error("kaadal-billing: an order without its advance was left behind", back);
      else await undoVendor();
      return failed(
        advanceError,
        "Couldn't save the advance, so the order wasn't saved. Try again.",
      );
    }
  }
  refresh();
  redirect(`/kaadal-billing/orders/${made.id}`);
}

function orderPatch(field: OrderField, value: string): TablesUpdate<"kaadal_billing_orders"> {
  switch (field) {
    case "vendorId":
      return { vendor_id: value };
    case "orderedOn":
      return { ordered_on: value || null };
    case "gross":
      return { gross: parseAmount(value) };
    case "deduction":
      return { deduction: parseAmount(value) };
    case "deductionPlot":
      return { deduction_plot: value || null };
    case "deductionNote":
      return { deduction_note: value };
    case "payNote":
      return { pay_note: value };
    case "item":
      return { item: value };
    case "notes":
      return { notes: value };
  }
}

/** One field of an order, saved as the person leaves it. A new order value scales the plot values with it. */
export async function updateOrderField(
  orderId: string,
  field: OrderField,
  raw: string,
): Promise<Result> {
  if (!ORDER_FIELDS.includes(field)) return { error: "That can't be changed here." };
  const { ledger, order, pays } = await context(orderId);
  if (!order) return GONE;
  const value = field === "notes" ? raw : raw.trim();
  const error = validateOrderField(order, pays, field, value, ledger.vendors, ledger.today);
  if (error) return { error };

  const patch = orderPatch(field, value);
  let note: string | undefined;
  if (field === "gross" && order.plots.length > 1 && Object.keys(order.split).length) {
    patch.split = scaleSplit(order, parseAmount(value));
    note = "Order value changed. Plot values were scaled to match.";
  }
  const supabase = await createClient();
  const { data, error: saveError } = await supabase
    .from("kaadal_billing_orders")
    .update(patch)
    .eq("id", order.id)
    .select("id");
  if (saveError) return failed(saveError, "Couldn't save that change. Try again.");
  if (!data?.length) return GONE;
  refresh();
  return { note };
}

/** The plot values from the quote; `null` clears them (split evenly). */
export async function saveSplit(
  orderId: string,
  typed: Record<string, string> | null,
): Promise<Result> {
  const { order } = await context(orderId);
  if (!order) return GONE;
  let split = {};
  if (typed) {
    const errors = validateSplit(order, typed);
    if (Object.keys(errors).length) return { errors };
    split = Object.fromEntries(order.plots.map((p) => [p, parseAmount(typed[p])]));
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("kaadal_billing_orders")
    .update({ split })
    .eq("id", order.id);
  if (error) return failed(error, "Couldn't save the plot values. Try again.");
  refresh();
  return undefined;
}

export async function toggleOrderPlot(orderId: string, plot: string): Promise<Result> {
  const { order, pays } = await context(orderId);
  if (!order) return GONE;
  const next = togglePlot(order, pays, plot);
  if ("error" in next) return { error: next.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("kaadal_billing_orders")
    .update({ plots: next.plots, split: next.split, deduction_plot: next.deductionPlot })
    .eq("id", order.id);
  if (error) return failed(error, "Couldn't change the plots. Try again.");
  refresh();
  return {
    note: next.splitCleared
      ? "Plots changed, so the plot values were cleared. Enter them again below."
      : undefined,
  };
}

/** One statement: the database takes the order's payments with it (0169's cascade). */
export async function deleteOrder(orderId: string): Promise<Result> {
  await requireTool(GRANT);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("kaadal_billing_orders")
    .delete()
    .eq("id", orderId)
    .select("id");
  if (error) return failed(error, "Couldn't delete the order. Try again.");
  if (!data?.length) return GONE;
  refresh();
  return undefined;
}

/** Undo of a delete: the order and its payments back under their own ids, or nothing. */
export async function restoreOrder(order: Order, payments: Payment[]): Promise<Result> {
  const ledger = await getLedger();
  if (!ledger.vendors.some((v) => v.id === order.vendorId))
    return { error: "That order's vendor is gone, so it can't be put back." };
  const supabase = await createClient();
  const { error } = await supabase.from("kaadal_billing_orders").insert({
    id: order.id,
    vendor_id: order.vendorId,
    plots: order.plots,
    gross: r2(order.gross),
    split: order.split,
    deduction: r2(order.deduction),
    deduction_plot: order.deductionPlot,
    deduction_note: order.deductionNote,
    item: order.item,
    pay_note: order.payNote,
    notes: order.notes,
    ordered_on: order.orderedOn,
    created_at: order.createdAt,
  });
  if (error) return failed(error, "Couldn't put the order back.");
  const own = payments.filter((p) => p.orderId === order.id);
  if (own.length) {
    const { error: payError } = await supabase
      .from("kaadal_billing_payments")
      .insert(own.map(paymentRow));
    if (payError) {
      const { error: back } = await supabase
        .from("kaadal_billing_orders")
        .delete()
        .eq("id", order.id);
      if (back) console.error("kaadal-billing: a restored order lost its payments", back);
      return failed(payError, "Couldn't put the order's payments back.");
    }
  }
  refresh();
  return undefined;
}

// ---------------------------------------------------------------------------------------------------------------
// Vendors
// ---------------------------------------------------------------------------------------------------------------

export async function updateVendor(
  vendorId: string,
  field: "name" | "bank",
  value: string,
): Promise<Result> {
  const ledger = await getLedger();
  if (!ledger.vendors.some((v) => v.id === vendorId))
    return { error: "That vendor is no longer there." };
  const next = value.trim();
  if (field === "name") {
    const error = vendorNameError(next, ledger.vendors, vendorId);
    if (error) return { error };
  } else if (next.length > 1000) return { error: "Keep the bank details under 1,000 characters." };
  else if (field !== "bank") return { error: "That can't be changed here." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("kaadal_billing_vendors")
    .update(field === "name" ? { name: next } : { bank: next })
    .eq("id", vendorId)
    .select("id");
  if (error) return failed(error, "Couldn't save the vendor. Try again.");
  if (!data?.length) return { error: "That vendor is no longer there." };
  refresh();
  return undefined;
}

/** Refused by the database while the vendor has orders (0169's restrict), so nothing is deleted in steps. */
export async function deleteVendor(vendorId: string): Promise<Result> {
  await requireTool(GRANT);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("kaadal_billing_vendors")
    .delete()
    .eq("id", vendorId)
    .select("id");
  if (error) return failed(error, "Couldn't delete the vendor. Try again.");
  if (!data?.length) return { error: "That vendor is no longer there." };
  refresh();
  return undefined;
}

export async function restoreVendor(vendor: Vendor): Promise<Result> {
  const ledger = await getLedger();
  const error = vendorNameError(vendor.name, ledger.vendors, null);
  if (error) return { error };
  const supabase = await createClient();
  const { error: saveError } = await supabase
    .from("kaadal_billing_vendors")
    .insert({ id: vendor.id, name: vendor.name, bank: vendor.bank });
  if (saveError) return failed(saveError, "Couldn't put the vendor back.");
  refresh();
  return undefined;
}
