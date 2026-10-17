import "server-only";

import { requireTool } from "@/lib/auth/access";
import { todayInIndia } from "@/lib/format";
import { labelsById, profileNames } from "@/lib/masters/names";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { readFailed } from "@/lib/supabase/read-failed";
import { createClient } from "@/lib/supabase/server";
import {
  computeSalary,
  ruleForMonth,
  type AttendanceDay,
  type DayOccupancy,
  type PayRule,
  type SalaryPreview,
} from "./payroll";
import {
  ATTENDANCE_STATUSES,
  GRANT,
  oneOf,
  shiftMonth,
  type AttendanceStatus,
  type ExpenseStatus,
} from "./shared";

/**
 * Every function opens with requireTool(GRANT): the 0116 policies gate SELECT too. Reads nothing
 * outside Books but `vendors` and `profiles` (names) and ONE Stays view,
 * `birdwing_occupancy_facts` (counts only, STATUS.md contract table).
 */

const fail = (context: string, error: { message: string }): never =>
  readFailed("birdwing-books", context, error);

type Client = Awaited<ReturnType<typeof createClient>>;

const monthEnd = (month: string) => shiftMonth(month, 1) + "-01";

export type HeadRow = {
  id: string;
  name: string;
  isSalary: boolean;
  sortOrder: number;
  isActive: boolean;
};

export async function listHeads(): Promise<HeadRow[]> {
  await requireTool(GRANT);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("birdwing_expense_heads")
    .select("id, name, is_salary, sort_order, is_active")
    .order("sort_order")
    .order("name");
  if (error) fail("the expense heads", error);
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    isSalary: row.is_salary,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  }));
}

export type StaffRow = {
  id: string;
  name: string;
  role: string | null;
  profileId: string | null;
  joinedOn: string | null;
  sortOrder: number;
  isActive: boolean;
};

export async function listStaff(): Promise<StaffRow[]> {
  await requireTool(GRANT);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("birdwing_staff")
    .select("id, name, role, profile_id, joined_on, sort_order, is_active")
    .order("sort_order")
    .order("name");
  if (error) fail("the staff", error);
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    role: row.role,
    profileId: row.profile_id,
    joinedOn: row.joined_on,
    sortOrder: row.sort_order,
    isActive: row.is_active,
  }));
}

export type PayRuleRow = PayRule & { id: string; staffId: string; notes: string | null };

export async function listPayRules(): Promise<PayRuleRow[]> {
  await requireTool(GRANT);
  const supabase = await createClient();
  const data = await fetchAll((from, to) =>
    supabase
      .from("birdwing_pay_rules")
      .select(
        "id, staff_id, effective_from, base_salary, shift_start, shift_end, ot_rate_per_hr, room_day_rate, guest_day_rate, notes",
      )
      .order("effective_from", { ascending: false })
      .order("id")
      .range(from, to),
  );
  return data.map((row) => ({
    id: row.id,
    staffId: row.staff_id,
    effectiveFrom: row.effective_from,
    baseSalary: Number(row.base_salary),
    shiftStart: row.shift_start ? row.shift_start.slice(0, 5) : null,
    shiftEnd: row.shift_end ? row.shift_end.slice(0, 5) : null,
    otRatePerHr: Number(row.ot_rate_per_hr),
    roomDayRate: Number(row.room_day_rate),
    guestDayRate: Number(row.guest_day_rate),
    notes: row.notes,
  }));
}

