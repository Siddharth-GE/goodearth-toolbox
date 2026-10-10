import "server-only";

import { requireTool } from "@/lib/auth/access";
import { profileNames } from "@/lib/masters/names";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";

import {
  cashRequestFigures,
  contractorPosition,
  type CashRequestStatus,
  type ContractorPosition,
} from "./ledger";
import { pendingOnBill } from "./math";

/**
 * Reads for payments (0107, plan.md B8). A bill's paid state is derived:
 * what was paid against it plus what advances recovered, against its
 * total. Money goes out through the week's cash request — asked for,
 * released by a bill approver, then paid line by line. All of it
 * /bills-gated (or /reporter on read).
 */

type Client = Awaited<ReturnType<typeof createClient>>;

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

export type BillMoneyEvent = {
  id: string;
  kind: "payment" | "recovery";
  amount: number;
  on: string;
  /** The UTR / cheque / UPI reference, or the advance it came from. */
  reference: string;
  note: string | null;
  by: string | null;
};

/** Every payment and advance recovery against one bill, oldest first. */
export async function getBillMoneyEvents(billId: string): Promise<BillMoneyEvent[]> {
  await requireTool("/bills");
  const supabase = await createClient();
  const [payments, recoveries] = await Promise.all([
    fetchAll((from, to) =>
      supabase
        .from("bill_payments")
        .select("id, amount, paid_on, payment_ref, note, created_by, created_at")
        .eq("bill_id", billId)
        .order("paid_on")
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("advance_recoveries")
        .select(
          "id, amount, recovered_on, note, created_by, contractor_advances(paid_on, payment_ref)",
        )
        .eq("bill_id", billId)
        .order("recovered_on")
        .order("id")
        .range(from, to),
    ),
  ]);
  const names = await profileNames(supabase, [
    ...payments.map((row) => row.created_by),
    ...recoveries.map((row) => row.created_by),
  ]);
  return [
    ...payments.map((row) => ({
      id: row.id,
      kind: "payment" as const,
      amount: row.amount,
      on: row.paid_on,
      reference: row.payment_ref,
      note: row.note,
      by: row.created_by ? (names.get(row.created_by) ?? null) : null,
    })),
    ...recoveries.map((row) => {
      const advance = row.contractor_advances as { paid_on: string; payment_ref: string } | null;
      return {
        id: row.id,
        kind: "recovery" as const,
        amount: row.amount,
        on: row.recovered_on,
        reference: advance
          ? `From the advance of ${advance.paid_on} (${advance.payment_ref})`
          : "From an advance",
        note: row.note,
        by: row.created_by ? (names.get(row.created_by) ?? null) : null,
      };
    }),
  ].sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : 0));
}

export type OpenAdvance = {
  id: string;
  amount: number;
  recovered: number;
  outstanding: number;
  paid_on: string;
  payment_ref: string;
  project_name: string;
  work_order: string | null;
};

/** A contractor's advances with something still to recover. */
export async function getOpenAdvances(vendorId: string): Promise<OpenAdvance[]> {
  await requireTool("/bills");
  const supabase = await createClient();
  const advances = await fetchAll((from, to) =>
    supabase
      .from("contractor_advances")
      .select("id, amount, paid_on, payment_ref, projects(name), labour_contracts(reference)")
      .eq("vendor_id", vendorId)
      .order("paid_on")
      .order("id")
      .range(from, to),
  );
  if (advances.length === 0) return [];
  const recovered = await recoveredByAdvance(
    supabase,
    advances.map((advance) => advance.id),
  );
  return advances
    .map((advance) => {
      const back = recovered.get(advance.id) ?? 0;
      return {
        id: advance.id,
        amount: advance.amount,
        recovered: back,
        outstanding: Math.max(0, Math.round((advance.amount - back) * 100) / 100),
        paid_on: advance.paid_on,
        payment_ref: advance.payment_ref,
        project_name: (advance.projects as { name: string } | null)?.name ?? "—",
        work_order:
          (advance.labour_contracts as { reference: string | null } | null)?.reference ?? null,
      };
    })
    .filter((advance) => advance.outstanding > 0);
}

