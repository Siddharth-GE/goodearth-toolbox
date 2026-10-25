import "server-only";

import {
  addAdvanceToCashRequest,
  addBillsToCashRequest,
  closeCashRequest,
  createCashRequest,
  deleteCashRequest,
  recordAdvance,
  recordBillPayment,
  releaseCashRequest,
  removeCashRequestItem,
  sendBackCashRequest,
  setCashRequestAmount,
  setCashRequestNote,
  submitCashRequest,
} from "@/lib/bills/payment-actions";
import { createClient } from "@/lib/supabase/server";

import { leftToPay, STEPS, type CASH_REQUESTS } from "../entries/cash-requests";
import { failed, recordNow, saving, type Runners } from "./kit";
import { referenceTaken } from "./money";

type Failure = { error: string };

const STATUS_WORDS: Record<string, string> = {
  draft: "a draft",
  submitted: "with the approver",
  released: "released",
  closed: "closed",
};

const DONE: Record<keyof typeof STEPS, string> = {
  submit: "submitted",
  release: "released",
  send_back: "sent back",
  close: "closed",
};

async function requestNow(requestId: string) {
  return recordNow(
    "cash_requests",
    { column: "id", id: requestId },
    ["status", "note"],
    "That cash request is gone.",
  );
}

/** Lines go on and off, and asked-for amounts change, only on a draft, as the board offers. */
async function draft(requestId: string): Promise<Failure | null> {
  const now = await requestNow(requestId);
  if ("error" in now) return now;
  return now.row.status === "draft"
    ? null
    : {
        error: `That cash request is ${STATUS_WORDS[String(now.row.status)] ?? "past its draft"}; lines change only on a draft.`,
      };
}

async function lineNow(itemId: string) {
  const line = await recordNow(
    "cash_request_items",
    { column: "id", id: itemId },
    [
      "cash_request_id",
      "item_kind",
      "bill_id",
      "vendor_id",
      "project_id",
      "requested_amount",
      "released_amount",
      "note",
    ],
    "That cash request line is gone.",
  );
  if ("error" in line) return line;
  const request = await requestNow(String(line.row.cash_request_id));
  if ("error" in request) return request;
  return { line: line.row, status: String(request.row.status) };
}

/** What a bill still has pending: its total less every payment and recovery, reversals included. */
async function pendingOf(billId: string): Promise<{ pending: number } | Failure> {
  const supabase = await createClient();
  const [bill, payments, recoveries] = await Promise.all([
    supabase.from("bills").select("status, total_amount").eq("id", billId).maybeSingle(),
    supabase.from("bill_payments").select("amount").eq("bill_id", billId),
    supabase.from("advance_recoveries").select("amount").eq("bill_id", billId),
  ]);
  if (bill.error) return failed("bill", bill.error);
  if (payments.error) return failed("payments", payments.error);
  if (recoveries.error) return failed("recoveries", recoveries.error);
  if (!bill.data) return { error: "That bill is gone." };
  if (bill.data.status !== "approved")
    return { error: "Only an approved bill goes on a cash request." };
  const settled = [...(payments.data ?? []), ...(recoveries.data ?? [])].reduce(
    (sum, row) => sum + Number(row.amount),
    0,
  );
  return { pending: Math.round((Number(bill.data.total_amount) - settled) * 100) / 100 };
}

/** What is paid against a line already: its payments or advances, reversals included. */
async function paidOn(itemId: string): Promise<{ paid: number } | Failure> {
  const supabase = await createClient();
  const [payments, advances] = await Promise.all([
    supabase.from("bill_payments").select("amount").eq("cash_request_item_id", itemId),
    supabase.from("contractor_advances").select("amount").eq("cash_request_item_id", itemId),
  ]);
  if (payments.error) return failed("payments", payments.error);
  if (advances.error) return failed("advances", advances.error);
  return {
    paid: [...(payments.data ?? []), ...(advances.data ?? [])].reduce(
      (sum, row) => sum + Number(row.amount),
      0,
    ),
  };
}

