/** Dropped files to recognised reports, and the check shown before anything is saved. Pure: the upload actions call it. */
import { parseCsv } from "@/lib/csv";
import { formatDate } from "@/lib/format";
import { readWorkbookBytes } from "@/lib/xlsx";
import { oldExcelRefusal, parse, SLOT_LABEL, type ParsedReport, type Slot } from "./core";

export type DroppedFile = { name: string; bytes: Uint8Array };

/** What an upload says: what was saved, what was refused. ActionState's shape plus the saved line. */
export type UploadState = { error?: string; saved?: string } | undefined;

function firstSheet(file: DroppedFile) {
  if (/\.csv$/i.test(file.name)) return parseCsv(new TextDecoder().decode(file.bytes));
  return [...readWorkbookBytes(file.bytes, file.name).values()][0]?.map((row) => row.cells) ?? [];
}

/**
 * Each file recognised by its columns. Two files for one report in the same drop: the later one counts.
 * The report date moves forward to the newest as-of date, never back; outstanding exports date their period's end, so they never move it.
 */
export function readReports(
  files: DroppedFile[],
  reportDate: string | null,
): { reports: ParsedReport[]; errors: string[]; notices: string[]; reportDate: string | null } {
  const bySlot = new Map<Slot, ParsedReport>();
  const errors: string[] = [];
  const notices: string[] = [];
  for (const file of files) {
    const refusal = oldExcelRefusal(file.name, file.bytes);
    if (refusal) {
      errors.push(`${file.name}: ${refusal}`);
      continue;
    }
    let report;
    try {
      report = parse(firstSheet(file), file.name);
    } catch {
      errors.push(`${file.name}: couldn't be read. Export it from Zoho again as XLSX or CSV.`);
      continue;
    }
    if ("error" in report) {
      errors.push(`${file.name}: ${report.error}`);
      continue;
    }
    if (bySlot.has(report.slot)) {
      notices.push(
        `${bySlot.get(report.slot)!.meta.file}: replaced by ${file.name}, which is also the ${SLOT_LABEL[report.slot]} report.`,
      );
    }
    bySlot.set(report.slot, report);
  }
  let newest = reportDate;
  for (const report of bySlot.values()) {
    const asOf = report.meta.asOf;
    if (report.kind !== "outstanding" && asOf && (!newest || asOf > newest)) newest = asOf;
  }
  return { reports: [...bySlot.values()], errors, notices, reportDate: newest };
}

/** What is loaded now for a report: the latest upload's as-of date and row count. */
export type Loaded = Partial<Record<Slot, { asOf: string | null; rowCount: number }>>;

/** One dropped file, as the check step shows it before anything is saved. */
export type ReportCheck = {
  slot: Slot;
  label: string;
  file: string;
  asOf: string | null;
  rows: number;
  /** Rupees for receipts, invoices and milestones; units for a sold-units report. */
  total: { amount: number } | { units: number };
  now: { asOf: string | null; rowCount: number } | null;
  warnings: string[];
};

/** What the check step says: each file read, or why the drop was refused. */
export type CheckState = { checks?: ReportCheck[]; error?: string; notice?: string } | undefined;

const totalOf = (report: ParsedReport): ReportCheck["total"] => {
  switch (report.kind) {
    case "payments":
      return { amount: report.rows.reduce((sum, row) => sum + row[5], 0) };
    case "outstanding":
      return { amount: report.rows.reduce((sum, row) => sum + row[7], 0) };
    case "milestones":
      return { amount: report.rows.reduce((sum, row) => sum + row[4], 0) };
    case "sold":
      return { units: new Set(report.rows.map((row) => row[0])).size };
  }
};

/** Each recognised file beside what is loaded for its report, with what looks wrong said plainly. */
export function checkReports(reports: ParsedReport[], loaded: Loaded): ReportCheck[] {
  return reports.map((report) => {
    const now = loaded[report.slot] ?? null;
    const warnings: string[] = [];
    if (now?.asOf && report.meta.asOf && report.meta.asOf < now.asOf) {
      warnings.push(
        `Older than the one loaded: as of ${formatDate(report.meta.asOf)}, against ${formatDate(now.asOf)}.`,
      );
    }
    if (now && report.rows.length < now.rowCount) {
      warnings.push(
        `Fewer rows than the one loaded: ${report.rows.length} against ${now.rowCount}. Was a filter left on in Zoho?`,
      );
    }
    return {
      slot: report.slot,
      label: SLOT_LABEL[report.slot],
      file: report.meta.file,
      asOf: report.meta.asOf,
      rows: report.rows.length,
      total: totalOf(report),
      now,
      warnings,
    };
  });
}
