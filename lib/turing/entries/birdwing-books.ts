/** Birdwing Books: expenses, attendance, and its staff, pay rules and heads, through its own saves. */
import type { Field, Value } from "../catalogue-fields";
import { defineEntries } from "./define";

// Books' fixed list, restated for Turing (which may not import it); birdwing-books.test.ts holds it equal.
export const ATTENDANCE = ["present", "half_day", "leave", "holiday_leave", "absent"];
export const WORKED = ["present", "half_day"];

// Books' checkboxes send the browser's own "on".
const BOOKS = { file: "lib/birdwing-books/actions.ts", ticked: "on" } as const;
const SETTINGS = { file: "lib/birdwing-books/settings-actions.ts", ticked: "on" } as const;

const filled = (values: Record<string, Value>, key: string) =>
  typeof values[key] === "string" && values[key] !== "";
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A month written 2026-10, a time 08:30: the forms' own shapes. */
export function shapeRefused(values: Record<string, Value>, months: string[], times: string[]) {
  if (
    months.some(
      (key) => filled(values, key) && !/^\d{4}-(0[1-9]|1[0-2])$/.test(String(values[key])),
    )
  )
    return "A month is written 2026-10, the year and the month.";
  if (times.some((key) => filled(values, key) && !TIME.test(String(values[key]))))
    return "A time is written 08:30, on the 24-hour clock.";
  return undefined;
}

const words = (key: string, label: string, max: number): Field => ({
  key,
  label,
  kind: "text",
  optional: true,
  max,
});
const expense: Field = {
  key: "expense_id",
  label: "Expense",
  kind: "id",
  table: "birdwing_expenses",
  record: true,
};
const staffDay: Field[] = [
  { key: "staff_id", label: "Person", kind: "id", table: "birdwing_staff", record: true },
  { key: "on_date", label: "Day", kind: "date", record: true },
];
const order = (start?: string): Field => ({
  key: "sort_order",
  label: "Order",
  kind: "whole",
  optional: true,
  ...(start === undefined ? {} : { start }),
});
/** Books stores an order of 0 as 100, so 0 is refused rather than changed unsaid. */
const orderCheck = (values: Record<string, Value>) =>
  values.sort_order === "0" ? "An order on the list starts at 1." : undefined;
const active = (start?: true): Field => ({
  key: "is_active",
  label: "In use",
  kind: "yesno",
  optional: true,
  ...(start === undefined ? {} : { start }),
});
const expenseFields = (adding: boolean): Field[] => [
  {
    key: "accounting_month",
    label: "Counts in",
    kind: "text",
    max: 7,
    ...(adding ? {} : { optional: true, keep: true }),
  },
  {
    key: "head_id",
    label: "Head",
    kind: "id",
    table: "birdwing_expense_heads",
    ...(adding ? {} : { optional: true, keep: true }),
  },
  {
    key: "description",
    label: "For",
    kind: "text",
    max: 200,
    ...(adding ? {} : { optional: true, keep: true }),
  },
  {
    key: "amount",
    label: "Amount ₹",
    kind: "amount",
    ...(adding ? {} : { optional: true, keep: true }),
  },
  { key: "spent_on", label: "Paid on", kind: "date", optional: true },
  { key: "vendor_id", label: "Vendor", kind: "id", table: "vendors", optional: true },
  words("payee", "Paid to", 120),
  words("bill_ref", "Bill no.", 60),
  words("payment_details", "How paid", 200),
];
const ruleFields = (adding: boolean): Field[] => [
  {
    key: "effective_from",
    label: "From",
    kind: "date",
    ...(adding ? {} : { optional: true, keep: true }),
  },
  {
    key: "base_salary",
    label: "Base ₹ a month",
    kind: "amount",
    ...(adding ? {} : { optional: true, keep: true }),
  },
  words("shift_start", "Shift starts", 5),
  words("shift_end", "Shift ends", 5),
  { key: "ot_rate_per_hr", label: "Overtime ₹ an hour", kind: "amount", optional: true },
  { key: "room_day_rate", label: "₹ a room-day", kind: "amount", optional: true },
  { key: "guest_day_rate", label: "₹ a guest-day", kind: "amount", optional: true },
  words("notes", "Notes", 200),
];
const shiftShape = (values: Record<string, Value>) =>
  shapeRefused(values, [], ["shift_start", "shift_end"]);