/** Each cash request entry, run through Bills' own action, as the admin. */
export const CASH_REQUEST_RUNNERS: Runners<(typeof CASH_REQUESTS)[number]["key"]> = {
  cash_request_new: async (v) => {
    const done = await saving(() => createCashRequest(String(v.week_of)), "/bills/cash-requests/");
    return "error" in done ? done : undefined;
  },
  cash_request_bill: async (v) => {
    const refused = await draft(String(v.request_id));
    if (refused) return refused;
    // The board lists only approved bills with something pending.
    const bill = await pendingOf(String(v.bill_id));
    if ("error" in bill) return bill;
    if (bill.pending <= 0) return { error: "That bill has nothing pending." };
    return addBillsToCashRequest(String(v.request_id), [
      { billId: String(v.bill_id), amount: Number(v.amount) },
    ]);
  },
  cash_request_advance: async (v) => {
    const refused = await draft(String(v.request_id));
    if (refused) return refused;
    if (v.work_order_id) {
      // The board offers only that vendor's approved work orders on that project.
      const order = await recordNow(
        "labour_contracts",
        { column: "id", id: String(v.work_order_id) },
        ["vendor_id", "project_id", "status"],
        "That work order is gone.",
      );
      if ("error" in order) return order;
      if (order.row.status !== "approved") return { error: "That work order is not approved." };
      if (order.row.vendor_id !== v.vendor_id || order.row.project_id !== v.project_id)
        return { error: "That work order is another vendor's or another project's." };
    }
    return addAdvanceToCashRequest(String(v.request_id), {
      vendorId: String(v.vendor_id),
      projectId: String(v.project_id),
      labourContractId: v.work_order_id ? String(v.work_order_id) : null,
      amount: Number(v.amount),
      note: v.note ? String(v.note) : null,
    });
  },
  cash_request_amount: async (v) => {
    const now = await lineNow(String(v.item_id));
    if ("error" in now) return now;
    const amount = Number(v.amount);
    if (now.status === "draft") {
      if (amount === Number(now.line.requested_amount))
        return { error: "That line already asks for that." };
      return setCashRequestAmount(String(v.item_id), { requested: amount });
    }
    if (now.status === "submitted") {
      const released = Number(now.line.released_amount ?? now.line.requested_amount);
      if (amount === released) return { error: "That line is already released at that." };
      return setCashRequestAmount(String(v.item_id), { released: amount });
    }
    return {
      error: `That cash request is ${STATUS_WORDS[now.status] ?? "closed"}; its amounts no longer change.`,
    };
  },
  cash_request_line_remove: async (v) => {
    const now = await lineNow(String(v.item_id));
    if ("error" in now) return now;
    if (now.status !== "draft")
      return { error: "Lines come off only while the request is a draft." };
    return removeCashRequestItem(String(v.item_id));
  },
  cash_request_note: async (v) => {
    const now = await requestNow(String(v.request_id));
    if ("error" in now) return now;
    if (now.row.status !== "draft")
      return { error: "A cash request's note changes only while it is a draft." };
    if (String(v.note) === String(now.row.note ?? ""))
      return { error: "The request already has that note." };
    return setCashRequestNote(String(v.request_id), String(v.note));
  },
  cash_request_step: async (v) => {
    const id = String(v.request_id);
    const now = await requestNow(id);
    if ("error" in now) return now;
    const step = v.step as keyof typeof STEPS;
    if (now.row.status !== STEPS[step])
      return {
        error: `That cash request is ${STATUS_WORDS[String(now.row.status)] ?? String(now.row.status)}, so it can't be ${DONE[step]} now.`,
      };
    if (step === "submit") return submitCashRequest(id);
    if (step === "release") return releaseCashRequest(id);
    if (step === "send_back") return sendBackCashRequest(id, String(v.note));
    return closeCashRequest(id);
  },
  cash_request_delete: async (v) => {
    const id = String(v.request_id);
    const refused = await draft(id);
    if (refused)
      return {
        error: "Only a draft cash request is deleted; a submitted one is sent back to draft first.",
      };
    const done = await saving(() => deleteCashRequest(id), "/bills/cash-requests");
    return "error" in done ? done : undefined;
  },
  cash_request_pay: async (v) => {
    const itemId = String(v.item_id);
    const now = await lineNow(itemId);
    if ("error" in now) return now;
    if (now.status !== "released")
      return { error: "A cash request line is paid only once the request is released." };
    const paid = await paidOn(itemId);
    if ("error" in paid) return paid;
    const amount = Number(v.amount);
    const cap = leftToPay(now.line.released_amount as number | null, paid.paid);
    if (cap <= 0) return { error: "That line is paid in full." };
    if (amount > cap + 0.005)
      return { error: `That is more than is left to pay on this line (₹${cap.toFixed(2)}).` };
    const reference = String(v.reference);
    if (now.line.item_kind === "bill") {
      const billId = String(now.line.bill_id);
      const taken = await referenceTaken(billId, reference);
      if (taken) return taken;
      return recordBillPayment(billId, {
        amount,
        paidOn: String(v.paid_on),
        reference,
        note: null,
        cashRequestItemId: itemId,
      });
    }
    // As the board gives an advance: the line's vendor, project and note.
    return recordAdvance({
      vendorId: String(now.line.vendor_id ?? ""),
      projectId: String(now.line.project_id ?? ""),
      labourContractId: null,
      amount,
      paidOn: String(v.paid_on),
      reference,
      note: (now.line.note as string | null) ?? null,
      cashRequestItemId: itemId,
    });
  },
};
