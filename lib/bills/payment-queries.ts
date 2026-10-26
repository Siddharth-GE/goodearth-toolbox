import "server-only";

import { requireTool } from "@/lib/auth/access";
import { profileNames } from "@/lib/masters/names";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";

import {
  cashRequestFigures,
  contractorLedger,
  contractorPosition,
  type LedgerEntry,
  type CashRequestStatus,
  type ContractorPosition,
  type MoneyKind,
} from "./ledger";
import { pendingOnBill } from "./math";
import { roundPaise } from "@/lib/line-money";

// A bill's paid state is derived: payments plus advance recoveries against its total. All /bills-gated (or /reporter on read).

type Client = Awaited<ReturnType<typeof createClient>>;

export type BillSettlement = {
  paid: number;
  recovered: number;
  pending: number;
};

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

/** A reversal (0147) is its own row, the amount the other way; `reversed` marks the row it reverses. */
type Reversible = { reversal: boolean; reversed: boolean; reason: string | null };

function reversalState(rows: { id: string; reverses_id: string | null }[]) {
  const reversed = new Set(rows.flatMap((row) => (row.reverses_id ? [row.reverses_id] : [])));
  return (row: { id: string; reverses_id: string | null; reverse_reason: string | null }) => ({
    reversal: row.reverses_id !== null,
    reversed: reversed.has(row.id),
    reason: row.reverse_reason,
  });
}

export type BillMoneyEvent = Reversible & {
  id: string;
  kind: "payment" | "recovery";
  amount: number;
  on: string;
  reference: string;
  note: string | null;
  by: string | null;
};

