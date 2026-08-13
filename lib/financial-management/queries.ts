import "server-only";

import { requireTool } from "@/lib/auth/access";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import { cache } from "react";
import type { DatedAmount } from "./cashflow";
import { facilityPosition, todayInIndia, type FacilityPosition } from "./interest";
import type { FacilityKind, MovementKind } from "./kinds";

/**
 * Reads for Financial Management.
 *
 * Every function opens with `requireTool("/financial-management")` — the
 * 0058 policies gate SELECT as well as writes, so an ungranted user
 * would get an empty list rather than an error, which reads as "no
 * facilities yet" instead of "not for you". The explicit check redirects
 * them instead of lying (the Business Planning reasoning, kept).
 *
 * The funding reads touch ONLY the tool's own tables plus shared
 * `profiles`. The cross-tool money views (`crm_receipt_facts`,
 * `bill_money_facts`, `business_plan_target_facts`) enter in the Cash
 * and Forward queries, never here.
 */

export type FacilityRow = {
  id: string;
  party: string;
  kind: FacilityKind;
  interestRatePct: number | null;
  startDate: string | null;
  sanctionedAmount: number | null;
  terms: string | null;
  isActive: boolean;
  movementCount: number;
  position: FacilityPosition;
};

export type MovementRow = {
  id: string;
  kind: MovementKind;
  amount: number;
  happenedOn: string;
  reference: string | null;
  note: string | null;
  createdAt: string;
  recordedByName: string | null;
};

export type FacilityDetail = FacilityRow & {
  movements: MovementRow[];
};

/**
 * Every facility with its computed position, active first.
 *
 * fetchAll on both tables: facilities are counted in tens, movements in
 * hundreds, but a silent 1,000-row cap would one day drop a movement and
 * quietly misstate a balance — the one failure a money screen must not
 * have.
 */
export async function listFacilities(): Promise<FacilityRow[]> {
  await requireTool("/financial-management");
  const supabase = await createClient();

  const [facilities, movements] = await Promise.all([
    fetchAll((from, to) =>
      supabase
        .from("funding_facilities")
        .select(
          "id, party, kind, interest_rate_pct, start_date, sanctioned_amount, terms, is_active",
        )
        .order("is_active", { ascending: false })
        .order("party")
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("funding_movements")
        .select("facility_id, kind, amount, happened_on")
        .order("id")
        .range(from, to),
    ),
  ]);

  const byFacility = new Map<
    string,
    { kind: MovementKind; amount: number; happenedOn: string }[]
  >();
  for (const movement of movements) {
    const list = byFacility.get(movement.facility_id) ?? [];
    list.push({
      kind: movement.kind as MovementKind,
      amount: movement.amount,
      happenedOn: movement.happened_on,
    });
    byFacility.set(movement.facility_id, list);
  }

  const today = todayInIndia();
  return facilities.map((facility) => {
    const own = byFacility.get(facility.id) ?? [];
    return {
      id: facility.id,
      party: facility.party,
      kind: facility.kind as FacilityKind,
      interestRatePct: facility.interest_rate_pct,
      startDate: facility.start_date,
      sanctionedAmount: facility.sanctioned_amount,
      terms: facility.terms,
      isActive: facility.is_active,
      movementCount: own.length,
      position: facilityPosition(own, facility.interest_rate_pct, today),
    };
  });
}

/**
 * One facility with its full movement ledger, newest first.
 *
 * Returns null for "no such facility" AND for "not visible to you" —
 * RLS makes those indistinguishable, and both end at notFound().
 */
