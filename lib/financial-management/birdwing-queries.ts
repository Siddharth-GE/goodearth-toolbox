import "server-only";

import { requireTool } from "@/lib/auth/access";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import type { BirdwingMonth } from "./birdwing";

/** Financial Management's read of Birdwing: the three 0117 views only (STATUS.md contract row). They are gated to this tool or /reporter in their own WHERE, so requireTool turns an ungranted person away instead of showing an empty page. */

export type BirdwingReceivable = {
  ref: string;
  guestName: string | null;
  use: string | null;
  segment: string;
  month: string;
  billed: number;
  collected: number;
  pending: number;
  costCentre: string | null;
};

export type BirdwingPicture = {
  months: BirdwingMonth[];
  expenseLines: { month: string; head: string; amount: number }[];
  /** Every stay with more than a rupee pending, largest first. */
  receivables: BirdwingReceivable[];
};

export async function getBirdwingPicture(): Promise<BirdwingPicture> {
  await requireTool("/financial-management");
  const supabase = await createClient();

  const [months, expenses, stays] = await Promise.all([
    fetchAll((from, to) =>
      supabase
        .from("birdwing_month_facts")
        .select(
          "month, days_in_month, rooms, stays, room_nights, room_nights_estimated, room_revenue, charged, ota_commission, discount, billed, billed_guest, billed_internal, collected, cross_charged, written_off, pending, pending_guest, pending_internal, expenses",
        )
        .order("month")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("birdwing_expense_facts")
        .select("expense_id, month, head, amount")
        .order("expense_id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("birdwing_stay_facts")
        .select(
          "stay_id, ref, guest_name, use, segment, month, billed, collected, pending, cost_centre",
        )
        .gte("pending", 1)
        .order("stay_id")
        .range(from, to),
    ),
  ]);

  const n = (value: number | string | null) => Number(value ?? 0);
  return {
    months: months
      .filter((row) => row.month !== null)
      .map((row) => ({
        month: row.month as string,
        daysInMonth: row.days_in_month ?? 30,
        rooms: row.rooms ?? 0,
        stays: row.stays ?? 0,
        roomNights: n(row.room_nights),
        roomNightsEstimated: row.room_nights_estimated ?? false,
        roomRevenue: n(row.room_revenue),
        charged: n(row.charged),
        otaCommission: n(row.ota_commission),
        discount: n(row.discount),
        billed: n(row.billed),
        billedGuest: n(row.billed_guest),
        billedInternal: n(row.billed_internal),
        collected: n(row.collected),
        crossCharged: n(row.cross_charged),
        writtenOff: n(row.written_off),
        pending: n(row.pending),
        pendingGuest: n(row.pending_guest),
        pendingInternal: n(row.pending_internal),
        expenses: n(row.expenses),
      })),
    expenseLines: expenses
      .filter((row) => row.month !== null)
      .map((row) => ({ month: row.month as string, head: row.head ?? "—", amount: n(row.amount) })),
    receivables: stays
      .map((row) => ({
        ref: row.ref ?? "",
        guestName: row.guest_name,
        use: row.use,
        segment: row.segment ?? "guest",
        month: row.month ?? "",
        billed: n(row.billed),
        collected: n(row.collected),
        pending: n(row.pending),
        costCentre: row.cost_centre,
      }))
      .sort((a, b) => b.pending - a.pending),
  };
}
