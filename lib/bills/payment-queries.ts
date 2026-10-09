import "server-only";

import { requireTool } from "@/lib/auth/access";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";

import { pendingOnBill } from "./math";

/**
 * Reads for payments (0107, plan.md B8). A bill's paid state is derived:
 * what was paid against it plus what advances recovered, against its
 * total. All of it /bills-gated (or /reporter on read).
 */

export type BillSettlement = {
  paid: number;
  recovered: number;
  pending: number;
};

/** What has been paid and recovered against one bill, and what is still pending. */
export async function getBillSettlement(billId: string, total: number): Promise<BillSettlement> {
  await requireTool("/bills");
  const supabase = await createClient();
  const [payments, recoveries] = await Promise.all([
    fetchAll((from, to) =>
      supabase
        .from("bill_payments")
        .select("amount")
        .eq("bill_id", billId)
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("advance_recoveries")
        .select("amount")
        .eq("bill_id", billId)
        .order("id")
        .range(from, to),
    ),
  ]);
  const paid = payments.reduce((sum, row) => sum + row.amount, 0);
  const recovered = recoveries.reduce((sum, row) => sum + row.amount, 0);
  return { paid, recovered, pending: pendingOnBill(total, paid, recovered) };
}
