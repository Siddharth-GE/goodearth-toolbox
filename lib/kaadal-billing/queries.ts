import "server-only";

import { requireTool } from "@/lib/auth/access";
import { todayInIndia } from "@/lib/format";
import { profileNames } from "@/lib/masters/names";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { cache } from "react";

import {
  figures,
  GRANT,
  KINDS,
  PAID_BY,
  paymentsByOrder,
  runChecks,
  type Amounts,
  type Kind,
  type Ledger,
  type Order,
  type PaidBy,
  type Payment,
  type Vendor,
} from "./ledger";

// Every read opens with requireTool: 0169's policies gate SELECT too. Reads nothing outside the tool.

/** A stored { plot: amount } as numbers, anything else dropped (0169 holds the shape; this keeps a bad row from breaking a page). */
function amounts(value: Json): Amounts {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([k, v]) => [k, Number(v)] as const)
      .filter(([, v]) => Number.isFinite(v)),
  );
}

export type LedgerWithNames = Ledger & {
  /** Who last changed a row, by profile id. */
  names: Record<string, string>;
  today: string;
};

/** The whole ledger, once per request. It is one interiors team's orders: hundreds of rows, not thousands. */
export const getLedger = cache(async (): Promise<LedgerWithNames> => {
  await requireTool(GRANT);
  const supabase = await createClient();
  const [vendorRows, orderRows, paymentRows] = await Promise.all([
    fetchAll((from, to) =>
      supabase
        .from("kaadal_billing_vendors")
        .select("id, name, bank, updated_at, updated_by")
        .order("name")
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("kaadal_billing_orders")
        .select(
          "id, vendor_id, plots, gross, split, deduction, deduction_plot, deduction_note, item, pay_note, notes, ordered_on, created_at, updated_at, updated_by",
        )
        .order("created_at")
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("kaadal_billing_payments")
        .select(
          "id, order_id, amount, paid_on, paid_by, kind, alloc, reference, notes, created_at, updated_at, updated_by",
        )
        .order("created_at")
        .order("id")
        .range(from, to),
    ),
  ]);

  const vendors: Vendor[] = vendorRows.map((r) => ({
    id: r.id,
    name: r.name,
    bank: r.bank,
    updatedAt: r.updated_at,
    updatedBy: r.updated_by,
  }));
  const orders: Order[] = orderRows.map((r) => ({
    id: r.id,
    vendorId: r.vendor_id,
    plots: r.plots,
    gross: Number(r.gross),
    split: amounts(r.split),
    deduction: Number(r.deduction),
    deductionPlot: r.deduction_plot,
    deductionNote: r.deduction_note,
    item: r.item,
    payNote: r.pay_note,
    notes: r.notes,
    orderedOn: r.ordered_on,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    updatedBy: r.updated_by,
  }));
  const payments: Payment[] = paymentRows.map((r) => ({
    id: r.id,
    orderId: r.order_id,
    amount: Number(r.amount),
    paidOn: r.paid_on,
    // 0169's CHECKs hold both to these lists.
    paidBy: (PAID_BY as readonly string[]).includes(r.paid_by) ? (r.paid_by as PaidBy) : "Kaadal",
    kind: (KINDS as readonly string[]).includes(r.kind) ? (r.kind as Kind) : "Part payment",
    alloc: amounts(r.alloc),
    reference: r.reference,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    updatedBy: r.updated_by,
  }));

  const ids = [...vendors, ...orders, ...payments].map((r) => r.updatedBy);
  const nameMap = await profileNames(supabase, ids);
  const names: Record<string, string> = {};
  for (const [id, name] of nameMap) if (name) names[id] = name;

  return { vendors, orders, payments, names, today: todayInIndia() };
});

/** Counts only — the welcome screen never shows a rupee. */
export async function getWelcomeCounts(): Promise<{
  open: number;
  orders: number;
  vendors: number;
  review: number;
}> {
  const ledger = await getLedger();
  const pays = paymentsByOrder(ledger.payments);
  return {
    open: ledger.orders.filter((o) => figures(o, pays.get(o.id) ?? []).state !== "paid").length,
    orders: ledger.orders.length,
    vendors: ledger.vendors.length,
    review: runChecks(ledger, ledger.today).length,
  };
}
