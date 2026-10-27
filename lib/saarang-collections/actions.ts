"use server";

// Type-only import, never re-exported from a "use server" file (npm run check:actions).
import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { dbErrorMessage } from "@/lib/db-error";
import { checked, optionalText, parseNumber, text } from "@/lib/form-data";
import { todayInIndia } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { GRANT, isFigureCell, previousMonth, UNIT_PATTERN } from "./shared";

/** Saarang Collections' saves. Anyone holding the grant edits the whole report (0161); each write names its caller. */

const refresh = () => revalidatePath("/saarang-collections", "layout");
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function failed(error: { message: string; code?: string }, fallback: string): ActionState {
  if (error.code === "23505") return { error: "That is already on the list." };
  console.error(`saarang-collections: ${fallback}`, error);
  return { error: dbErrorMessage(error, fallback) };
}

/** One hand-typed cell, saved when the person leaves it. Blank clears it. */
export async function saveFigure(project: string, key: string, raw: string): Promise<ActionState> {
  const user = await requireTool(GRANT);
  if (!isFigureCell(project, key)) return { error: "That figure is worked out, not typed." };
  const value = parseNumber(raw);
  if (value !== null && !Number.isFinite(value)) return { error: "Type a number, like 1,25,000." };
  if (value !== null && Math.abs(value) >= 1e14) return { error: "That number is too large." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("saarang_collection_figures")
    .upsert({ project, key, value, updated_by: user.id }, { onConflict: "project,key" });
  if (error) return failed(error, "Could not save the figure. Try again.");
  refresh();
  return undefined;
}

async function saveSettings(
  userId: string,
  row: Record<string, string | number | boolean | null>,
  fallback: string,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("saarang_collection_settings")
    .update({ ...row, updated_by: userId })
    .eq("one_row", true)
    .select("id");
  if (error) return failed(error, fallback);
  if (!data?.length) return { error: fallback };
  refresh();
  return undefined;
}

export async function savePeriod(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const from = text(formData, "period_from");
  const to = text(formData, "period_to");
  if (!DATE.test(from) || !DATE.test(to)) return { error: "Pick both days of the period." };
  if (to < from) return { error: "The period ends before it starts." };
  return saveSettings(user.id, { period_from: from, period_to: to }, "Could not save the period.");
}

/** The calendar month before the report date (or before today, with no reports yet). */
export async function setPreviousMonth(reportDate: string | null): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const anchor = reportDate && DATE.test(reportDate) ? reportDate : todayInIndia();
  const { from, to } = previousMonth(anchor);
  return saveSettings(user.id, { period_from: from, period_to: to }, "Could not set the period.");
}

export async function saveRules(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const gstPlot = parseNumber(formData.get("gst_plot")) ?? 0;
  const gstVilla = parseNumber(formData.get("gst_villa")) ?? 0;
  for (const gst of [gstPlot, gstVilla]) {
    if (!Number.isFinite(gst) || gst < 0 || gst > 100) {
      return { error: "GST is a percentage between 0 and 100." };
    }
  }
  const soldPlot = text(formData, "sold_field_plot");
  const soldVilla = text(formData, "sold_field_villa");
  if (![soldPlot, soldVilla].every((field) => field === "price" || field === "incl")) {
    return { error: "Pick which sold value to use." };
  }
  const testSuffix = text(formData, "test_suffix");
  if (testSuffix.length > 20) return { error: "The test-unit ending is too long." };
  return saveSettings(
    user.id,
    {
      test_suffix: testSuffix,
      dedupe: checked(formData, "dedupe"),
      gst_plot: gstPlot,
      gst_villa: gstVilla,
      sold_field_plot: soldPlot,
      sold_field_villa: soldVilla,
    },
    "Could not save the rules.",
  );
}

export async function addExcludedReceipt(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const receiptNo = text(formData, "receipt_no").toUpperCase();
  if (!receiptNo) return { error: "Type the receipt number." };
  if (receiptNo.length > 60) return { error: "That receipt number is too long." };
  const supabase = await createClient();
  const { error } = await supabase.from("saarang_collection_excluded_receipts").insert({
    receipt_no: receiptNo,
    reason: optionalText(formData, "reason"),
    added_by: user.id,
  });
  if (error) return failed(error, "Could not leave the receipt out.");
  refresh();
  return undefined;
}

function unitOf(formData: FormData): string | { error: string } {
  const unit = text(formData, "unit").toUpperCase();
  if (!UNIT_PATTERN.test(unit))
    return { error: "Type the unit as Zoho has it, like SAARANG-PLOT-07." };
  return unit;
}

export async function addCorrection(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const unit = unitOf(formData);
  if (typeof unit !== "string") return unit;
  const delta = parseNumber(formData.get("delta"));
  if (delta === null || !Number.isFinite(delta) || delta === 0) {
    return { error: "Type the amount to add or take off, like -1,00,000." };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("saarang_collection_corrections").insert({
    unit,
    stage: optionalText(formData, "stage"),
    delta,
    note: optionalText(formData, "note"),
    added_by: user.id,
  });
  if (error) return failed(error, "Could not add the correction.");
  refresh();
  return undefined;
}

export async function addExtraUnit(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const unit = unitOf(formData);
  if (typeof unit !== "string") return unit;
  const soldValue = parseNumber(formData.get("sold_value"));
  const completed = parseNumber(formData.get("completed")) ?? 0;
  const pending = parseNumber(formData.get("pending")) ?? 0;
  if (soldValue === null || !Number.isFinite(soldValue) || soldValue < 0) {
    return { error: "Type the unit's sold value." };
  }
  if (![completed, pending].every((n) => Number.isFinite(n) && n >= 0)) {
    return { error: "Completed and pending milestones are amounts of zero or more." };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("saarang_collection_extra_units").insert({
    unit,
    applicant: optionalText(formData, "applicant"),
    sold_value: soldValue,
    completed,
    pending,
    note: optionalText(formData, "note"),
    added_by: user.id,
  });
  if (error) return failed(error, "Could not add the unit.");
  refresh();
  return undefined;
}

const RULE_TABLES = {
  excluded: "saarang_collection_excluded_receipts",
  correction: "saarang_collection_corrections",
  extra: "saarang_collection_extra_units",
} as const;

export async function removeRule(list: keyof typeof RULE_TABLES, id: string): Promise<ActionState> {
  await requireTool(GRANT);
  const table = RULE_TABLES[list];
  if (!table) return { error: "That list doesn't exist." };
  const supabase = await createClient();
  const { data, error } = await supabase.from(table).delete().eq("id", id).select("id");
  if (error) return failed(error, "Could not remove it.");
  if (!data?.length) return { error: "It was already removed." };
  refresh();
  return undefined;
}
