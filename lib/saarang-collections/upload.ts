/** Dropped files to recognised reports, before anything is saved. Pure: the upload action calls it. */
import { parseCsv } from "@/lib/csv";
import { readWorkbookBytes } from "@/lib/xlsx";
import { oldExcelRefusal, parse, SLOT_LABEL, type ParsedReport, type Slot } from "./core";

export type DroppedFile = { name: string; bytes: Uint8Array };

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
): { reports: ParsedReport[]; errors: string[]; reportDate: string | null } {
  const bySlot = new Map<Slot, ParsedReport>();
  const errors: string[] = [];
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
      errors.push(
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
  return { reports: [...bySlot.values()], errors, reportDate: newest };
}