export const getFacility = cache(async (facilityId: string): Promise<FacilityDetail | null> => {
  await requireTool("/financial-management");
  const supabase = await createClient();

  const { data: facility, error } = await supabase
    .from("funding_facilities")
    .select("id, party, kind, interest_rate_pct, start_date, sanctioned_amount, terms, is_active")
    .eq("id", facilityId)
    .maybeSingle();

  if (error) {
    console.error("getFacility failed:", error);
    return null;
  }
  if (!facility) return null;

  const movements = await fetchAll((from, to) =>
    supabase
      .from("funding_movements")
      .select("id, kind, amount, happened_on, reference, note, created_at, created_by")
      .eq("facility_id", facilityId)
      .order("happened_on", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to),
  );

  const names = await lookupNames(movements.map((movement) => movement.created_by));

  const inputs = movements.map((movement) => ({
    kind: movement.kind as MovementKind,
    amount: movement.amount,
    happenedOn: movement.happened_on,
  }));

  return {
    id: facility.id,
    party: facility.party,
    kind: facility.kind as FacilityKind,
    interestRatePct: facility.interest_rate_pct,
    startDate: facility.start_date,
    sanctionedAmount: facility.sanctioned_amount,
    terms: facility.terms,
    isActive: facility.is_active,
    movementCount: movements.length,
    position: facilityPosition(inputs, facility.interest_rate_pct, todayInIndia()),
    movements: movements.map((movement) => ({
      id: movement.id,
      kind: movement.kind as MovementKind,
      amount: movement.amount,
      happenedOn: movement.happened_on,
      reference: movement.reference,
      note: movement.note,
      createdAt: movement.created_at,
      recordedByName: movement.created_by ? (names.get(movement.created_by) ?? null) : null,
    })),
  };
});

export type CashPosition = {
  /** Client money received — every receipt, from crm_receipt_facts. */
  collections: DatedAmount[];
  /** Bills actually paid, dated by paid_at. */
  billsPaid: DatedAmount[];
  /** Approved and waiting to be paid — the near-term payables figure. */
  approvedUnpaidTotal: number;
  approvedUnpaidCount: number;
  /** The tool's own ledger, split by kind. */
  drawdowns: DatedAmount[];
  repayments: DatedAmount[];
  interestPaid: DatedAmount[];
};

/**
 * Everything the Cash screen adds up, raw — the bucketing and chart
 * shaping stay in the pure cashflow.ts where the tests are.
 *
 * The two cross-tool reads go through the 0058 views (`crm_receipt_facts`,
 * `bill_money_facts`) whose WHERE admits this tool's grant — never the
 * CRM or Bills tables. fetchAll throughout: a receipt dropped by the
 * silent 1,000-row cap would quietly misstate the company's cash.
 */
export async function getCashPosition(): Promise<CashPosition> {
  await requireTool("/financial-management");
  const supabase = await createClient();

  const [receipts, bills, movements] = await Promise.all([
    fetchAll((from, to) =>
      supabase
        .from("crm_receipt_facts")
        .select("id, amount, received_on")
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("bill_money_facts")
        .select("id, total_amount, status, paid_at")
        .in("status", ["approved", "paid"])
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("funding_movements")
        .select("id, kind, amount, happened_on")
        .order("id")
        .range(from, to),
    ),
  ]);

  const collections: DatedAmount[] = receipts
    .filter((receipt) => receipt.amount !== null)
    .map((receipt) => ({ amount: receipt.amount ?? 0, on: receipt.received_on }));

  const billsPaid: DatedAmount[] = bills
    .filter((bill) => bill.status === "paid" && bill.total_amount !== null)
    // The bills_guard requires paid_at before a bill can be paid, but a
    // missing date still lands in `undated` honestly rather than today.
    .map((bill) => ({ amount: bill.total_amount ?? 0, on: bill.paid_at }));

  const approvedUnpaid = bills.filter((bill) => bill.status === "approved");

  const byKind = (kind: MovementKind): DatedAmount[] =>
    movements
      .filter((movement) => movement.kind === kind)
      .map((movement) => ({ amount: movement.amount, on: movement.happened_on }));

  return {
    collections,
    billsPaid,
    approvedUnpaidTotal: approvedUnpaid.reduce((sum, bill) => sum + (bill.total_amount ?? 0), 0),
    approvedUnpaidCount: approvedUnpaid.length,
    drawdowns: byKind("drawdown"),
    repayments: byKind("repayment"),
    interestPaid: byKind("interest"),
  };
}

/** Profile ids to display names, in one query, skipping the nulls. */
async function lookupNames(ids: (string | null)[]): Promise<Map<string, string | null>> {
  const unique = [...new Set(ids.filter((id): id is string => id != null))];
  if (unique.length === 0) return new Map();

  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").select("id, full_name").in("id", unique);
  if (error) {
    // A missing name is cosmetic — the ledger still opens, the byline
    // just shows a dash. Not worth failing a page over.
    console.error("lookupNames failed:", error);
    return new Map();
  }
  return new Map((data ?? []).map((profile) => [profile.id, profile.full_name]));
}
