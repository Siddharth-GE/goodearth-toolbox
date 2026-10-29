import "server-only";

import { requireTool } from "@/lib/auth/access";
import { roundPaise } from "@/lib/line-money";
import { profileNames } from "@/lib/masters/names";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { assertRead } from "@/lib/supabase/read-failed";
import { createClient } from "@/lib/supabase/server";

import { pendingOnBill } from "./math";
import {
  groupSheetMoney,
  sheetState,
  type SheetMoneyEntry,
  type SheetState,
  type SheetStatus,
} from "./sheets";
import type { BillStatus } from "./workflow";

// Sheets (0170): a contractor's bills gathered under one C number. Every table is /bills (or /reporter) on read.

type Client = Awaited<ReturnType<typeof createClient>>;

/** Each bill's total, paid and recovered, for the bills given. */
async function billMoney(supabase: Client, billIds: string[]) {
  if (billIds.length === 0) return new Map<string, { paid: number; recovered: number }>();
  const [payments, recoveries] = await Promise.all([
    fetchAll((from, to) =>
      supabase
        .from("bill_payments")
        .select("id, bill_id, amount")
        .in("bill_id", billIds)
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("advance_recoveries")
        .select("id, bill_id, amount")
        .in("bill_id", billIds)
        .order("id")
        .range(from, to),
    ),
  ]);
  const money = new Map<string, { paid: number; recovered: number }>();
  const entry = (id: string) => {
    const found = money.get(id) ?? { paid: 0, recovered: 0 };
    money.set(id, found);
    return found;
  };
  for (const row of payments) entry(row.bill_id).paid += row.amount;
  for (const row of recoveries) entry(row.bill_id).recovered += row.amount;
  return money;
}

export type SheetListRow = {
  id: string;
  reference: string;
  state: SheetState;
  vendor_id: string;
  vendor_name: string;
  company_name: string;
  work_type: string;
  bill_count: number;
  total: number;
  pending: number;
  created_at: string;
};

export type SheetListFilters = { state?: SheetState; vendorId?: string; q?: string };

export async function listSheets(filters: SheetListFilters = {}): Promise<SheetListRow[]> {
  await requireTool("/bills");
  const supabase = await createClient();
  const sheets = await fetchAll((from, to) => {
    let query = supabase
      .from("bill_sheets")
      .select(
        "id, reference, status, vendor_id, work_type, created_at, vendors(name), companies(name)",
      )
      .order("created_at", { ascending: false })
      .order("id");
    if (filters.vendorId) query = query.eq("vendor_id", filters.vendorId);
    if (filters.q) query = query.ilike("reference", `%${filters.q}%`);
    return query.range(from, to);
  });
  // Every bill on any sheet, and every row of sheet money: never a list of ids, which outgrows a request's address.
  // A bill on a sheet has no money but the sheet's (0170 consolidates only bills with none).
  const [bills, payments, recoveries] = await Promise.all([
    fetchAll((from, to) =>
      supabase
        .from("bills")
        .select("id, sheet_id, total_amount")
        .not("sheet_id", "is", null)
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("bill_payments")
        .select("id, bill_id, amount")
        .not("sheet_id", "is", null)
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("advance_recoveries")
        .select("id, bill_id, amount")
        .not("sheet_id", "is", null)
        .order("id")
        .range(from, to),
    ),
  ]);
  const money = new Map<string, { paid: number; recovered: number }>();
  const entry = (id: string) => {
    const found = money.get(id) ?? { paid: 0, recovered: 0 };
    money.set(id, found);
    return found;
  };
  for (const row of payments) entry(row.bill_id).paid += row.amount;
  for (const row of recoveries) entry(row.bill_id).recovered += row.amount;

  const bySheet = new Map<string, { count: number; total: number; pending: number }>();
  for (const bill of bills) {
    if (!bill.sheet_id) continue;
    const sums = bySheet.get(bill.sheet_id) ?? { count: 0, total: 0, pending: 0 };
    const settled = money.get(bill.id) ?? { paid: 0, recovered: 0 };
    sums.count += 1;
    sums.total = roundPaise(sums.total + (bill.total_amount ?? 0));
    sums.pending = roundPaise(
      sums.pending + pendingOnBill(bill.total_amount ?? 0, settled.paid, settled.recovered),
    );
    bySheet.set(bill.sheet_id, sums);
  }

  return sheets
    .map((sheet) => {
      const sums = bySheet.get(sheet.id) ?? { count: 0, total: 0, pending: 0 };
      return {
        id: sheet.id,
        reference: sheet.reference,
        state: sheetState(sheet.status as SheetStatus, sums.total, sums.pending),
        vendor_id: sheet.vendor_id,
        vendor_name: (sheet.vendors as { name: string } | null)?.name ?? "—",
        company_name: (sheet.companies as { name: string } | null)?.name ?? "—",
        work_type: sheet.work_type,
        bill_count: sums.count,
        total: sums.total,
        pending: sums.pending,
        created_at: sheet.created_at,
      };
    })
    .filter((row) => !filters.state || row.state === filters.state);
}