export async function getBillMoneyEvents(billId: string): Promise<BillMoneyEvent[]> {
  await requireTool("/bills");
  const supabase = await createClient();
  const [payments, recoveries] = await Promise.all([
    fetchAll((from, to) =>
      supabase
        .from("bill_payments")
        .select(
          "id, amount, paid_on, payment_ref, note, created_by, created_at, reverses_id, reverse_reason",
        )
        .eq("bill_id", billId)
        .order("paid_on")
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("advance_recoveries")
        .select(
          "id, amount, recovered_on, note, created_by, reverses_id, reverse_reason, contractor_advances(paid_on, payment_ref)",
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
  const paymentState = reversalState(payments);
  const recoveryState = reversalState(recoveries);
  return [
    ...payments.map((row) => ({
      id: row.id,
      kind: "payment" as const,
      amount: row.amount,
      on: row.paid_on,
      reference: row.payment_ref,
      note: row.note,
      by: row.created_by ? (names.get(row.created_by) ?? null) : null,
      ...paymentState(row),
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
        ...recoveryState(row),
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

export async function getOpenAdvances(vendorId: string): Promise<OpenAdvance[]> {
  await requireTool("/bills");
  const supabase = await createClient();
  const advances = await fetchAll((from, to) =>
    supabase
      .from("contractor_advances")
      .select(
        "id, amount, paid_on, payment_ref, reverses_id, projects(name), labour_contracts(reference)",
      )
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
  const reversed = new Set(advances.map((advance) => advance.reverses_id));
  return advances
    .filter((advance) => advance.reverses_id === null && !reversed.has(advance.id))
    .map((advance) => {
      const back = recovered.get(advance.id) ?? 0;
      return {
        id: advance.id,
        amount: advance.amount,
        recovered: back,
        outstanding: Math.max(0, roundPaise(advance.amount - back)),
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

export async function listPayableBills(): Promise<PayableBill[]> {
  await requireTool("/bills");
  const supabase = await createClient();
  return (await billsWithSettlement(supabase)).filter(
    (bill) => bill.status === "approved" && bill.pending > 0,
  );
}

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
  /** The work order an advance is asked against, kept on the advance when it is paid. */
  labour_contract_id: string | null;
  work_order: string | null;
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
      labour_contract_id: item.labour_contract_id,
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

export type LedgerRow = Reversible & {
  id: string;
  kind: MoneyKind;
  /** An advance's recoveries, net of reversals; zero for the rest. */
  recovered: number;
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

export async function listPaymentsLedger(filters: LedgerFilters = {}): Promise<LedgerRow[]> {
  await requireTool("/bills");
  const supabase = await createClient();
  const [payments, advances, recoveries] = await Promise.all([
    fetchAll((from, to) =>
      supabase
        .from("bill_payments")
        .select(
          "id, amount, paid_on, payment_ref, note, bill_id, reverses_id, reverse_reason, bills(reference, vendor_id, project_id, vendors(name), projects(name))",
        )
        .order("paid_on", { ascending: false })
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("contractor_advances")
        .select(
          "id, amount, paid_on, payment_ref, note, vendor_id, project_id, reverses_id, reverse_reason, vendors(name), projects(name)",
        )
        .order("paid_on", { ascending: false })
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("advance_recoveries")
        .select(
          "id, amount, recovered_on, note, bill_id, advance_id, reverses_id, reverse_reason, bills(reference, vendor_id, project_id, vendors(name), projects(name))",
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

  const paymentState = reversalState(payments);
  const advanceState = reversalState(advances);
  const recoveryState = reversalState(recoveries);
  const recoveredFrom = new Map<string, number>();
  for (const row of recoveries) {
    recoveredFrom.set(row.advance_id, (recoveredFrom.get(row.advance_id) ?? 0) + row.amount);
  }

  const rows: LedgerRow[] = [
    ...payments.map((row) => {
      const bill = row.bills as BillEmbed;
      return {
        id: row.id,
        kind: "payment" as const,
        recovered: 0,
        ...paymentState(row),
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
      recovered: roundPaise(recoveredFrom.get(row.id) ?? 0),
      ...advanceState(row),
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
        recovered: 0,
        ...recoveryState(row),
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
  is_contractor: boolean;
  contractor_no: string | null;
  position: ContractorPosition;
};

/** Who is a contractor and their number, for the vendors a money list names. */
async function vendorFacts(supabase: Client, ids: string[]) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map<string, { is_contractor: boolean; contractor_no: string | null }>();
  const rows = await fetchAll((from, to) =>
    supabase
      .from("vendors")
      .select("id, is_contractor, contractor_no")
      .in("id", unique)
      .order("id")
      .range(from, to),
  );
  return new Map(rows.map((row) => [row.id, row]));
}

/** projectIds narrows to those projects (one project, or a company's); undefined is every project. */
export async function listContractorPositions(projectIds?: string[]): Promise<ContractorRow[]> {
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
    if (!bill.vendor_id || (projectIds && !projectIds.includes(bill.project_id))) continue;
    entry(bill.vendor_id, bill.vendor_name).bills.push({
      total: bill.total,
      paid: bill.paid,
      recovered: bill.recovered,
    });
  }
  for (const advance of advances) {
    if (projectIds && !projectIds.includes(advance.project_id)) continue;
    entry(
      advance.vendor_id,
      (advance.vendors as { name: string } | null)?.name ?? "—",
    ).advances.push({
      amount: advance.amount,
      recovered: recovered.get(advance.id) ?? 0,
    });
  }

  const facts = await vendorFacts(supabase, [...byVendor.keys()]);
  return [...byVendor.entries()]
    .map(([vendorId, value]) => ({
      vendor_id: vendorId,
      vendor_name: value.name,
      is_contractor: facts.get(vendorId)?.is_contractor ?? false,
      contractor_no: facts.get(vendorId)?.contractor_no ?? null,
      position: contractorPosition(value.bills, value.advances),
    }))
    .sort((a, b) => a.vendor_name.localeCompare(b.vendor_name));
}

export type ContractorLedgerRow = LedgerEntry & {
  balance: number;
  /** What it was: a bill's number and their own count, a payment's reference, an advance's. */
  label: string;
  bill_id: string | null;
  project_name: string;
  reversal: boolean;
};

export type ContractorLedger = {
  vendor: { id: string; name: string; contractor_no: string | null; is_contractor: boolean };
  rows: ContractorLedgerRow[];
  /** Bills recorded and not yet approved: owed once approved, so outside the balance. */
  waiting: { count: number; total: number };
};

/** One vendor's account (approved bills, payments, advances, recoveries), oldest first with a running balance. */
export async function getContractorLedger(
  vendorId: string,
  projectIds?: string[],
): Promise<ContractorLedger | null> {
  await requireTool("/bills");
  const supabase = await createClient();
  const { data: vendor, error: vendorError } = await supabase
    .from("vendors")
    .select("id, name, contractor_no, is_contractor")
    .eq("id", vendorId)
    .maybeSingle();
  if (vendorError) {
    console.error("getContractorLedger vendor failed:", vendorError);
    throw new Error("Could not read the contractor.", { cause: vendorError });
  }
  if (!vendor) return null;

  const [bills, advances] = await Promise.all([
    fetchAll((from, to) =>
      supabase
        .from("bills")
        .select("id, reference, status, project_id, invoice_date, total_amount, vendor_seq, projects(name)")
        .eq("vendor_id", vendorId)
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("contractor_advances")
        .select("id, amount, paid_on, payment_ref, project_id, reverses_id, projects(name)")
        .eq("vendor_id", vendorId)
        .order("id")
        .range(from, to),
    ),
  ]);
  const inScope = (projectId: string) => !projectIds || projectIds.includes(projectId);
  const owed = bills.filter(
    (bill) => (bill.status === "approved" || bill.status === "paid") && inScope(bill.project_id),
  );
  const billIds = owed.map((bill) => bill.id);
  const [payments, recoveries] = billIds.length
    ? await Promise.all([
        fetchAll((from, to) =>
          supabase
            .from("bill_payments")
            .select("id, bill_id, amount, paid_on, payment_ref, reverses_id")
            .in("bill_id", billIds)
            .order("id")
            .range(from, to),
        ),
        fetchAll((from, to) =>
          supabase
            .from("advance_recoveries")
            .select("id, bill_id, amount, recovered_on, reverses_id")
            .in("bill_id", billIds)
            .order("id")
            .range(from, to),
        ),
      ])
    : [[], []];

  const projectName = (embed: unknown) => (embed as { name: string } | null)?.name ?? "—";
  const billById = new Map(owed.map((bill) => [bill.id, bill]));
  const billLabel = (id: string) => {
    const bill = billById.get(id);
    return bill ? `${bill.reference ?? "—"}${bill.vendor_seq ? ` (their bill ${bill.vendor_seq})` : ""}` : "—";
  };
  const entries = [
    ...owed.map((bill) => ({
      id: bill.id,
      kind: "bill" as const,
      // Dated as on its paper; only approved bills count, a recorded one is listed apart.
      on: bill.invoice_date,
      amount: bill.total_amount ?? 0,
      label: billLabel(bill.id),
      bill_id: bill.id,
      project_name: projectName(bill.projects),
      reversal: false,
    })),
    ...payments.map((row) => ({
      id: row.id,
      kind: "payment" as const,
      on: row.paid_on,
      amount: row.amount,
      label: `${row.payment_ref} · ${billLabel(row.bill_id)}`,
      bill_id: row.bill_id,
      project_name: projectName(billById.get(row.bill_id)?.projects),
      reversal: row.reverses_id !== null,
    })),
    ...advances
      .filter((row) => inScope(row.project_id))
      .map((row) => ({
        id: row.id,
        kind: "advance" as const,
        on: row.paid_on,
        amount: row.amount,
        label: row.payment_ref,
        bill_id: null,
        project_name: projectName(row.projects),
        reversal: row.reverses_id !== null,
      })),
    ...recoveries.map((row) => ({
      id: row.id,
      kind: "recovery" as const,
      on: row.recovered_on,
      amount: row.amount,
      label: `Advance set against ${billLabel(row.bill_id)}`,
      bill_id: row.bill_id,
      project_name: projectName(billById.get(row.bill_id)?.projects),
      reversal: row.reverses_id !== null,
    })),
  ];

  const waiting = bills.filter((bill) => bill.status === "recorded" && inScope(bill.project_id));
  return {
    vendor,
    rows: contractorLedger(entries),
    waiting: {
      count: waiting.length,
      total: roundPaise(waiting.reduce((sum, bill) => sum + (bill.total_amount ?? 0), 0)),
    },
  };
}
