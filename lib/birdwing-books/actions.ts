"use server";

// Type-only imports, never re-exported from a "use server" file — the
// 2026-08-03 outage rule, enforced by npm run check:actions.
import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { dbErrorMessage } from "@/lib/db-error";
import { optionalText, text } from "@/lib/form-data";
import { todayInIndia } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { existingSourceKeys, getSalaryPreview, listHeads } from "./queries";
import { ATTENDANCE_STATUSES, GRANT, oneOf } from "./shared";
import { readAmount, readExpenseUpload, type UploadLine } from "./upload";

/**
 * Writes for Birdwing Books — expense lines and their upload, attendance,
 * and confirming a month's salary. Settings (staff, pay rules, heads) are
 * settings-actions.ts, admin only; bills are files-actions.ts.
 *
 * Every action opens with requireTool and revalidates the layout. The
 * guards in 0116 refuse in plain English (a confirmed line, a salary
 * line, a closed month); those sentences pass through.
 */

const GUARD_PHRASES = [
  "is confirmed",
  "confirmed salary",
  "attendance is closed",
  "origin never changes",
  "salary head",
  "comes to nothing",
  "whole month",
  "could not be found",
];

const refresh = () => revalidatePath("/birdwing-books", "layout");

function fromDb(error: { message: string; code?: string }, fallback: string): ActionState {
  console.error(`birdwing-books: ${fallback}`, error);
  return { error: dbErrorMessage(error, fallback, GUARD_PHRASES) };
}

const FIRST_OF_MONTH = /^\d{4}-\d{2}$/;

// ---------------------------------------------------------------------
// Expense lines
// ---------------------------------------------------------------------

function readExpenseForm(formData: FormData) {
  const month = text(formData, "accounting_month");
  if (!FIRST_OF_MONTH.test(month)) return { error: "Pick the month the cost belongs to." };
  const headId = text(formData, "head_id");
  if (!headId) return { error: "Pick the expense head." };
  const description = text(formData, "description");
  if (!description) return { error: "Say what it was for." };
  if (description.length > 200) return { error: "Keep the description under 200 characters." };
  const amount = readAmount(text(formData, "amount"));
  if (amount === null || amount <= 0) return { error: "Type the amount, like 1450 or 1450.50." };
  const spentOn = optionalText(formData, "spent_on");
  if (spentOn && spentOn > todayInIndia()) return { error: "It can't be paid in the future." };
  return {
    row: {
      accounting_month: `${month}-01`,
      head_id: headId,
      description,
      amount,
      spent_on: spentOn,
      vendor_id: optionalText(formData, "vendor_id"),
      payee: optionalText(formData, "payee"),
      bill_ref: optionalText(formData, "bill_ref"),
      payment_details: optionalText(formData, "payment_details"),
    },
  };
}

export async function addExpense(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const read = readExpenseForm(formData);
  if ("error" in read) return { error: read.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("birdwing_expenses")
    .insert({ ...read.row, created_by: user.id, updated_by: user.id });
  if (error) return fromDb(error, "Could not save the line. Try again.");
  refresh();
  return undefined;
}

export async function updateExpense(
  expenseId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const read = readExpenseForm(formData);
  if ("error" in read) return { error: read.error };
  const supabase = await createClient();
  const { error } = await supabase
    .from("birdwing_expenses")
    .update({ ...read.row, updated_by: user.id })
    .eq("id", expenseId);
  if (error) return fromDb(error, "Could not save the line. Try again.");
  refresh();
  return undefined;
}

export async function setExpenseStatus(
  expenseId: string,
  status: "recorded" | "confirmed",
): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const supabase = await createClient();
  const { error } = await supabase
    .from("birdwing_expenses")
    .update({
      status,
      ...(status === "confirmed" ? { review_note: null } : {}),
      updated_by: user.id,
    })
    .eq("id", expenseId);
  if (error) return fromDb(error, "Could not change the line. Try again.");
  refresh();
  return undefined;
}