async function recoveredByAdvance(supabase: Client, advanceIds?: string[]) {
  const rows = await fetchAll((from, to) => {
    let query = supabase.from("advance_recoveries").select("advance_id, amount");
    if (advanceIds) query = query.in("advance_id", advanceIds);
    return query.order("id").range(from, to);
  });
  const sums = new Map<string, number>();
  for (const row of rows) sums.set(row.advance_id, (sums.get(row.advance_id) ?? 0) + row.amount);
  return sums;
}

/* ------------------------------------------------------------------ *
 * Settlement across every approved or paid bill
 * ------------------------------------------------------------------ */

type BillMoney = {
  id: string;
  reference: string;
  status: string;
  vendor_id: string | null;
  vendor_name: string;
  project_id: string;
  project_name: string;
  invoice_date: string;
  total: number;
  paid: number;
  recovered: number;
  pending: number;
};

/** Approved and paid bills with what has been settled on each. */
async function billsWithSettlement(supabase: Client): Promise<BillMoney[]> {
  const [bills, payments, recoveries] = await Promise.all([
    fetchAll((from, to) =>
      supabase
        .from("bills")
        .select(
          "id, reference, status, vendor_id, project_id, invoice_date, total_amount, vendors(name), projects(name)",
        )
        .in("status", ["approved", "paid"])
        .order("invoice_date")
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase.from("bill_payments").select("bill_id, amount").order("id").range(from, to),
    ),
    fetchAll((from, to) =>
      supabase.from("advance_recoveries").select("bill_id, amount").order("id").range(from, to),
    ),
  ]);
  const paid = new Map<string, number>();
  for (const row of payments) paid.set(row.bill_id, (paid.get(row.bill_id) ?? 0) + row.amount);
  const recovered = new Map<string, number>();
  for (const row of recoveries) {
    recovered.set(row.bill_id, (recovered.get(row.bill_id) ?? 0) + row.amount);
  }
  return bills.map((bill) => {
    const total = bill.total_amount ?? 0;
    const p = paid.get(bill.id) ?? 0;
    const r = recovered.get(bill.id) ?? 0;
    return {
      id: bill.id,
      reference: bill.reference ?? "—",
      status: bill.status,
      vendor_id: bill.vendor_id,
      vendor_name: (bill.vendors as { name: string } | null)?.name ?? "Direct labour",
      project_id: bill.project_id,
      project_name: (bill.projects as { name: string } | null)?.name ?? "—",
      invoice_date: bill.invoice_date,
      total,
      paid: p,
      recovered: r,
      pending: pendingOnBill(total, p, r),
    };
  });
}

export type PayableBill = BillMoney;

/** Approved bills with something still pending — what a cash request asks for. */
export async function listPayableBills(): Promise<PayableBill[]> {
  await requireTool("/bills");
  const supabase = await createClient();
  return (await billsWithSettlement(supabase)).filter(
    (bill) => bill.status === "approved" && bill.pending > 0,
  );
}

/* ------------------------------------------------------------------ *
 * The weekly cash request
 * ------------------------------------------------------------------ */

export type CashRequestRow = {
  id: string;
  week_of: string;
  status: CashRequestStatus;
  item_count: number;
  requested: number;
  released: number;
  paid: number;
};

type ItemRow = {
  id: string;
  cash_request_id: string;
  item_kind: string;
  bill_id: string | null;
  vendor_id: string | null;
  project_id: string | null;
  labour_contract_id: string | null;
  requested_amount: number;
  released_amount: number | null;
  note: string | null;
};

const ITEM_COLUMNS =
  "id, cash_request_id, item_kind, bill_id, vendor_id, project_id, labour_contract_id, requested_amount, released_amount, note";