export async function getWelcomeCounts(): Promise<{
  linesThisMonth: number;
  withoutBill: number;
  attendanceGaps: number;
  salariesToConfirm: number;
}> {
  await requireTool(GRANT);
  const supabase = await createClient();
  const today = todayInIndia();
  const month = `${today.slice(0, 7)}-01`;
  const lastMonth = `${shiftMonth(today, -1)}-01`;

  const [lines, staff, attendance, runs] = await Promise.all([
    fetchAll((from, to) =>
      supabase
        .from("birdwing_expenses")
        .select("id, salary_run_id")
        .eq("accounting_month", month)
        .order("id")
        .range(from, to),
    ),
    supabase.from("birdwing_staff").select("id").eq("is_active", true),
    supabase
      .from("birdwing_attendance")
      .select("id", { count: "exact", head: true })
      .gte("on_date", month)
      .lte("on_date", today),
    supabase.from("birdwing_salary_runs").select("staff_id").eq("month", lastMonth),
  ]);
  if (staff.error) fail("the welcome counts", staff.error);
  if (attendance.error) fail("the welcome counts", attendance.error);
  if (runs.error) fail("the welcome counts", runs.error);

  const ids = lines.filter((line) => !line.salary_run_id).map((line) => line.id);
  const billed = new Set<string>();
  for (let index = 0; index < ids.length; index += 100) {
    const { data, error } = await supabase
      .from("birdwing_expense_files")
      .select("expense_id")
      .in("expense_id", ids.slice(index, index + 100));
    if (error) fail("the welcome counts", error);
    for (const row of data ?? []) billed.add(row.expense_id);
  }

  const people = staff.data?.length ?? 0;
  const confirmed = new Set((runs.data ?? []).map((run) => run.staff_id));
  return {
    linesThisMonth: lines.length,
    withoutBill: ids.filter((id) => !billed.has(id)).length,
    attendanceGaps: Math.max(0, people * Number(today.slice(8, 10)) - (attendance.count ?? 0)),
    salariesToConfirm: (staff.data ?? []).filter((person) => !confirmed.has(person.id)).length,
  };
}

export type ExpenseRow = {
  id: string;
  month: string;
  headId: string;
  headName: string;
  description: string;
  spentOn: string | null;
  amount: number;
  vendorId: string | null;
  vendorName: string | null;
  payee: string | null;
  billRef: string | null;
  paymentDetails: string | null;
  status: ExpenseStatus;
  reviewNote: string | null;
  isSalary: boolean;
  /** The old sheet's "Sheet!Cell" for an imported line; null for one made here. */
  sourceKey: string | null;
  files: { id: string; fileName: string }[];
};

export async function listExpenses(
  month: string,
  headId?: string,
): Promise<{ rows: ExpenseRow[]; byHead: { name: string; amount: number }[]; total: number }> {
  await requireTool(GRANT);
  const supabase = await createClient();
  const first = `${month.slice(0, 7)}-01`;

  const [lines, heads] = await Promise.all([
    fetchAll((from, to) => {
      let query = supabase
        .from("birdwing_expenses")
        .select(
          "id, accounting_month, head_id, description, spent_on, amount, vendor_id, payee, bill_ref, payment_details, status, review_note, salary_run_id, source_key",
        )
        .eq("accounting_month", first);
      if (headId) query = query.eq("head_id", headId);
      return query.order("spent_on", { nullsFirst: true }).order("id").range(from, to);
    }),
    supabase.from("birdwing_expense_heads").select("id, name, sort_order"),
  ]);
  if (heads.error) fail("the expense heads", heads.error);
  const headName = new Map((heads.data ?? []).map((head) => [head.id, head.name]));
  const headOrder = new Map((heads.data ?? []).map((head) => [head.id, head.sort_order]));

  const ids = lines.map((line) => line.id);
  const files: { id: string; expense_id: string; file_name: string }[] = [];
  for (let index = 0; index < ids.length; index += 100) {
    const { data, error } = await supabase
      .from("birdwing_expense_files")
      .select("id, expense_id, file_name")
      .in("expense_id", ids.slice(index, index + 100))
      .order("created_at");
    if (error) fail("the bills", error);
    files.push(...(data ?? []));
  }
  const vendors = await labelsById(
    supabase,
    "vendors",
    lines.map((line) => line.vendor_id),
  );

  const rows: ExpenseRow[] = lines
    .map((line) => ({
      id: line.id,
      month: line.accounting_month,
      headId: line.head_id,
      headName: headName.get(line.head_id) ?? "—",
      description: line.description,
      spentOn: line.spent_on,
      amount: Number(line.amount),
      vendorId: line.vendor_id,
      vendorName: line.vendor_id ? (vendors.get(line.vendor_id) ?? null) : null,
      payee: line.payee,
      billRef: line.bill_ref,
      paymentDetails: line.payment_details,
      status: line.status === "confirmed" ? ("confirmed" as const) : ("recorded" as const),
      reviewNote: line.review_note,
      isSalary: line.salary_run_id !== null,
      sourceKey: line.source_key,
      files: files
        .filter((file) => file.expense_id === line.id)
        .map((file) => ({ id: file.id, fileName: file.file_name })),
    }))
    .sort(
      (a, b) =>
        (headOrder.get(a.headId) ?? 0) - (headOrder.get(b.headId) ?? 0) ||
        (a.spentOn ?? "").localeCompare(b.spentOn ?? ""),
    );

  const sums = new Map<string, number>();
  for (const row of rows) sums.set(row.headName, (sums.get(row.headName) ?? 0) + row.amount);
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  return {
    rows,
    byHead: [...sums.entries()]
      .map(([name, amount]) => ({ name, amount: Math.round(amount * 100) / 100 }))
      .sort((a, b) => b.amount - a.amount),
    total: Math.round(total * 100) / 100,
  };
}