export async function deleteExpense(expenseId: string): Promise<ActionState> {
  await requireTool(GRANT);
  const supabase = await createClient();
  const { count, error: countError } = await supabase
    .from("birdwing_expense_files")
    .select("id", { count: "exact", head: true })
    .eq("expense_id", expenseId);
  if (countError) return fromDb(countError, "Could not remove the line. Try again.");
  if ((count ?? 0) > 0) return { error: "Remove its bill first." };
  const { error } = await supabase.from("birdwing_expenses").delete().eq("id", expenseId);
  if (error) return fromDb(error, "Could not remove the line. Try again.");
  refresh();
  return undefined;
}

// ---------------------------------------------------------------------
// The upload — preview, then add what is new
// ---------------------------------------------------------------------

export type PreviewLine = UploadLine & { state: "new" | "already" | "problem" };
export type UploadPreview = { error?: string; lines?: PreviewLine[] };

async function readUpload(csv: string): Promise<UploadPreview> {
  if (csv.length > 2_000_000) return { error: "That file is too large — split it by year." };
  const heads = await listHeads();
  const { lines, error } = readExpenseUpload(
    csv,
    heads.filter((head) => head.isActive).map((head) => head.name),
  );
  if (error) return { error };
  const already = await existingSourceKeys(lines.map((line) => line.sourceKey));
  return {
    lines: lines.map((line) => ({
      ...line,
      state: line.problems.length > 0 ? "problem" : already.has(line.sourceKey) ? "already" : "new",
    })),
  };
}

/** What an upload would do — nothing is written. */
export async function previewExpenseUpload(csv: string): Promise<UploadPreview> {
  await requireTool(GRANT);
  return readUpload(csv);
}

/**
 * Adds the new lines only: a line already in (same sheet and cell) is
 * skipped and never overwritten, a line with a problem is left out. The
 * file is read again here — the browser's preview is never trusted.
 */
export async function commitExpenseUpload(
  csv: string,
): Promise<{ error?: string; added?: number; skipped?: number; refused?: number }> {
  const user = await requireTool(GRANT);
  const preview = await readUpload(csv);
  if (preview.error || !preview.lines) return { error: preview.error ?? "Nothing to add." };

  const heads = await listHeads();
  const headId = new Map(heads.map((head) => [head.name.toLowerCase(), head.id]));
  const fresh = preview.lines.filter((line) => line.state === "new");
  const rows = fresh.map((line) => ({
    accounting_month: line.month!,
    head_id: headId.get(line.head.toLowerCase())!,
    description: line.description.slice(0, 200),
    spent_on: line.spentOn,
    amount: line.amount!,
    payment_details: line.remarks,
    review_note: line.reviewNote,
    source_key: line.sourceKey,
    status: "recorded",
    created_by: user.id,
    updated_by: user.id,
  }));

  const supabase = await createClient();
  for (let index = 0; index < rows.length; index += 200) {
    const { error } = await supabase
      .from("birdwing_expenses")
      .insert(rows.slice(index, index + 200));
    if (error) {
      if (error.code === "23505") {
        return { error: "Someone added some of these lines a moment ago. Preview again." };
      }
      return { error: dbErrorMessage(error, "Could not add the lines. Try again.") };
    }
  }

  refresh();
  return {
    added: rows.length,
    skipped: preview.lines.filter((line) => line.state === "already").length,
    refused: preview.lines.filter((line) => line.state === "problem").length,
  };
}

// ---------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------

const TIME = /^\d{2}:\d{2}$/;