export type SheetBill = {
  id: string;
  reference: string;
  invoice_no: string;
  invoice_date: string;
  status: BillStatus;
  /** The villa its header names, or how many its lines reach. */
  place: string;
  project_id: string;
  project_name: string;
  total: number;
  paid: number;
  recovered: number;
  pending: number;
};

export type SheetDetail = {
  id: string;
  reference: string;
  status: SheetStatus;
  state: SheetState;
  vendor_id: string;
  vendor_name: string;
  vendor_contractor_no: string | null;
  company_id: string;
  company_name: string;
  work_type: string;
  sent_back_note: string | null;
  created_at: string;
  created_by_name: string | null;
  approved_by: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  undone_by_name: string | null;
  undone_at: string | null;
  bills: SheetBill[];
  /** Bills that were on it and came off (or every bill, once undone). */
  former: {
    bill_id: string | null;
    reference: string;
    removed_at: string;
    removed_by: string | null;
  }[];
  total: number;
  paid: number;
  recovered: number;
  pending: number;
  payments: SheetMoneyEntry[];
  recoveries: SheetMoneyEntry[];
  /** The cash requests it is on, newest first. */
  cash_requests: { id: string; week_of: string; status: string }[];
};

export async function getSheet(id: string): Promise<SheetDetail | null> {
  await requireTool("/bills");
  const supabase = await createClient();
  const { data: sheet, error } = await supabase
    .from("bill_sheets")
    .select(
      "id, reference, status, vendor_id, company_id, work_type, sent_back_note, created_at, created_by, approved_by, approved_at, undone_by, undone_at, vendors(name, contractor_no), companies(name)",
    )
    .eq("id", id)
    .maybeSingle();
  assertRead("bills", "the sheet", error);
  if (!sheet) return null;

  const [bills, members, payments, recoveries, items] = await Promise.all([
    fetchAll((from, to) =>
      supabase
        .from("bills")
        .select(
          "id, reference, invoice_no, invoice_date, status, total_amount, created_at, project_id, projects(name), plots(name), units(name)",
        )
        .eq("sheet_id", id)
        .order("invoice_date")
        .order("created_at")
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("bill_sheet_bills")
        .select("id, bill_id, bill_reference, removed_at, removed_by")
        .eq("sheet_id", id)
        .not("removed_at", "is", null)
        .order("removed_at")
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("bill_payments")
        .select(
          "id, sheet_entry_id, amount, paid_on, payment_ref, reverses_id, reverse_reason, created_by",
        )
        .eq("sheet_id", id)
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("advance_recoveries")
        .select(
          "id, sheet_entry_id, amount, recovered_on, reverses_id, reverse_reason, created_by, contractor_advances(paid_on, payment_ref)",
        )
        .eq("sheet_id", id)
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("cash_request_items")
        .select("id, cash_requests(id, week_of, status)")
        .eq("sheet_id", id)
        .order("id")
        .range(from, to),
    ),
  ]);

  const billIds = bills.map((bill) => bill.id);
  const [money, lineVillas, names] = await Promise.all([
    billMoney(supabase, billIds),
    billIds.length
      ? fetchAll((from, to) =>
          supabase
            .from("bill_lines")
            .select("id, bill_id, plot_id, unit_id")
            .in("bill_id", billIds)
            .order("id")
            .range(from, to),
        )
      : Promise.resolve([]),
    profileNames(supabase, [
      sheet.created_by,
      sheet.approved_by,
      sheet.undone_by,
      ...members.map((row) => row.removed_by),
      ...payments.map((row) => row.created_by),
      ...recoveries.map((row) => row.created_by),
    ]),
  ]);
  const nameOf = (person: string | null) => (person ? (names.get(person) ?? null) : null);

  // A bill whose header names no villa says how many its lines reach (0166).
  const villasOf = new Map<string, Set<string>>();
  for (const line of lineVillas) {
    const place = line.unit_id ?? line.plot_id;
    if (!place) continue;
    const set = villasOf.get(line.bill_id) ?? new Set<string>();
    set.add(place);
    villasOf.set(line.bill_id, set);
  }

  const sheetBills: SheetBill[] = bills.map((bill) => {
    const settled = money.get(bill.id) ?? { paid: 0, recovered: 0 };
    const total = bill.total_amount ?? 0;
    const header =
      (bill.units as { name: string } | null)?.name ??
      (bill.plots as { name: string } | null)?.name;
    const reach = villasOf.get(bill.id)?.size ?? 0;
    return {
      id: bill.id,
      reference: bill.reference ?? "—",
      invoice_no: bill.invoice_no ?? "—",
      invoice_date: bill.invoice_date,
      status: bill.status as BillStatus,
      place: header ?? (reach > 1 ? `${reach} villas` : "General"),
      project_id: bill.project_id,
      project_name: (bill.projects as { name: string } | null)?.name ?? "—",
      total,
      paid: roundPaise(settled.paid),
      recovered: roundPaise(settled.recovered),
      pending: pendingOnBill(total, settled.paid, settled.recovered),
    };
  });
  const sum = (pick: (bill: SheetBill) => number) =>
    roundPaise(sheetBills.reduce((acc, bill) => acc + pick(bill), 0));
  const total = sum((bill) => bill.total);
  const pending = sum((bill) => bill.pending);

  const vendor = sheet.vendors as { name: string; contractor_no: string | null } | null;
  return {
    id: sheet.id,
    reference: sheet.reference,
    status: sheet.status as SheetStatus,
    state: sheetState(sheet.status as SheetStatus, total, pending),
    vendor_id: sheet.vendor_id,
    vendor_name: vendor?.name ?? "—",
    vendor_contractor_no: vendor?.contractor_no ?? null,
    company_id: sheet.company_id,
    company_name: (sheet.companies as { name: string } | null)?.name ?? "—",
    work_type: sheet.work_type,
    sent_back_note: sheet.sent_back_note,
    created_at: sheet.created_at,
    created_by_name: nameOf(sheet.created_by),
    approved_by: sheet.approved_by,
    approved_by_name: nameOf(sheet.approved_by),
    approved_at: sheet.approved_at,
    undone_by_name: nameOf(sheet.undone_by),
    undone_at: sheet.undone_at,
    bills: sheetBills,
    former: members.map((row) => ({
      bill_id: row.bill_id,
      reference: row.bill_reference,
      removed_at: row.removed_at ?? "",
      removed_by: nameOf(row.removed_by),
    })),
    total,
    paid: sum((bill) => bill.paid),
    recovered: sum((bill) => bill.recovered),
    pending,
    payments: groupSheetMoney(
      payments.map((row) => ({
        id: row.id,
        entry: row.sheet_entry_id ?? row.id,
        amount: row.amount,
        on: row.paid_on,
        reference: row.payment_ref,
        reversesId: row.reverses_id,
        reason: row.reverse_reason,
        by: nameOf(row.created_by),
      })),
    ),
    recoveries: groupSheetMoney(
      recoveries.map((row) => {
        const advance = row.contractor_advances as { paid_on: string; payment_ref: string } | null;
        return {
          id: row.id,
          entry: row.sheet_entry_id ?? row.id,
          amount: row.amount,
          on: row.recovered_on,
          reference: advance
            ? `From the advance of ${advance.paid_on} (${advance.payment_ref})`
            : "From an advance",
          reversesId: row.reverses_id,
          reason: row.reverse_reason,
          by: nameOf(row.created_by),
        };
      }),
    ),
    cash_requests: items
      .map((item) => item.cash_requests as { id: string; week_of: string; status: string } | null)
      .filter((request): request is { id: string; week_of: string; status: string } => !!request)
      .sort((a, b) => (a.week_of < b.week_of ? 1 : -1)),
  };
}