export async function existingSourceKeys(keys: string[]): Promise<Set<string>> {
  await requireTool(GRANT);
  const supabase = await createClient();
  const found = new Set<string>();
  for (let index = 0; index < keys.length; index += 100) {
    const { data, error } = await supabase
      .from("birdwing_expenses")
      .select("source_key")
      .in("source_key", keys.slice(index, index + 100));
    if (error) fail("the existing lines", error);
    for (const row of data ?? []) if (row.source_key) found.add(row.source_key);
  }
  return found;
}

export type AttendanceRecord = {
  status: AttendanceStatus;
  inAt: string | null;
  outAt: string | null;
  breakMinutes: number;
  note: string | null;
};

export type AttendanceMonth = {
  staff: StaffRow[];
  records: Map<string, Map<string, AttendanceRecord>>;
  /** Staff whose salary for this month is confirmed — their month is closed. */
  closed: Set<string>;
};

export async function getAttendanceMonth(month: string): Promise<AttendanceMonth> {
  await requireTool(GRANT);
  const supabase = await createClient();
  const first = `${month.slice(0, 7)}-01`;
  const [staff, rows, runs] = await Promise.all([
    listStaff(),
    fetchAll((from, to) =>
      supabase
        .from("birdwing_attendance")
        .select("staff_id, on_date, status, in_at, out_at, break_minutes, note")
        .gte("on_date", first)
        .lt("on_date", monthEnd(first))
        .order("id")
        .range(from, to),
    ),
    supabase.from("birdwing_salary_runs").select("staff_id").eq("month", first),
  ]);
  if (runs.error) fail("the salary runs", runs.error);

  const records = new Map<string, Map<string, AttendanceRecord>>();
  for (const row of rows) {
    const byDay = records.get(row.staff_id) ?? new Map<string, AttendanceRecord>();
    byDay.set(row.on_date, {
      status: oneOf(ATTENDANCE_STATUSES, row.status) ?? "present",
      inAt: row.in_at ? row.in_at.slice(0, 5) : null,
      outAt: row.out_at ? row.out_at.slice(0, 5) : null,
      breakMinutes: row.break_minutes,
      note: row.note,
    });
    records.set(row.staff_id, byDay);
  }
  return {
    // Everyone working now, and anyone switched off since who has days here.
    staff: staff.filter((person) => person.isActive || records.has(person.id)),
    records,
    closed: new Set((runs.data ?? []).map((run) => run.staff_id)),
  };
}

export type SalaryRun = {
  id: string;
  base: number;
  otHours: number;
  otAmount: number;
  roomDays: number;
  roomAmount: number;
  guestDays: number;
  guestAmount: number;
  incentives: number;
  deductions: number;
  total: number;
  note: string | null;
  confirmedAt: string;
  confirmedByName: string | null;
};

export type SalaryCard = {
  staff: StaffRow;
  rule: PayRuleRow | null;
  preview: SalaryPreview | null;
  daysRecorded: number;
  run: SalaryRun | null;
  /** Salary already in Expenses that no run wrote (the old sheet's, or typed by hand). Confirming on top would pay the month twice, so the screen and action refuse. */
  recordedElsewhere: number;
};

/** "Sajna", "Sajna — salary", "Reviewed payroll Sajna": this person's line? */
function namesPerson(line: { payee: string | null; description: string }, name: string): boolean {
  const who = name.trim().toLowerCase();
  const payee = (line.payee ?? "").trim().toLowerCase();
  const description = line.description.trim().toLowerCase();
  return payee === who || description === who || description.startsWith(`${who} `);
}

