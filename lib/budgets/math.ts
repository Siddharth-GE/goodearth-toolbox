/**
 * Budget arithmetic: pure, no imports; nothing else in lib/budgets should compute money.
 * 1. NULL IS NOT ZERO: unpriced means no cost, not free; roll-ups count those lines separately. 2. ROUND ONLY WHEN DISPLAYING: sum full precision, round in formatMoney.
 */

export type PricedLine = {
  quantity: number;
  unit_cost: number | null;
  margin_pct: number | null;
};

/** Mirrors the `client_rate` generated column (migration 0011); the database is the truth, this is for the live screen. */
export function clientRate(unitCost: number | null, marginPct: number | null): number | null {
  if (unitCost === null || marginPct === null) return null;
  return unitCost * (1 + marginPct / 100);
}

export function lineCost(line: PricedLine): number | null {
  if (line.unit_cost === null) return null;
  return line.quantity * line.unit_cost;
}

/** Uses the BUDGET's quantity, never the designer's. */
export function lineAmount(line: PricedLine): number | null {
  const rate = clientRate(line.unit_cost, line.margin_pct);
  if (rate === null) return null;
  return line.quantity * rate;
}

export type Totals = {
  /** Full precision. Round at display, never here. */
  cost: number;
  client: number;
  margin: number;
  marginPct: number | null;
  lineCount: number;
  pricedCount: number;
  pendingCount: number;
};

/** Unpriced lines add no money and are counted in `pendingCount` instead. */
export function rollUp(lines: PricedLine[]): Totals {
  let cost = 0;
  let client = 0;
  let pricedCount = 0;

  for (const line of lines) {
    const lineTotal = lineCost(line);
    const amount = lineAmount(line);
    // A line counts only with BOTH cost and margin. A saved line always has both (0017; "no margin" is stored as 0), so this is a line still being typed: it stays pending.
    if (lineTotal === null || amount === null) continue;

    pricedCount++;
    cost += lineTotal;
    client += amount;
  }

  return {
    cost,
    client,
    margin: client - cost,
    marginPct: cost === 0 ? null : ((client - cost) / cost) * 100,
    lineCount: lines.length,
    pricedCount,
    pendingCount: lines.length - pricedCount,
  };
}

export function isFullyPriced(lines: PricedLine[]): boolean {
  return lines.length > 0 && lines.every((line) => line.unit_cost !== null);
}