export async function saveAttendance(
  staffId: string,
  onDate: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const status = oneOf(ATTENDANCE_STATUSES, text(formData, "status"));
  if (!status) return { error: "Pick present, half day, leave or absent." };
  if (onDate > todayInIndia()) return { error: "That day hasn't come yet." };
  const worked = status === "present" || status === "half_day";
  const inAt = worked ? optionalText(formData, "in_at") : null;
  const outAt = worked ? optionalText(formData, "out_at") : null;
  if ((inAt && !TIME.test(inAt)) || (outAt && !TIME.test(outAt))) {
    return { error: "Type the times like 08:30." };
  }
  if (Boolean(inAt) !== Boolean(outAt)) return { error: "Give both the time in and the time out." };
  const breakMinutes = Number(text(formData, "break_minutes") || "0");
  if (!Number.isInteger(breakMinutes) || breakMinutes < 0 || breakMinutes > 720) {
    return { error: "The break is in minutes, like 30." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("birdwing_attendance").upsert(
    {
      staff_id: staffId,
      on_date: onDate,
      status,
      in_at: inAt,
      out_at: outAt,
      break_minutes: worked ? breakMinutes : 0,
      note: optionalText(formData, "note"),
      created_by: user.id,
      updated_by: user.id,
    },
    { onConflict: "staff_id,on_date" },
  );
  if (error) return fromDb(error, "Could not save the day. Try again.");
  refresh();
  return undefined;
}

export async function clearAttendance(staffId: string, onDate: string): Promise<ActionState> {
  await requireTool(GRANT);
  const supabase = await createClient();
  const { error } = await supabase
    .from("birdwing_attendance")
    .delete()
    .eq("staff_id", staffId)
    .eq("on_date", onDate);
  if (error) return fromDb(error, "Could not clear the day. Try again.");
  refresh();
  return undefined;
}

/** Everyone working, present today — the morning's one press; nobody's day is overwritten. */
export async function markAllPresent(onDate: string): Promise<ActionState> {
  const user = await requireTool(GRANT);
  if (onDate > todayInIndia()) return { error: "That day hasn't come yet." };
  const supabase = await createClient();
  const [{ data: staff, error: staffError }, { data: marked, error: markedError }] =
    await Promise.all([
      supabase.from("birdwing_staff").select("id").eq("is_active", true),
      supabase.from("birdwing_attendance").select("staff_id").eq("on_date", onDate),
    ]);
  if (staffError) return fromDb(staffError, "Could not read the staff. Try again.");
  if (markedError) return fromDb(markedError, "Could not read the day. Try again.");
  const done = new Set((marked ?? []).map((row) => row.staff_id));
  const rows = (staff ?? [])
    .filter((person) => !done.has(person.id))
    .map((person) => ({
      staff_id: person.id,
      on_date: onDate,
      status: "present",
      created_by: user.id,
      updated_by: user.id,
    }));
  if (rows.length === 0) return { error: "Everyone already has that day marked." };
  const { error } = await supabase.from("birdwing_attendance").insert(rows);
  if (error) return fromDb(error, "Could not mark the day. Try again.");
  refresh();
  return undefined;
}

// ---------------------------------------------------------------------
// Confirming a salary
// ---------------------------------------------------------------------

/**
 * The figures are worked out HERE, again, from attendance, the pay rule
 * and occupancy — the screen sends only who, which month, and the
 * reviewer's incentives, deductions and note. The database sums the
 * total and writes the run and its one expense line together; a second
 * press returns the first.
 */
export async function confirmSalary(
  staffId: string,
  month: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireTool(GRANT);
  if (!FIRST_OF_MONTH.test(month.slice(0, 7))) return { error: "Pick a month." };
  const first = `${month.slice(0, 7)}-01`;
  if (first > todayInIndia()) return { error: "A month is paid once it has begun." };

  const incentives = readAmount(text(formData, "incentives") || "0");
  const deductions = readAmount(text(formData, "deductions") || "0");
  if (incentives === null) return { error: "Incentives: type an amount, or leave it blank." };
  if (deductions === null) return { error: "Deductions: type an amount, or leave it blank." };
  const note = optionalText(formData, "note");
  if (deductions > 0 && !note) return { error: "Say what the deduction is for." };

  const found = await getSalaryPreview(staffId, first);
  if (!found)
    return { error: "This person has no pay rule for that month — an admin adds one in Settings." };
  const { preview } = found;

  const supabase = await createClient();
  const { error } = await supabase.rpc("birdwing_confirm_salary", {
    p_staff_id: staffId,
    p_month: first,
    p_base: preview.base,
    p_ot_hours: preview.otHours,
    p_ot_amount: preview.otAmount,
    p_room_days: preview.roomDays,
    p_room_amount: preview.roomAmount,
    p_guest_days: preview.guestDays,
    p_guest_amount: preview.guestAmount,
    p_incentives: incentives,
    p_deductions: deductions,
    p_note: note ?? undefined,
  });
  if (error) return fromDb(error, "Could not confirm the salary. Try again.");
  refresh();
  return undefined;
}
