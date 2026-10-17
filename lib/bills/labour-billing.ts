// Pure rules; send_labour_logs_to_bill() holds the same ones and makes the bill.
// One kind, contractor and project per bill. Daily wages: heads × day rate per trade. Piece-work: quantity (lump sum: 1) × rate, from the approved work order first, then the rate book. GST on each, to the paisa.

import type { DayRates } from "./lines";

export type LabourEntry = {
  id: string;
  kind: "nmr" | "pw_qty" | "pw_lump";
  contractorId: string;
  projectId: string;
  workItemId: string;
  masons: number;
  helpers: number;
  others: number;
  quantity: number | null;
};

const paisa = (value: number) => Math.round(value * 100) / 100;

export function entriesProblem(entries: LabourEntry[]): string | undefined {
  if (entries.length === 0) return "Tick the labour entries to bill.";
  const daily = entries.some((entry) => entry.kind === "nmr");
  const piece = entries.some((entry) => entry.kind !== "nmr");
  if (daily && piece) return "Daily wages and piece-work go on separate bills — tick one kind.";
  if (new Set(entries.map((entry) => entry.contractorId)).size > 1) {
    return "A bill is for one contractor — tick entries of one contractor.";
  }
  if (new Set(entries.map((entry) => entry.projectId)).size > 1) {
    return "A bill is for one project — tick entries of one project.";
  }
  return undefined;
}

export type Heads = { masons: number; helpers: number; others: number };

export function headsOf(entries: LabourEntry[]): Heads {
  return entries.reduce(
    (sum, entry) => ({
      masons: sum.masons + entry.masons,
      helpers: sum.helpers + entry.helpers,
      others: sum.others + entry.others,
    }),
    { masons: 0, helpers: 0, others: 0 },
  );
}

export function dayRatesProblem(heads: Heads, rates: DayRates): string | undefined {
  if (
    (heads.masons > 0 && rates.mason === null) ||
    (heads.helpers > 0 && rates.helper === null) ||
    (heads.others > 0 && rates.other === null)
  ) {
    return "Give a day rate for every trade on these entries.";
  }
  return undefined;
}

export function dailyWagesTotal(heads: Heads, rates: DayRates, gstPct: number): number {
  return paisa(
    (heads.masons * (rates.mason ?? 0) +
      heads.helpers * (rates.helper ?? 0) +
      heads.others * (rates.other ?? 0)) *
      (1 + gstPct / 100),
  );
}

export function pieceWorkTotal(
  entries: LabourEntry[],
  rates: Record<string, number | null>,
  gstPct: number,
): number {
  return paisa(
    entries.reduce(
      (sum, entry) =>
        sum + paisa((entry.quantity ?? 1) * (rates[entry.id] ?? 0) * (1 + gstPct / 100)),
      0,
    ),
  );
}

export type WorkOrderRate = { work_item_id: string | null; is_lump_sum: boolean; rate: number };

/** The work order's rate when it measures that work, else the rate book's; a lump sum is typed. */
export function suggestedPieceRate(
  entry: LabourEntry,
  workOrderLines: WorkOrderRate[],
  rateBook: Map<string, number>,
): number | null {
  if (entry.kind === "pw_lump") return null;
  const onOrder = workOrderLines.find(
    (line) => !line.is_lump_sum && line.work_item_id === entry.workItemId,
  );
  return onOrder?.rate ?? rateBook.get(entry.workItemId) ?? null;
}

export function pieceRatesPayload(
  rates: Record<string, number | null>,
  gstPct: number,
): Record<string, { rate: number | null; gst_pct: number }> {
  return Object.fromEntries(
    Object.entries(rates).map(([id, rate]) => [id, { rate, gst_pct: gstPct }]),
  );
}

/** Restated here, not imported from Supervisors: one tool never imports another's code. */
export function describeEntry(entry: {
  kind: LabourEntry["kind"];
  masons: number;
  helpers: number;
  others: number;
  quantity: number | null;
  uom: string | null;
  description: string | null;
}): string {
  if (entry.kind === "pw_qty") {
    return `${Number((entry.quantity ?? 0).toFixed(3))} ${entry.uom ?? ""}`.trim();
  }
  if (entry.kind === "pw_lump") return `Lump sum: ${entry.description ?? "—"}`;
  const parts: string[] = [];
  if (entry.masons) parts.push(`${entry.masons} mason${entry.masons === 1 ? "" : "s"}`);
  if (entry.helpers) parts.push(`${entry.helpers} helper${entry.helpers === 1 ? "" : "s"}`);
  if (entry.others) parts.push(`${entry.others} other${entry.others === 1 ? "" : "s"}`);
  return parts.join(", ");
}
