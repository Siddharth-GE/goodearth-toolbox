"use server";

// Type-only import, never re-exported from a "use server" file (npm run check:actions).
import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { dbErrorMessage } from "@/lib/db-error";
import { checked, optionalText, parseNumber, text } from "@/lib/form-data";
import { formatDate, todayInIndia } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { PROJECTS, SLOT_LABEL } from "./core";
import { getCollections } from "./queries";
import { GRANT, isFigureCell, previousMonth, SUMMARY_KEYS, UNIT_PATTERN } from "./shared";
import { LABEL } from "./summary";
import {
  checkReports,
  readReports,
  type CheckState,
  type Loaded,
  type UploadState,
} from "./upload";

/** Saarang Collections' saves. Anyone holding the grant edits the whole report (0161); each write names its caller. */

const refresh = () => revalidatePath("/saarang-collections", "layout");

/**
 * After a save: the figures the Summary now shows, kept for Turing to read (0162), then the screens.
 * Keeping them never fails the save; the screen works them out live either way.
 */
async function settled(userId: string) {
  try {
    const { result } = await getCollections();
    const at = new Date().toISOString();
    const rows = PROJECTS.flatMap((project) =>
      SUMMARY_KEYS.map((key) => {
        const value = result[project].values[key];
        return {
          project,
          key,
          label: key === "Munits" ? "Units with a balance" : LABEL[key],
          value: value === null ? null : Math.round(value * 100) / 100,
          computed_by: userId,
          computed_at: at,
        };
      }),
    );
    const supabase = await createClient();
    const { error } = await supabase
      .from("saarang_collection_summary")
      .upsert(rows, { onConflict: "project,key" });
    if (error) console.error("saarang-collections: the kept figures were not refreshed", error);
  } catch (thrown) {
    console.error("saarang-collections: the kept figures were not refreshed", thrown);
  }
  refresh();
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function failed(error: { message: string; code?: string }, fallback: string): ActionState {
  if (error.code === "23505") return { error: "That is already on the list." };
  console.error(`saarang-collections: ${fallback}`, error);
  return { error: dbErrorMessage(error, fallback) };
}

/** Each field's length as 0161 allows it, said in words before the database says it in its own. */
function longest(formData: FormData, limits: Record<string, number>): ActionState {
  for (const [field, max] of Object.entries(limits)) {
    if (text(formData, field).length > max) {
      return { error: `Keep the ${field} under ${max} letters.` };
    }
  }
  return undefined;
}

/** Rupees as 0161's numeric(14, 2) holds them: below a lakh crore. */
const tooLarge = (n: number) => Math.abs(n) >= 1e12;

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
  // A typed figure is not part of what core.ts works out, so the kept figures stay as they are.
  refresh();
  return undefined;
}

/** `settle: false` for a caller that settles once itself at its end (the upload). */
async function saveSettings(
  userId: string,
  row: Record<string, string | number | boolean | null>,
  fallback: string,
  settle = true,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("saarang_collection_settings")
    .update({ ...row, updated_by: userId })
    .eq("one_row", true)
    .select("id");
  if (error) return failed(error, fallback);
  if (!data?.length) return { error: fallback };
  if (settle) await settled(userId);
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
export async function setPreviousMonth(): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const supabase = await createClient();
  const settings = await supabase
    .from("saarang_collection_settings")
    .select("report_date")
    .single();
  if (settings.error) return failed(settings.error, "Could not read the report date. Try again.");
  const { from, to } = previousMonth(settings.data.report_date ?? todayInIndia());
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
  const tooLong = longest(formData, { reason: 500 });
  if (tooLong) return tooLong;
  const supabase = await createClient();
  const { error } = await supabase.from("saarang_collection_excluded_receipts").insert({
    receipt_no: receiptNo,
    reason: optionalText(formData, "reason"),
    added_by: user.id,
  });
  if (error) return failed(error, "Could not leave the receipt out.");
  await settled(user.id);
  return undefined;
}

const UNIT_HELP = "Type the unit as Zoho has it, like SAARANG-PLOT-07.";

export async function addCorrection(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const unit = text(formData, "unit").toUpperCase();
  if (!UNIT_PATTERN.test(unit)) return { error: UNIT_HELP };
  const delta = parseNumber(formData.get("delta"));
  if (delta === null || !Number.isFinite(delta) || delta === 0) {
    return { error: "Type the amount to add or take off, like -1,00,000." };
  }
  if (tooLarge(delta)) return { error: "That amount is too large." };
  const tooLong = longest(formData, { stage: 200, note: 500 });
  if (tooLong) return tooLong;
  const supabase = await createClient();
  const { error } = await supabase.from("saarang_collection_corrections").insert({
    unit,
    stage: optionalText(formData, "stage"),
    delta,
    note: optionalText(formData, "note"),
    added_by: user.id,
  });
  if (error) return failed(error, "Could not add the correction.");
  await settled(user.id);
  return undefined;
}

export async function addExtraUnit(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const unit = text(formData, "unit").toUpperCase();
  if (!UNIT_PATTERN.test(unit)) return { error: UNIT_HELP };
  const soldValue = parseNumber(formData.get("sold_value"));
  const completed = parseNumber(formData.get("completed")) ?? 0;
  const pending = parseNumber(formData.get("pending")) ?? 0;
  if (soldValue === null || !Number.isFinite(soldValue) || soldValue < 0) {
    return { error: "Type the unit's sold value." };
  }
  if (![completed, pending].every((n) => Number.isFinite(n) && n >= 0)) {
    return { error: "Completed and pending milestones are amounts of zero or more." };
  }
  if ([soldValue, completed, pending].some(tooLarge)) return { error: "That amount is too large." };
  const tooLong = longest(formData, { applicant: 200, note: 500 });
  if (tooLong) return tooLong;
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
  await settled(user.id);
  return undefined;
}