/** Paid out against each cash-request line: payments for a bill line, the advance for an advance line. */
async function paidByItem(supabase: Client, itemIds: string[]) {
  if (itemIds.length === 0) return new Map<string, number>();
  const [payments, advances] = await Promise.all([
    fetchAll((from, to) =>
      supabase
        .from("bill_payments")
        .select("cash_request_item_id, amount")
        .in("cash_request_item_id", itemIds)
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("contractor_advances")
        .select("cash_request_item_id, amount")
        .in("cash_request_item_id", itemIds)
        .order("id")
        .range(from, to),
    ),
  ]);
  const paid = new Map<string, number>();
  for (const row of [...payments, ...advances]) {
    if (!row.cash_request_item_id) continue;
    paid.set(row.cash_request_item_id, (paid.get(row.cash_request_item_id) ?? 0) + row.amount);
  }
  return paid;
}

/** Every cash request, newest week first, with its figures. */
export async function listCashRequests(): Promise<CashRequestRow[]> {
  await requireTool("/bills");
  const supabase = await createClient();
  const [requests, items] = await Promise.all([
    fetchAll((from, to) =>
      supabase
        .from("cash_requests")
        .select("id, week_of, status")
        .order("week_of", { ascending: false })
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase.from("cash_request_items").select(ITEM_COLUMNS).order("id").range(from, to),
    ),
  ]);
  const paid = await paidByItem(
    supabase,
    items.map((item) => item.id),
  );
  return requests.map((request) => {
    const own = items.filter((item) => item.cash_request_id === request.id);
    const figures = cashRequestFigures(
      own.map((item) => ({
        requested: item.requested_amount,
        released: item.released_amount,
        paid: paid.get(item.id) ?? 0,
      })),
    );
    return {
      id: request.id,
      week_of: request.week_of,
      status: request.status as CashRequestStatus,
      item_count: own.length,
      requested: figures.requested,
      released: figures.released,
      paid: figures.paid,
    };
  });
}

export type CashRequestItem = {
  id: string;
  kind: "bill" | "advance";
  bill_id: string | null;
  bill_reference: string | null;
  vendor_id: string | null;
  vendor_name: string;
  project_id: string | null;
  project_name: string;
  work_order: string | null;
  /** A bill line: the bill's total and what it still has pending (now). */
  bill_total: number | null;
  bill_pending: number | null;
  requested: number;
  released: number | null;
  paid: number;
  note: string | null;
};

export type CashRequestDetail = {
  id: string;
  week_of: string;
  status: CashRequestStatus;
  note: string | null;
  sent_back_note: string | null;
  created_by_name: string | null;
  submitted_by_name: string | null;
  submitted_at: string | null;
  released_by_name: string | null;
  released_at: string | null;
  items: CashRequestItem[];
  figures: ReturnType<typeof cashRequestFigures>;
};