/** Once on a cash request, a sheet keeps its bills (remove_bill_from_sheet, 0170). */
export async function sheetHasBeenRequested(sheetId: string): Promise<boolean> {
  await requireTool("/bills");
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("cash_request_items")
    .select("id", { count: "exact", head: true })
    .eq("sheet_id", sheetId);
  assertRead("bills", "the sheet's cash requests", error);
  return (count ?? 0) > 0;
}

export type PayableSheet = {
  id: string;
  reference: string;
  vendor_id: string;
  vendor_name: string;
  company_name: string;
  bill_count: number;
  total: number;
  pending: number;
  /** The share of the contractor's advances still out that this sheet could take, oldest sheet first. */
  advance_out: number;
};

/** Approved sheets with something pending: what a cash request asks for. */
export async function listPayableSheets(): Promise<PayableSheet[]> {
  await requireTool("/bills");
  const supabase = await createClient();
  const [sheets, advances, recovered] = await Promise.all([
    listSheets({ state: "approved" }),
    fetchAll((from, to) =>
      supabase
        .from("contractor_advances")
        .select("id, vendor_id, amount")
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("advance_recoveries")
        .select("id, advance_id, amount")
        .order("id")
        .range(from, to),
    ),
  ]);
  const back = new Map<string, number>();
  for (const row of recovered)
    back.set(row.advance_id, (back.get(row.advance_id) ?? 0) + row.amount);
  // A reversal row is the same amount below zero, so the plain sums already net it.
  const out = new Map<string, number>();
  for (const advance of advances) {
    const left = advance.amount - (back.get(advance.id) ?? 0);
    out.set(advance.vendor_id, (out.get(advance.vendor_id) ?? 0) + left);
  }
  return [...sheets]
    .filter((sheet) => sheet.pending > 0)
    .reverse()
    .map((sheet) => {
      const left = Math.max(0, roundPaise(out.get(sheet.vendor_id) ?? 0));
      const share = Math.min(left, sheet.pending);
      out.set(sheet.vendor_id, left - share);
      return {
        id: sheet.id,
        reference: sheet.reference,
        vendor_id: sheet.vendor_id,
        vendor_name: sheet.vendor_name,
        company_name: sheet.company_name,
        bill_count: sheet.bill_count,
        total: sheet.total,
        pending: sheet.pending,
        advance_out: roundPaise(share),
      };
    });
}
