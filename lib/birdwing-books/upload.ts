/**
 * Reads the expenses sheet (the combined workbook's ten columns, pasted or CSV) into lines Books
 * can record, each with what is wrong with it in plain words. Pure (lib/csv.ts reads the text).
 * Columns: Month · Category · Description / Staff · Date · Amount (INR) · Remarks · Invoice
 * Link · Source Sheet · Source Cell · Review Note.
 * The repeat-upload key is `Source Sheet!Source Cell`, else the line's own content, so a second
 * upload adds nothing and a line already in is reported, never overwritten.
 */
import { parseCsv } from "@/lib/csv";

export const UPLOAD_COLUMNS = [
  "Month",
  "Category",
  "Description / Staff",
  "Date",
  "Amount (INR)",
  "Remarks",
  "Invoice Link",
  "Source Sheet",
  "Source Cell",
  "Review Note",
] as const;

export type UploadLine = {
  /** The row in the sheet, counting the header as 1 — what a person looks for. */
  row: number;
  sourceKey: string;
  month: string | null;
  head: string;
  description: string;
  spentOn: string | null;
  amount: number | null;
  remarks: string | null;
  reviewNote: string | null;
  problems: string[];
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** A month as the sheet wrote it — 2025-10-01T00:00:00, 2025-10, Oct 2025, October '25 — to its first day. */
export function readMonth(raw: string): string | null {
  const text = raw.trim();
  const iso = /^(\d{4})-(\d{2})/.exec(text);
  if (iso && Number(iso[2]) >= 1 && Number(iso[2]) <= 12) return `${iso[1]}-${iso[2]}-01`;
  const named = /^([A-Za-z]{3})[a-z]*\.?\s*'?(\d{2}|\d{4})$/.exec(text);
  if (named) {
    const index = MONTHS.indexOf(named[1].toLowerCase());
    if (index < 0) return null;
    const year = named[2].length === 2 ? `20${named[2]}` : named[2];
    return `${year}-${String(index + 1).padStart(2, "0")}-01`;
  }
  return null;
}

/** A day as the sheet wrote it — 2025-10-02T00:00:00, 2025-10-02, 02/10/2025 (day first). */
export function readDay(raw: string): string | null {
  const text = raw.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  const indian = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
  const value = iso
    ? `${iso[1]}-${iso[2]}-${iso[3]}`
    : indian
      ? `${indian[3]}-${indian[2].padStart(2, "0")}-${indian[1].padStart(2, "0")}`
      : null;
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
    ? value
    : null;
}

export function readAmount(raw: string): number | null {
  const cleaned = raw.replace(/[,\s₹]/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100) / 100;
}

export function readExpenseUpload(
  text: string,
  knownHeads: string[],
): { lines: UploadLine[]; error?: string } {
  const rows = parseCsv(text);
  if (rows.length === 0) return { lines: [], error: "There is nothing in it." };

  const header = rows[0].map((cell) => cell.trim().toLowerCase());
  const at = (name: (typeof UPLOAD_COLUMNS)[number]) => header.indexOf(name.toLowerCase());
  const missing = UPLOAD_COLUMNS.slice(0, 5).filter((name) => at(name) < 0);
  if (missing.length > 0) {
    return {
      lines: [],
      error: `The first row must name the columns. Missing: ${missing.join(", ")}.`,
    };
  }
  const heads = new Map(knownHeads.map((head) => [head.trim().toLowerCase(), head]));
  const cell = (row: string[], name: (typeof UPLOAD_COLUMNS)[number]) =>
    at(name) >= 0 ? (row[at(name)] ?? "").trim() : "";

  const lines = rows.slice(1).map((row, index): UploadLine => {
    const problems: string[] = [];
    const month = readMonth(cell(row, "Month"));
    if (!month) problems.push("no month");
    const category = cell(row, "Category");
    const head = heads.get(category.toLowerCase());
    if (!head) problems.push(category ? `no expense head called "${category}"` : "no category");
    const description = cell(row, "Description / Staff") || category;
    const rawDate = cell(row, "Date");
    const spentOn = rawDate ? readDay(rawDate) : null;
    if (rawDate && !spentOn) problems.push(`date "${rawDate}" not understood`);
    const amount = readAmount(cell(row, "Amount (INR)"));
    if (amount === null || amount <= 0) problems.push("no amount");

    const sheet = cell(row, "Source Sheet");
    const sourceCell = cell(row, "Source Cell");
    const sourceKey =
      sheet && sourceCell
        ? `${sheet}!${sourceCell}`
        : `line:${month ?? "?"}|${category}|${description}|${spentOn ?? ""}|${amount ?? ""}`;

    const notes = [cell(row, "Review Note")];
    if (month && spentOn && spentOn.slice(0, 7) !== month.slice(0, 7)) {
      notes.push("paid outside its accounting month");
    }
    const reviewNote = notes.filter(Boolean).join(" · ") || null;

    return {
      row: index + 2,
      sourceKey,
      month,
      head: head ?? category,
      description,
      spentOn,
      amount,
      remarks: cell(row, "Remarks") || null,
      reviewNote,
      problems,
    };
  });
  return { lines };
}
