/** The meeting's columns and rows, shared by the Summary screen and the Excel download. Pure. */
import { shiftMonth, monthLabel } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import type { WorkbookSheet } from "@/lib/xlsx";
import {
  PROJECTS,
  SLOT_LABEL,
  type Kind,
  type Project,
  type ProjectResult,
  type ValueKey,
} from "./core";
import { PROJECT_NAMES, type FigureProject } from "./shared";

export type Column = {
  k: string;
  label: string;
  /** Typed by hand rather than worked out. */
  typed?: boolean;
  /** A count of units or invoices, not rupees. */
  count?: boolean;
  /** The report a worked-out figure comes from. */
  need?: Kind;
};

export const COLUMNS: readonly Column[] = [
  { k: "C", label: "Total project value (E)", typed: true },
  { k: "D", label: "Total expense value (E)", typed: true },
  { k: "E", label: "Total sold value", need: "sold" },
  { k: "F", label: "Total collection", need: "payments" },
  { k: "G", label: "Total expense", typed: true },
  { k: "H", label: "Last month collection", need: "payments" },
  { k: "MTD", label: "Collection MTD", need: "payments" },
  { k: "I", label: "Last month expense", typed: true },
  { k: "J", label: "Next month collection (E)", typed: true },
  { k: "K", label: "Next month expense (E)", typed: true },
  { k: "L", label: "Collected but unused", need: "payments" },
  { k: "M", label: "Collection receivables (outstanding)", need: "outstanding" },
  { k: "N", label: "Total units", typed: true, count: true },
  { k: "O", label: "Total sold", count: true, need: "sold" },
  { k: "P", label: "Invoice value", need: "milestones" },
  { k: "Q", label: "Invoices to be raised", typed: true, count: true },
  { k: "R", label: "Invoice value to be raised", typed: true },
  { k: "S", label: "OL-Collection", need: "milestones" },
];

export const LABEL: Record<string, string> = Object.fromEntries(COLUMNS.map((c) => [c.k, c.label]));

export type View = {
  figures: Record<FigureProject, Record<string, number | null>>;
  result: Record<Project, ProjectResult>;
};

/** One project's figure for a column: typed, or worked out; null when it cannot be known. */
export function figureOf(view: View, project: Project, k: string): number | null {
  const column = COLUMNS.find((c) => c.k === k);
  if (column?.typed || k === "T") return view.figures[project][k] ?? null;
  return view.result[project].values[k as ValueKey] ?? null;
}

/** The sum of the projects that have a figure; null only when none does. */
export function totalOf(view: View, k: string, projects: readonly Project[] = PROJECTS) {
  let any = false;
  let sum = 0;
  for (const p of projects) {
    const v = figureOf(view, p, k);
    if (v !== null) {
      any = true;
      sum += v;
    }
  }
  return any ? sum : null;
}

const monthName = (iso: string) => monthLabel(iso, "long").split(" ")[0];

/** The meeting view's columns, named for the collection period and the report month. */
export function meetingColumns(
  periodFrom: string | null,
  reportDate: string | null,
): { k: string; label: string; count?: boolean }[] {
  return [
    { k: "C", label: "Total project value (E)" },
    { k: "E", label: "Total sold value" },
    { k: "N", label: "Total units", count: true },
    { k: "O", label: "Total sold", count: true },
    { k: "P", label: "Invoice value" },
    { k: "F", label: "Total collection" },
    { k: "M", label: "Collection receivables (outstanding)" },
    { k: "H", label: periodFrom ? `${monthName(periodFrom)} collection` : "Period collection" },
    { k: "MTD", label: mtdLabel(reportDate) },
    {
      k: "T",
      label: periodFrom
        ? `${monthName(shiftMonth(periodFrom.slice(0, 7), 1))} collection (target)`
        : "Next month target",
    },
  ];
}

export function mtdLabel(reportDate: string | null): string {
  return reportDate ? `${monthName(reportDate)} collection (MTD)` : "Collection MTD";
}

/** "1 Oct 2026 – 21 Oct 2026" for the month to date, or "". */
export function mtdRange(reportDate: string | null): string {
  return reportDate
    ? `${formatDate(`${reportDate.slice(0, 8)}01`)} – ${formatDate(reportDate)}`
    : "";
}

export function periodRange(from: string | null, to: string | null): string {
  return from || to ? `${formatDate(from)} – ${formatDate(to)}` : "";
}

const SUPPORT_SHEETS = [
  ["F", "Received"],
  ["H", "LMC"],
  ["MTD", "MTD"],
  ["M", "Outstanding"],
  ["E", "Sold Units"],
  ["S", "OL Collection"],
] as const;

const whole = (v: number | null) => (v === null ? "" : Math.round(v));

/** The meeting workbook: the Summary Sheet in the meeting's layout, then the rows behind the main figures. */
export function meetingSheets(
  view: View,
  settings: { periodFrom: string | null; periodTo: string | null; reportDate: string | null },
): WorkbookSheet[] {
  const { periodFrom, periodTo, reportDate } = settings;
  const rows: (string | number | null)[][] = [
    [],
    [
      "",
      "Saarang Collection and Expense",
      "",
      "",
      "",
      "Last updated:",
      reportDate ? formatDate(reportDate) : "",
    ],
    [],
    ["", "Project Name", ...COLUMNS.map((c) => c.label)],
  ];
  for (const p of PROJECTS) {
    rows.push(["", PROJECT_NAMES[p], ...COLUMNS.map((c) => whole(figureOf(view, p, c.k)))]);
  }
  rows.push(["", "Total", ...COLUMNS.map((c) => whole(totalOf(view, c.k)))]);
  rows.push([], ["", "Collection period", periodRange(periodFrom, periodTo)], []);

  const meeting = meetingColumns(periodFrom, reportDate);
  rows.push(["", "Project Name", ...meeting.map((c) => c.label)]);
  for (const p of PROJECTS) {
    rows.push(["", PROJECT_NAMES[p], ...meeting.map((c) => whole(figureOf(view, p, c.k)))]);
  }
  rows.push([
    "",
    "Phase 3",
    ...meeting.map((c) => {
      const v = view.figures.phase3[c.k];
      return v === null || v === undefined ? "-" : v;
    }),
  ]);

  const sheets: WorkbookSheet[] = [
    { name: "Summary Sheet", rows, columnWidths: [2, 16, ...COLUMNS.map(() => 16)] },
  ];
  for (const p of PROJECTS) {
    for (const [key, name] of SUPPORT_SHEETS) {
      const d = view.result[p].detail[key];
      if (!d) continue;
      const n = d.cols.length;
      sheets.push({
        name: `Saarang ${p === "plot" ? "Plot" : "Villa"} ${name}`,
        rows: [
          [...d.cols, "Note"],
          ...d.rows.map((x) => [...x.slice(0, n), x[n] ?? ""]),
          ...d.left.map((l) => [...l.cells.slice(0, n), `Left out: ${l.why}`]),
        ],
        columnWidths: [...d.cols.map(() => 18), 34],
      });
    }
  }
  return sheets;
}

/** Which report a figure waits on, in the words of the Reports tab. */
export function reportNeeded(p: Project, kind: Kind): string {
  return SLOT_LABEL[`${p}_${kind}`];
}