/** One cash request with its lines, each with what has been paid against it. */
export async function getCashRequest(id: string): Promise<CashRequestDetail | null> {
  await requireTool("/bills");
  const supabase = await createClient();
  const { data: request, error } = await supabase
    .from("cash_requests")
    .select(
      "id, week_of, status, note, sent_back_note, created_by, submitted_by, submitted_at, released_by, released_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("getCashRequest failed:", error);
    throw new Error("Could not read the cash request.", { cause: error });
  }
  if (!request) return null;

  const items = (await fetchAll((from, to) =>
    supabase
      .from("cash_request_items")
      .select(
        `${ITEM_COLUMNS}, bills(reference, vendor_id, project_id, vendors(name), projects(name)), vendors(name), projects(name), labour_contracts(reference)`,
      )
      .eq("cash_request_id", id)
      .order("created_at")
      .order("id")
      .range(from, to),
  )) as unknown as (ItemRow & {
    bills: {
      reference: string;
      vendor_id: string | null;
      project_id: string;
      vendors: { name: string } | null;
      projects: { name: string } | null;
    } | null;
    vendors: { name: string } | null;
    projects: { name: string } | null;
    labour_contracts: { reference: string | null } | null;
  })[];

  const [paid, bills, names] = await Promise.all([
    paidByItem(
      supabase,
      items.map((item) => item.id),
    ),
    billsWithSettlement(supabase),
    profileNames(supabase, [request.created_by, request.submitted_by, request.released_by]),
  ]);
  const billById = new Map(bills.map((bill) => [bill.id, bill]));
  const nameOf = (person: string | null) => (person ? (names.get(person) ?? null) : null);

  const shaped: CashRequestItem[] = items.map((item) => {
    const bill = item.bill_id ? billById.get(item.bill_id) : undefined;
    return {
      id: item.id,
      kind: item.item_kind as "bill" | "advance",
      bill_id: item.bill_id,
      bill_reference: item.bills?.reference ?? null,
      vendor_id: item.bills?.vendor_id ?? item.vendor_id,
      vendor_name: item.bills?.vendors?.name ?? item.vendors?.name ?? "Direct labour",
      project_id: item.bills?.project_id ?? item.project_id,
      project_name: item.bills?.projects?.name ?? item.projects?.name ?? "—",
      work_order: item.labour_contracts?.reference ?? null,
      bill_total: bill?.total ?? null,
      bill_pending: bill?.pending ?? null,
      requested: item.requested_amount,
      released: item.released_amount,
      paid: paid.get(item.id) ?? 0,
      note: item.note,
    };
  });

  return {
    id: request.id,
    week_of: request.week_of,
    status: request.status as CashRequestStatus,
    note: request.note,
    sent_back_note: request.sent_back_note,
    created_by_name: nameOf(request.created_by),
    submitted_by_name: nameOf(request.submitted_by),
    submitted_at: request.submitted_at,
    released_by_name: nameOf(request.released_by),
    released_at: request.released_at,
    items: shaped,
    figures: cashRequestFigures(shaped),
  };
}

/* ------------------------------------------------------------------ *
 * Payments ledger and contractors
 * ------------------------------------------------------------------ */

export type LedgerRow = {
  id: string;
  kind: "payment" | "advance" | "recovery";
  on: string;
  amount: number;
  reference: string;
  vendor_id: string | null;
  vendor_name: string;
  project_id: string | null;
  project_name: string;
  bill_id: string | null;
  bill_reference: string | null;
  note: string | null;
};

export type LedgerFilters = {
  q?: string;
  vendorId?: string;
  projectId?: string;
  from?: string;
  to?: string;
};

