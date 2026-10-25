import "server-only";

import {
  addExpense,
  clearAttendance,
  deleteExpense,
  markAllPresent,
  saveAttendance,
  setExpenseStatus,
  updateExpense,
} from "@/lib/birdwing-books/actions";
import { saveHead, savePayRule, saveStaff } from "@/lib/birdwing-books/settings-actions";
import { createClient } from "@/lib/supabase/server";

import { entryFor, formOf, type Entry } from "../catalogue-fields";
import { WORKED, type BIRDWING_BOOKS } from "../entries/birdwing-books";
import { failed, given, recordNow, retired, type Runners, type Values } from "./kit";

type Key = (typeof BIRDWING_BOOKS)[number]["key"];
type Refusal = { error: string } | null;

const text = (values: Values, key: string) =>
  typeof values[key] === "string" && values[key] ? String(values[key]).trim() : null;
const entry = (key: Key) => entryFor(key) as Entry;
/** A time column reads 08:30:00; the forms take 08:30. */
const clock = (value: unknown) => (typeof value === "string" ? value.slice(0, 5) : null);

/** The expense form offers heads in use, never the salary head — and keeps the one a line has. */
async function headRefused(id: string | null, current: unknown = null): Promise<Refusal> {
  if (!id || id === current) return null;
  const head = await recordNow(
    "birdwing_expense_heads",
    { column: "id", id },
    ["is_active", "is_salary"],
    "That expense head is gone.",
  );
  if ("error" in head) return head;
  if (head.row.is_salary)
    return { error: "Salaries are confirmed on the Salaries screen, not entered as expenses." };
  return head.row.is_active === false ? { error: "That expense head is not in use." } : null;
}

/** A confirmed salary's line is its run's, and the screen offers nothing on it. */
async function lineNow(id: string, columns: string[] = []) {
  const now = await recordNow(
    "birdwing_expenses",
    { column: "id", id },
    ["status", "salary_run_id", ...columns],
    "That expense line is gone.",
  );
  if ("error" in now) return now;
  if (now.row.salary_run_id)
    return { error: "That is a confirmed salary's line; it never changes." };
  return now;
}

export const BIRDWING_BOOKS_RUNNERS: Runners<Key> = {
  bb_expense_new: async (v) => {
    const refused =
      (await headRefused(text(v, "head_id"))) ?? (await retired("vendors", text(v, "vendor_id")));
    if (refused) return refused;
    return addExpense(undefined, formOf(entry("bb_expense_new"), v));
  },
  bb_expense_change: async (v) => {
    const id = String(v.expense_id);
    const now = await lineNow(id, [
      "accounting_month",
      "head_id",
      "description",
      "amount",
      "spent_on",
      "vendor_id",
      "payee",
      "bill_ref",
      "payment_details",
    ]);
    if ("error" in now) return now;
    if (now.row.status === "confirmed")
      return { error: "That line is confirmed; mark it recorded again first (bb_expense_status)." };
    const vendor = text(v, "vendor_id");
    const refused =
      (await headRefused(text(v, "head_id"), now.row.head_id)) ??
      (vendor !== now.row.vendor_id ? await retired("vendors", vendor) : null);
    if (refused) return refused;
    const form = formOf(entry("bb_expense_change"), v, {
      ...now.row,
      accounting_month: String(now.row.accounting_month ?? "").slice(0, 7),
    });
    return updateExpense(id, undefined, form);
  },
  bb_expense_status: async (v) => {
    const id = String(v.expense_id);
    const now = await lineNow(id);
    if ("error" in now) return now;
    if (now.row.status === v.status) return { error: `That line is already ${v.status}.` };
    return setExpenseStatus(id, v.status === "confirmed" ? "confirmed" : "recorded");
  },
  bb_expense_delete: async (v) => {
    const id = String(v.expense_id);
    const now = await lineNow(id);
    if ("error" in now) return now;
    if (now.row.status === "confirmed")
      return { error: "That line is confirmed; mark it recorded again first (bb_expense_status)." };
    return deleteExpense(id);
  },
  bb_attendance: async (v) => {
    const staffId = String(v.staff_id);
    const onDate = String(v.on_date);
    const supabase = await createClient();
    const { data: day, error } = await supabase
      .from("birdwing_attendance")
      .select("status, in_at, out_at, break_minutes, note")
      .eq("staff_id", staffId)
      .eq("on_date", onDate)
      .maybeSingle();
    if (error) return failed("birdwing_attendance", error);
    const status = given(v, "status", day?.status);
    if (!status)
      return { error: "Give the day's status: present, half_day, leave, holiday_leave or absent." };
    // The day sheet shows times and a break only for a day worked; the save drops them otherwise.
    if (
      !WORKED.includes(status) &&
      ["in_at", "out_at", "break_minutes"].some((key) => text(v, key))
    )
      return { error: "A day not worked has no times or break." };
    const form = formOf(entry("bb_attendance"), v, {
      ...day,
      in_at: clock(day?.in_at),
      out_at: clock(day?.out_at),
    });
    form.set("status", status);
    return saveAttendance(staffId, onDate, undefined, form);
  },
  bb_attendance_clear: async (v) => {
    const staffId = String(v.staff_id);
    const onDate = String(v.on_date);
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("birdwing_attendance")
      .select("id")
      .eq("staff_id", staffId)
      .eq("on_date", onDate)
      .maybeSingle();
    if (error) return failed("birdwing_attendance", error);
    if (!data) return { error: "That day is not marked." };
    return clearAttendance(staffId, onDate);
  },
  bb_all_present: (v) => markAllPresent(String(v.on_date)),
  bb_staff_new: (v) => saveStaff(null, undefined, formOf(entry("bb_staff_new"), v)),
  bb_staff_change: async (v) => {
    const id = String(v.staff_id);
    const now = await recordNow(
      "birdwing_staff",
      { column: "id", id },
      ["name", "role", "joined_on", "profile_id", "sort_order", "is_active"],
      "That person is gone.",
    );
    if ("error" in now) return now;
    return saveStaff(id, undefined, formOf(entry("bb_staff_change"), v, now.row));
  },
  bb_pay_rule_new: (v) => savePayRule(null, undefined, formOf(entry("bb_pay_rule_new"), v)),
  bb_pay_rule_change: async (v) => {
    const id = String(v.rule_id);
    const now = await recordNow(
      "birdwing_pay_rules",
      { column: "id", id },
      [
        "staff_id",
        "effective_from",
        "base_salary",
        "shift_start",
        "shift_end",
        "ot_rate_per_hr",
        "room_day_rate",
        "guest_day_rate",
        "notes",
      ],
      "That pay rule is gone.",
    );
    if ("error" in now) return now;
    const form = formOf(entry("bb_pay_rule_change"), v, {
      ...now.row,
      shift_start: clock(now.row.shift_start),
      shift_end: clock(now.row.shift_end),
    });
    form.set("staff_id", String(now.row.staff_id));
    return savePayRule(id, undefined, form);
  },
  bb_head_new: (v) => saveHead(null, undefined, formOf(entry("bb_head_new"), v)),
  bb_head_change: async (v) => {
    const id = String(v.head_id);
    const now = await recordNow(
      "birdwing_expense_heads",
      { column: "id", id },
      ["name", "sort_order", "is_active"],
      "That expense head is gone.",
    );
    if ("error" in now) return now;
    return saveHead(id, undefined, formOf(entry("bb_head_change"), v, now.row));
  },
};