export const BIRDWING_BOOKS = defineEntries([
  {
    key: "bb_expense_new",
    tool: "/birdwing-books",
    form: { ...BOOKS, reader: "readExpenseForm" },
    title: "An expense",
    description:
      "Records one of Birdwing's expenses: the month it counts in (written 2026-10), its head (an active one of birdwing_expense_heads, never the salary head: salaries are confirmed on the Salaries screen), what it was for, the amount, the day it was paid (never later than today), the vendor (vendors) or just who was paid, the bill number and how it was paid. Read the month's birdwing_expenses first and propose only what is not there.",
    adds: true,
    fields: expenseFields(true),
    check: (values) => shapeRefused(values, ["accounting_month"], []),
  },
  {
    key: "bb_expense_change",
    tool: "/birdwing-books",
    form: { ...BOOKS, reader: "readExpenseForm" },
    title: "An expense, changed",
    description:
      "Changes an expense line (birdwing_expenses.id) still recorded — a confirmed one is marked recorded again first (bb_expense_status) — and never a confirmed salary's line. Each left out stays as it is.",
    fields: [expense, ...expenseFields(false)],
    check: (values) => shapeRefused(values, ["accounting_month"], []),
  },
  {
    key: "bb_expense_status",
    tool: "/birdwing-books",
    title: "An expense, confirmed",
    description:
      "Marks an expense line confirmed (checked against its bill), or recorded again so it can be changed or removed. Never a confirmed salary's line.",
    fields: [
      expense,
      { key: "status", label: "Mark as", kind: "choice", choices: ["confirmed", "recorded"] },
    ],
  },
  {
    key: "bb_expense_delete",
    tool: "/birdwing-books",
    title: "An expense, removed",
    description:
      "Removes an expense line entered by mistake: only one still recorded, with no bill attached (its bill is removed on the Expenses screen first), and never a confirmed salary's line.",
    fields: [expense],
  },
  {
    key: "bb_attendance",
    tool: "/birdwing-books",
    form: { ...BOOKS, reader: "saveAttendance" },
    title: "A day's attendance",
    description:
      "Marks one person's day (birdwing_staff.id, never a day still to come): present, half_day, leave, holiday_leave or absent; for a day worked, the time in and out (both, 24-hour, 08:30) and the break in minutes; a note. A day already marked keeps what is left out; an unmarked one needs its status. Someone who has left is marked only in a month they already have days in. A month whose salary is confirmed is closed.",
    fields: [
      ...staffDay,
      {
        key: "status",
        label: "Status",
        kind: "choice",
        choices: ATTENDANCE,
        optional: true,
        keep: true,
      },
      words("in_at", "In", 5),
      words("out_at", "Out", 5),
      { key: "break_minutes", label: "Break (minutes)", kind: "whole", optional: true },
      words("note", "Note", 200),
    ],
    check: (values) => shapeRefused(values, [], ["in_at", "out_at"]),
  },
  {
    key: "bb_attendance_clear",
    tool: "/birdwing-books",
    title: "A day's attendance, cleared",
    description:
      "Clears one person's marked day, leaving it unmarked. Not in a month whose salary is confirmed.",
    fields: staffDay,
  },
  {
    key: "bb_all_present",
    tool: "/birdwing-books",
    title: "Everyone present",
    description:
      "Marks everyone working present today, as the morning's one press does; nobody already marked today is changed. Only today: an earlier day is marked person by person (bb_attendance).",
    fields: [{ key: "on_date", label: "Day", kind: "date", optional: true }],
  },
  {
    key: "bb_staff_new",
    tool: "/birdwing-books",
    form: { ...SETTINGS, reader: "saveStaff" },
    title: "A staff member",
    description:
      "Adds a person to Birdwing's staff (an admin's, in Books → Settings): name, role, the day they joined, their toolbox account if they have one (profiles), order on the list (100 if left out) and whether they work there now (true if left out). Their pay is a pay rule (bb_pay_rule_new).",
    adds: true,
    fields: [
      { key: "name", label: "Name", kind: "text", max: 80 },
      words("role", "Role", 80),
      { key: "joined_on", label: "Joined", kind: "date", optional: true },
      {
        key: "profile_id",
        label: "Toolbox account",
        kind: "id",
        table: "profiles",
        optional: true,
      },
      order("100"),
      active(true),
    ],
    check: orderCheck,
  },
  {
    key: "bb_staff_change",
    tool: "/birdwing-books",
    form: { ...SETTINGS, reader: "saveStaff" },
    title: "A staff member, changed",
    description:
      "Changes a staff member (birdwing_staff.id): name, role, joined, toolbox account, order, or whether they work there now (is_active false once they leave). Each left out stays as it is.",
    fields: [
      { key: "staff_id", label: "Person", kind: "id", table: "birdwing_staff", record: true },
      { key: "name", label: "Name", kind: "text", optional: true, keep: true, max: 80 },
      words("role", "Role", 80),
      { key: "joined_on", label: "Joined", kind: "date", optional: true },
      {
        key: "profile_id",
        label: "Toolbox account",
        kind: "id",
        table: "profiles",
        optional: true,
      },
      order(),
      active(),
    ],
    check: orderCheck,
  },
  {
    key: "bb_pay_rule_new",
    tool: "/birdwing-books",
    title: "A pay rule",
    description:
      "Gives a staff member a pay rule from a day (an admin's): a raise is a new rule from its first day, and months already paid keep theirs. Base salary a month; the shift (both ends, 24-hour, 08:30; neither for a fixed salary); rupees an overtime hour, a room-day and a guest-day (0 if left out); notes.",
    adds: true,
    fields: [
      { key: "staff_id", label: "Person", kind: "id", table: "birdwing_staff" },
      ...ruleFields(true),
    ],
    check: (values) =>
      shiftShape(values) ??
      (filled(values, "shift_start") !== filled(values, "shift_end")
        ? "Give both ends of the shift, or neither for a fixed salary."
        : undefined),
  },
  {
    key: "bb_pay_rule_change",
    tool: "/birdwing-books",
    title: "A pay rule, corrected",
    description:
      "Corrects a pay rule (birdwing_pay_rules.id) typed wrong; a raise is a new rule instead (bb_pay_rule_new). A salary already confirmed keeps its figures. Each left out stays as it is; a shift keeps both ends or neither.",
    fields: [
      { key: "rule_id", label: "Pay rule", kind: "id", table: "birdwing_pay_rules", record: true },
      ...ruleFields(false),
    ],
    check: shiftShape,
  },
  {
    key: "bb_head_new",
    tool: "/birdwing-books",
    form: { ...SETTINGS, reader: "saveHead" },
    title: "An expense head",
    description:
      "Adds an expense head (an admin's): its name, order on the list (100 if left out) and whether it is in use (true if left out).",
    adds: true,
    fields: [{ key: "name", label: "Name", kind: "text", max: 60 }, order("100"), active(true)],
    check: orderCheck,
  },
  {
    key: "bb_head_change",
    tool: "/birdwing-books",
    form: { ...SETTINGS, reader: "saveHead" },
    title: "An expense head, changed",
    description:
      "Renames an expense head (birdwing_expense_heads.id), moves it on the list, or takes it out of use or back. Each left out stays as it is.",
    fields: [
      { key: "head_id", label: "Head", kind: "id", table: "birdwing_expense_heads", record: true },
      { key: "name", label: "Name", kind: "text", optional: true, keep: true, max: 60 },
      order(),
      active(),
    ],
    check: orderCheck,
  },
]);
