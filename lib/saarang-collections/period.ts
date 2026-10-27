/**
 * The Summary for one period: the whole-project result kept to the rows Zoho dates inside it.
 * Pure, and built on compute()'s own rows, so a period never counts by other rules than the whole.
 */
import type { Detail, DetailCell, DetailRow, Project, ProjectResult } from "./core";

export type Window = { from: string; to: string };

/** The figures a period can show, each with the date that places a row in it. */
export const PERIOD_FIGURES = [
  { k: "F", label: "Collected in the period", hint: "receipts dated in it" },
  { k: "L", label: "Unused, from those receipts", hint: "receipts dated in it, not yet applied" },
  { k: "P", label: "Invoiced in the period", hint: "completed milestones due in it" },
  { k: "S", label: "Scheduled in the period", hint: "every milestone due in it" },
  { k: "M", label: "Unpaid on invoices due in the period", hint: "balance on invoices due in it" },
] as const;
export type PeriodKey = (typeof PERIOD_FIGURES)[number]["k"];

export type PeriodResult = {
  values: Record<PeriodKey, number | null>;
  /** Units with a balance on invoices due in the period. */
  unitsOwing: number | null;
  detail: Partial<Record<PeriodKey, Detail>>;
};

// Where each figure's rows hold their date and their amount (core.ts's detail columns).
const AT: Record<PeriodKey, { date: number; amount: number }> = {
  F: { date: 1, amount: 4 },
  L: { date: 1, amount: 5 },
  P: { date: 3, amount: 5 },
  S: { date: 3, amount: 5 },
  M: { date: 3, amount: 5 },
};

const NO_DATE: Record<PeriodKey, string> = {
  F: "No date in Zoho",
  L: "No date in Zoho",
  P: "No due date in Zoho",
  S: "No due date in Zoho",
  M: "No due date in Zoho",
};

function keep(detail: Detail, k: PeriodKey, window: Window): Detail {
  const { date } = AT[k];
  const inside = (cells: DetailCell[]) => {
    const day = String(cells[date] ?? "");
    return day !== "" && day >= window.from && day <= window.to;
  };
  const undated = (cells: DetailCell[]) => String(cells[date] ?? "") === "";
  return {
    cols: detail.cols,
    rows: detail.rows.filter(inside),
    left: [
      ...detail.left.filter((row) => inside(row.cells)),
      ...detail.rows.filter(undated).map((cells): DetailRow => ({ cells, why: NO_DATE[k] })),
      ...detail.left
        .filter((row) => undated(row.cells))
        .map((row): DetailRow => ({ cells: row.cells, why: `${row.why}; ${NO_DATE[k]}` })),
    ],
  };
}

/** One project's figures for the period; null where its report is not uploaded. */
export function periodOf(result: ProjectResult, window: Window): PeriodResult {
  const values = { F: null, L: null, P: null, S: null, M: null } as PeriodResult["values"];
  const detail: PeriodResult["detail"] = {};
  for (const { k } of PERIOD_FIGURES) {
    const whole = result.detail[k];
    if (!whole) continue;
    const kept = keep(whole, k, window);
    detail[k] = kept;
    values[k] = kept.rows.reduce((sum, cells) => sum + (Number(cells[AT[k].amount]) || 0), 0);
  }
  const owing = detail.M
    ? new Set(detail.M.rows.filter((cells) => Number(cells[5])).map((cells) => cells[0])).size
    : null;
  return { values, unitsOwing: owing, detail };
}

export function periodsOf(
  result: Record<Project, ProjectResult>,
  window: Window,
): Record<Project, PeriodResult> {
  return { plot: periodOf(result.plot, window), villa: periodOf(result.villa, window) };
}