async function occupancyFor(supabase: Client, first: string): Promise<Map<string, DayOccupancy>> {
  const rows = await fetchAll((from, to) =>
    supabase
      .from("birdwing_occupancy_facts")
      .select("on_date, rooms_occupied, guests_in_house")
      .gte("on_date", first)
      .lt("on_date", monthEnd(first))
      .order("on_date")
      .range(from, to),
  );
  return new Map(
    rows
      .filter((row) => row.on_date !== null)
      .map((row) => [
        row.on_date as string,
        { rooms: row.rooms_occupied ?? 0, guests: row.guests_in_house ?? 0 },
      ]),
  );
}

export async function getSalaryBoard(month: string): Promise<SalaryCard[]> {
  await requireTool(GRANT);
  const supabase = await createClient();
  const first = `${month.slice(0, 7)}-01`;

  const [attendance, rules, occupancy, runs, salaryLines] = await Promise.all([
    getAttendanceMonth(first),
    listPayRules(),
    occupancyFor(supabase, first),
    supabase
      .from("birdwing_salary_runs")
      .select(
        "id, staff_id, base, ot_hours, ot_amount, room_days, room_amount, guest_days, guest_amount, incentives, deductions, total, note, confirmed_at, confirmed_by",
      )
      .eq("month", first),
    supabase
      .from("birdwing_expenses")
      .select("payee, description, amount, birdwing_expense_heads!inner(is_salary)")
      .eq("accounting_month", first)
      .is("salary_run_id", null)
      .eq("birdwing_expense_heads.is_salary", true),
  ]);
  if (runs.error) fail("the salary runs", runs.error);
  if (salaryLines.error) fail("the salary lines", salaryLines.error);
  const names = await profileNames(
    supabase,
    (runs.data ?? []).map((run) => run.confirmed_by),
  );

  return attendance.staff.map((person) => {
    const days: AttendanceDay[] = [
      ...(attendance.records.get(person.id) ?? new Map()).entries(),
    ].map(([onDate, record]) => ({
      onDate,
      status: record.status,
      inAt: record.inAt,
      outAt: record.outAt,
    }));
    const personRules = rules.filter((rule) => rule.staffId === person.id);
    const rule = (ruleForMonth(personRules, first) as PayRuleRow | null) ?? null;
    const run = (runs.data ?? []).find((row) => row.staff_id === person.id);
    return {
      staff: person,
      rule,
      preview: rule ? computeSalary({ rule, days, occupancy }) : null,
      daysRecorded: days.length,
      recordedElsewhere:
        Math.round(
          (salaryLines.data ?? [])
            .filter((line) => namesPerson(line, person.name))
            .reduce((total, line) => total + Number(line.amount), 0) * 100,
        ) / 100,
      run: run
        ? {
            id: run.id,
            base: Number(run.base),
            otHours: Number(run.ot_hours),
            otAmount: Number(run.ot_amount),
            roomDays: run.room_days,
            roomAmount: Number(run.room_amount),
            guestDays: run.guest_days,
            guestAmount: Number(run.guest_amount),
            incentives: Number(run.incentives),
            deductions: Number(run.deductions),
            total: Number(run.total),
            note: run.note,
            confirmedAt: run.confirmed_at,
            confirmedByName: run.confirmed_by ? (names.get(run.confirmed_by) ?? null) : null,
          }
        : null,
    };
  });
}

export async function getSalaryPreview(
  staffId: string,
  month: string,
): Promise<{ name: string; preview: SalaryPreview; recordedElsewhere: number } | null> {
  const board = await getSalaryBoard(month);
  const card = board.find((entry) => entry.staff.id === staffId);
  if (!card || !card.preview) return null;
  return {
    name: card.staff.name,
    preview: card.preview,
    recordedElsewhere: card.recordedElsewhere,
  };
}

/** Toolbox accounts a staff member may be linked to (the shared `profiles`, names only). */
export async function listProfileOptions(): Promise<{ id: string; name: string }[]> {
  await requireTool(GRANT);
  const supabase = await createClient();
  const data = await fetchAll((from, to) =>
    supabase
      .from("profiles")
      .select("id, full_name, is_active")
      .order("full_name")
      .order("id")
      .range(from, to),
  );
  return data
    .filter((profile) => profile.is_active && profile.full_name)
    .map((profile) => ({ id: profile.id, name: profile.full_name as string }));
}