/** Every payment, advance and advance recovery, newest first, filtered. */
export async function listPaymentsLedger(filters: LedgerFilters = {}): Promise<LedgerRow[]> {
  await requireTool("/bills");
  const supabase = await createClient();
  const [payments, advances, recoveries] = await Promise.all([
    fetchAll((from, to) =>
      supabase
        .from("bill_payments")
        .select(
          "id, amount, paid_on, payment_ref, note, bill_id, bills(reference, vendor_id, project_id, vendors(name), projects(name))",
        )
        .order("paid_on", { ascending: false })
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("contractor_advances")
        .select(
          "id, amount, paid_on, payment_ref, note, vendor_id, project_id, vendors(name), projects(name)",
        )
        .order("paid_on", { ascending: false })
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("advance_recoveries")
        .select(
          "id, amount, recovered_on, note, bill_id, bills(reference, vendor_id, project_id, vendors(name), projects(name))",
        )
        .order("recovered_on", { ascending: false })
        .order("id")
        .range(from, to),
    ),
  ]);

  type BillEmbed = {
    reference: string;
    vendor_id: string | null;
    project_id: string;
    vendors: { name: string } | null;
    projects: { name: string } | null;
  } | null;

  const rows: LedgerRow[] = [
    ...payments.map((row) => {
      const bill = row.bills as BillEmbed;
      return {
        id: row.id,
        kind: "payment" as const,
        on: row.paid_on,
        amount: row.amount,
        reference: row.payment_ref,
        vendor_id: bill?.vendor_id ?? null,
        vendor_name: bill?.vendors?.name ?? "Direct labour",
        project_id: bill?.project_id ?? null,
        project_name: bill?.projects?.name ?? "—",
        bill_id: row.bill_id,
        bill_reference: bill?.reference ?? null,
        note: row.note,
      };
    }),
    ...advances.map((row) => ({
      id: row.id,
      kind: "advance" as const,
      on: row.paid_on,
      amount: row.amount,
      reference: row.payment_ref,
      vendor_id: row.vendor_id,
      vendor_name: (row.vendors as { name: string } | null)?.name ?? "—",
      project_id: row.project_id,
      project_name: (row.projects as { name: string } | null)?.name ?? "—",
      bill_id: null,
      bill_reference: null,
      note: row.note,
    })),
    ...recoveries.map((row) => {
      const bill = row.bills as BillEmbed;
      return {
        id: row.id,
        kind: "recovery" as const,
        on: row.recovered_on,
        amount: row.amount,
        reference: "Recovered from an advance",
        vendor_id: bill?.vendor_id ?? null,
        vendor_name: bill?.vendors?.name ?? "—",
        project_id: bill?.project_id ?? null,
        project_name: bill?.projects?.name ?? "—",
        bill_id: row.bill_id,
        bill_reference: bill?.reference ?? null,
        note: row.note,
      };
    }),
  ];

  const needle = filters.q?.toLowerCase();
  return rows
    .filter((row) => !filters.vendorId || row.vendor_id === filters.vendorId)
    .filter((row) => !filters.projectId || row.project_id === filters.projectId)
    .filter((row) => !filters.from || row.on >= filters.from)
    .filter((row) => !filters.to || row.on <= filters.to)
    .filter(
      (row) =>
        !needle ||
        [row.reference, row.vendor_name, row.bill_reference ?? "", row.note ?? ""].some((text) =>
          text.toLowerCase().includes(needle),
        ),
    )
    .sort((a, b) => (a.on < b.on ? 1 : a.on > b.on ? -1 : 0));
}

export type ContractorRow = {
  vendor_id: string;
  vendor_name: string;
  position: ContractorPosition;
};

/**
 * Each contractor (or vendor) with approved bills or advances: billed,
 * paid, recovered from advances, pending; advances given, recovered, out.
 */
export async function listContractorPositions(projectId?: string): Promise<ContractorRow[]> {
  await requireTool("/bills");
  const supabase = await createClient();
  const [bills, advances, recovered] = await Promise.all([
    billsWithSettlement(supabase),
    fetchAll((from, to) =>
      supabase
        .from("contractor_advances")
        .select("id, vendor_id, project_id, amount, vendors(name)")
        .order("id")
        .range(from, to),
    ),
    recoveredByAdvance(supabase),
  ]);

  const byVendor = new Map<
    string,
    {
      name: string;
      bills: { total: number; paid: number; recovered: number }[];
      advances: { amount: number; recovered: number }[];
    }
  >();
  const entry = (vendorId: string, name: string) => {
    const existing = byVendor.get(vendorId);
    if (existing) return existing;
    const fresh = { name, bills: [], advances: [] };
    byVendor.set(vendorId, fresh);
    return fresh;
  };
  for (const bill of bills) {
    if (!bill.vendor_id || (projectId && bill.project_id !== projectId)) continue;
    entry(bill.vendor_id, bill.vendor_name).bills.push({
      total: bill.total,
      paid: bill.paid,
      recovered: bill.recovered,
    });
  }
  for (const advance of advances) {
    if (projectId && advance.project_id !== projectId) continue;
    entry(
      advance.vendor_id,
      (advance.vendors as { name: string } | null)?.name ?? "—",
    ).advances.push({
      amount: advance.amount,
      recovered: recovered.get(advance.id) ?? 0,
    });
  }

  return [...byVendor.entries()]
    .map(([vendorId, value]) => ({
      vendor_id: vendorId,
      vendor_name: value.name,
      position: contractorPosition(value.bills, value.advances),
    }))
    .sort((a, b) => a.vendor_name.localeCompare(b.vendor_name));
}
