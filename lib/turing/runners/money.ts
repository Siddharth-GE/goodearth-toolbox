import "server-only";

import { recordBillPayment, recoverAdvance, reverseBillMoney } from "@/lib/bills/payment-actions";
import {
  cancelMovement,
  createFacility,
  deleteFacility,
  recordMovement,
  setFacilityActive,
  updateFacility,
} from "@/lib/financial-management/actions";
import { createClient } from "@/lib/supabase/server";

import { entryFor, formOf } from "../catalogue-fields";
import type { MONEY } from "../entries/money";
import { failed, recordNow, saving, type Runners, type Values } from "./kit";

type Failure = { error: string };

const formFor = (key: string, values: Values, now?: Record<string, unknown>) => {
  const entry = entryFor(key);
  return entry ? formOf(entry, values, now) : new FormData();
};

const FACILITY = [
  "party",
  "kind",
  "interest_rate_pct",
  "start_date",
  "sanctioned_amount",
  "terms",
] as const;

/** A bill the screen takes money on: approved (its panel shows only then). */
async function billTakesMoney(billId: string): Promise<{ vendorId: string | null } | Failure> {
  const bill = await recordNow(
    "bills",
    { column: "id", id: billId },
    ["status", "vendor_id"],
    "That bill is gone.",
  );
  if ("error" in bill) return bill;
  if (bill.row.status !== "approved")
    return {
      error:
        bill.row.status === "paid"
          ? "That bill is paid in full."
          : "Money goes out only against an approved bill.",
    };
  return { vendorId: (bill.row.vendor_id as string | null) ?? null };
}

const REVERSIBLE = {
  payment_id: { table: "bill_payments", kind: "payment", noun: "payment" },
  advance_id: { table: "contractor_advances", kind: "advance", noun: "advance" },
  recovery_id: { table: "advance_recoveries", kind: "recovery", noun: "recovery" },
} as const;

/** Each money entry, run through Bills' or Financial Management's own action, as the admin. */
export const MONEY_RUNNERS: Runners<(typeof MONEY)[number]["key"]> = {
  bill_payment: async (v) => {
    const billId = String(v.bill_id);
    const bill = await billTakesMoney(billId);
    if ("error" in bill) return bill;
    // The same reference twice on one bill is one payment entered twice, as a statement read twice would give.
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("bill_payments")
      .select("id")
      .eq("bill_id", billId)
      .eq("payment_ref", String(v.reference))
      .is("reverses_id", null);
    if (error) return failed("payments", error);
    const ids = (data ?? []).map((row) => row.id);
    if (ids.length > 0) {
      const { count, error: reversedError } = await supabase
        .from("bill_payments")
        .select("id", { count: "exact", head: true })
        .in("reverses_id", ids);
      if (reversedError) return failed("payments", reversedError);
      if ((count ?? 0) < ids.length)
        return {
          error: `A payment with reference ${String(v.reference)} is already on this bill.`,
        };
    }
    return recordBillPayment(billId, {
      amount: Number(v.amount),
      paidOn: String(v.paid_on),
      reference: String(v.reference),
      note: v.note ? String(v.note) : null,
    });
  },
  bill_recovery: async (v) => {
    const bill = await billTakesMoney(String(v.bill_id));
    if ("error" in bill) return bill;
    return recoverAdvance(String(v.bill_id), {
      advanceId: String(v.advance_id),
      amount: Number(v.amount),
      recoveredOn: String(v.recovered_on),
      note: v.note ? String(v.note) : null,
    });
  },
  money_reverse: async (v) => {
    const key = (Object.keys(REVERSIBLE) as (keyof typeof REVERSIBLE)[]).find((one) => v[one]);
    if (!key) return { error: "Name a payment, advance or recovery." };
    const { table, kind, noun } = REVERSIBLE[key];
    const id = String(v[key]);
    const now = await recordNow(
      table,
      { column: "id", id },
      ["reverses_id"],
      `That ${noun} is gone.`,
    );
    if ("error" in now) return now;
    if (now.row.reverses_id) return { error: "A reversal is never itself reversed." };
    return reverseBillMoney(kind, id, String(v.reason));
  },
  facility_new: async (v) => {
    const done = await saving(
      () => createFacility(undefined, formFor("facility_new", v)),
      "/financial-management/funding/",
    );
    return "error" in done ? done : undefined;
  },
  facility_change: async (v) => {
    const id = String(v.facility_id);
    const now = await recordNow(
      "funding_facilities",
      { column: "id", id },
      [...FACILITY],
      "That facility is gone.",
    );
    if ("error" in now) return now;
    const same = (key: (typeof FACILITY)[number]) => {
      if (!(key in v)) return true;
      const was = now.row[key];
      if (v[key] === "") return was === null;
      return typeof was === "number" ? Number(v[key]) === was : v[key] === was;
    };
    if (FACILITY.every(same)) return { error: "The facility already says that." };
    return updateFacility(id, undefined, formFor("facility_change", v, now.row));
  },
  facility_active: async (v) => {
    const id = String(v.facility_id);
    const now = await recordNow(
      "funding_facilities",
      { column: "id", id },
      ["is_active"],
      "That facility is gone.",
    );
    if ("error" in now) return now;
    if (now.row.is_active === v.active)
      return { error: `That facility is already ${v.active ? "open" : "closed"}.` };
    return setFacilityActive(id, v.active === true);
  },
  facility_delete: async (v) => {
    const id = String(v.facility_id);
    // The delete says nothing when no row matched, so a facility already gone is said here.
    const now = await recordNow(
      "funding_facilities",
      { column: "id", id },
      ["id"],
      "That facility is gone.",
    );
    if ("error" in now) return now;
    const done = await saving(() => deleteFacility(id), "/financial-management/funding");
    return "error" in done ? done : undefined;
  },
  funding_movement: async (v) => {
    const id = String(v.facility_id);
    const now = await recordNow(
      "funding_facilities",
      { column: "id", id },
      ["id"],
      "That facility is gone.",
    );
    if ("error" in now) return now;
    return recordMovement(id, undefined, formFor("funding_movement", v));
  },
  funding_movement_cancel: async (v) => {
    const now = await recordNow(
      "funding_movements",
      { column: "id", id: String(v.movement_id) },
      ["facility_id", "cancelled_at"],
      "That movement is gone.",
    );
    if ("error" in now) return now;
    if (now.row.cancelled_at) return { error: "That movement is cancelled already." };
    return cancelMovement(String(v.movement_id), String(now.row.facility_id), String(v.reason));
  },
};
