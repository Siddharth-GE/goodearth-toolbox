"use server";

// Type-only import, never re-exported from a "use server" file — the
// 2026-08-03 outage rule, enforced by npm run check:actions.
import type { ActionState } from "@/lib/action-state";
import { requireAdmin } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/dal";
import { dbErrorMessage } from "@/lib/db-error";
import { optionalText, text } from "@/lib/form-data";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { readAmount } from "./upload";

/**
 * Birdwing Books → Settings: the people, their pay rules and the expense
 * heads. ADMIN ONLY — 0116 says is_admin() on every write here, and each
 * action checks first. A pay rule is effective-dated: a raise is a new
 * rule from its first day, so last year's salaries keep last year's rule.
 */

const refresh = () => revalidatePath("/birdwing-books", "layout");

async function admin() {
  const user = await requireUser();
  await requireAdmin(user);
  return user;
}

function failed(error: { message: string; code?: string }, fallback: string): ActionState {
  if (error.code === "23505") return { error: "That is already in use." };
  console.error(`birdwing-books settings: ${fallback}`, error);
  return { error: dbErrorMessage(error, fallback) };
}

const TIME = /^\d{2}:\d{2}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function saveStaff(
  staffId: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await admin();
  const name = text(formData, "name");
  if (!name) return { error: "Give the person's name." };
  const joinedOn = optionalText(formData, "joined_on");
  if (joinedOn && !DATE.test(joinedOn)) return { error: "Pick the day they joined." };
  const row = {
    name,
    role: optionalText(formData, "role"),
    joined_on: joinedOn,
    profile_id: optionalText(formData, "profile_id"),
    sort_order: Number(text(formData, "sort_order") || "100") || 100,
    is_active: formData.get("is_active") === "on",
    updated_by: user.id,
  };
  const supabase = await createClient();
  const { error } = staffId
    ? await supabase.from("birdwing_staff").update(row).eq("id", staffId)
    : await supabase.from("birdwing_staff").insert({ ...row, created_by: user.id });
  if (error) return failed(error, "Could not save the person. Try again.");
  refresh();
  return undefined;
}

export async function savePayRule(
  ruleId: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await admin();
  const staffId = text(formData, "staff_id");
  if (!staffId) return { error: "Pick the person." };
  const from = text(formData, "effective_from");
  if (!DATE.test(from)) return { error: "Pick the day the rule starts." };
  const base = readAmount(text(formData, "base_salary"));
  if (base === null) return { error: "Type the monthly base salary." };
  const money = (field: string, label: string) => {
    const raw = text(formData, field);
    if (!raw) return 0;
    const value = readAmount(raw);
    return value === null ? label : value;
  };
  const ot = money("ot_rate_per_hr", "Overtime rate");
  const room = money("room_day_rate", "Room-day rate");
  const guest = money("guest_day_rate", "Guest-day rate");
  for (const value of [ot, room, guest]) {
    if (typeof value === "string") return { error: `${value}: type an amount, or leave it blank.` };
  }
  const shiftStart = optionalText(formData, "shift_start");
  const shiftEnd = optionalText(formData, "shift_end");
  if (Boolean(shiftStart) !== Boolean(shiftEnd)) {
    return { error: "Give both ends of the shift, or neither for a fixed salary." };
  }
  if ((shiftStart && !TIME.test(shiftStart)) || (shiftEnd && !TIME.test(shiftEnd))) {
    return { error: "Type the shift like 08:30." };
  }

  const row = {
    staff_id: staffId,
    effective_from: from,
    base_salary: base,
    shift_start: shiftStart,
    shift_end: shiftEnd,
    ot_rate_per_hr: ot as number,
    room_day_rate: room as number,
    guest_day_rate: guest as number,
    notes: optionalText(formData, "notes"),
    updated_by: user.id,
  };
  const supabase = await createClient();
  const { error } = ruleId
    ? await supabase.from("birdwing_pay_rules").update(row).eq("id", ruleId)
    : await supabase.from("birdwing_pay_rules").insert({ ...row, created_by: user.id });
  if (error) {
    if (error.code === "23505") return { error: "This person already has a rule from that day." };
    return failed(error, "Could not save the rule. Try again.");
  }
  refresh();
  return undefined;
}

export async function saveHead(
  headId: string | null,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await admin();
  const name = text(formData, "name");
  if (!name) return { error: "Name the head, e.g. Laundry." };
  const row = {
    name,
    sort_order: Number(text(formData, "sort_order") || "100") || 100,
    is_active: formData.get("is_active") === "on",
    updated_by: user.id,
  };
  const supabase = await createClient();
  const { error } = headId
    ? await supabase.from("birdwing_expense_heads").update(row).eq("id", headId)
    : await supabase.from("birdwing_expense_heads").insert({ ...row, created_by: user.id });
  if (error) return failed(error, "Could not save the head. Try again.");
  refresh();
  return undefined;
}