const RULE_TABLES = {
  excluded: "saarang_collection_excluded_receipts",
  correction: "saarang_collection_corrections",
  extra: "saarang_collection_extra_units",
} as const;

export async function removeRule(list: keyof typeof RULE_TABLES, id: string): Promise<ActionState> {
  const user = await requireTool(GRANT);
  // Both arrive from the browser as plain strings, whatever the type says.
  if (!Object.hasOwn(RULE_TABLES, list)) return { error: "That list doesn't exist." };
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { error: "That rule doesn't exist." };
  const table = RULE_TABLES[list];
  const supabase = await createClient();
  const { data, error } = await supabase.from(table).delete().eq("id", id).select("id");
  if (error) return failed(error, "Could not remove it.");
  if (!data?.length) return { error: "It was already removed." };
  await settled(user.id);
  return undefined;
}

// Under the 4 MB a server action takes, so the person gets this sentence rather than a failed request.
const MAX_UPLOAD_BYTES = 3.5 * 1024 * 1024;

/** The dropped files' bytes, or why there are none to read. */
async function droppedFiles(
  formData: FormData,
): Promise<{ name: string; bytes: Uint8Array }[] | { error: string }> {
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { error: "Choose the Zoho exports to upload." };
  if (files.reduce((n, f) => n + f.size, 0) > MAX_UPLOAD_BYTES) {
    return { error: "Those files are over 3.5 MB together. Upload them a few at a time." };
  }
  return Promise.all(
    files.map(async (file) => ({
      name: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
    })),
  );
}

/** The check step: each dropped file read and set beside what is loaded now. Nothing is saved. */
export async function checkUploads(_prev: CheckState, formData: FormData): Promise<CheckState> {
  await requireTool(GRANT);
  const dropped = await droppedFiles(formData);
  if ("error" in dropped) return dropped;
  const { reports, errors, notices } = readReports(dropped, null);
  if (reports.length === 0) return { error: errors.join("\n") || undefined };

  // The latest upload of each dropped report, one exact read each, as getCollections orders them.
  const supabase = await createClient();
  const latest = await Promise.all(
    reports.map((report) =>
      supabase
        .from("saarang_collection_uploads")
        .select("slot, as_of, row_count")
        .eq("slot", report.slot)
        .order("uploaded_at", { ascending: false })
        .order("id")
        .limit(1)
        .maybeSingle(),
    ),
  );
  const loaded: Loaded = {};
  for (const { data, error } of latest) {
    if (error) return failed(error, "Could not read the reports loaded now. Try again.");
    if (data) loaded[data.slot as keyof Loaded] = { asOf: data.as_of, rowCount: data.row_count };
  }

  return {
    checks: checkReports(reports, loaded),
    error: errors.join("\n") || undefined,
    notice: notices.join("\n") || undefined,
  };
}

/**
 * The checked Zoho exports, read again here. Every file is kept as its own upload; the Summary uses the latest per report.
 * A newer as-of date moves the report date forward and resets the period to the month before, as the page did.
 * What saved and what was refused are said apart: one refused file does not hide seven saved ones.
 */
export async function uploadReports(_prev: UploadState, formData: FormData): Promise<UploadState> {
  const user = await requireTool(GRANT);
  const dropped = await droppedFiles(formData);
  if ("error" in dropped) return dropped;

  const supabase = await createClient();
  const settings = await supabase
    .from("saarang_collection_settings")
    .select("report_date")
    .single();
  if (settings.error) return failed(settings.error, "Could not read the report date. Try again.");

  const { reports, errors, notices, reportDate } = readReports(dropped, settings.data.report_date);
  const said: string[] = [];

  if (reports.length > 0) {
    const { error } = await supabase.from("saarang_collection_uploads").insert(
      reports.map((report) => ({
        slot: report.slot,
        file_name: report.meta.file.slice(0, 255),
        as_of: report.meta.asOf,
        period_from: report.meta.periodFrom,
        period_to: report.meta.periodTo,
        row_count: report.rows.length,
        rows: report.rows,
        uploaded_by: user.id,
      })),
    );
    if (error) return failed(error, "Could not save the reports. Try again.");
    const names = reports.map((report) => SLOT_LABEL[report.slot]).join(", ");
    said.push(
      `Saved ${reports.length === 1 ? "1 report" : `${reports.length} reports`}: ${names}.`,
    );

    if (reportDate && reportDate !== settings.data.report_date) {
      const period = previousMonth(reportDate);
      const moved = await saveSettings(
        user.id,
        { report_date: reportDate, period_from: period.from, period_to: period.to },
        "The reports were saved, but the report date could not be moved. Set the period on Summary.",
        false,
      );
      if (moved?.error) errors.push(moved.error);
      else
        said.push(
          `Collection period set to ${formatDate(period.from)} – ${formatDate(period.to)}.`,
        );
    }
    await settled(user.id);
  }
  return {
    saved: [...said, ...notices].join("\n") || undefined,
    error: errors.join("\n") || undefined,
  };
}
