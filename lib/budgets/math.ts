/**
 * Budget arithmetic — pure functions, no database, no imports.
 *
 * Deliberately free of I/O so it can be tested directly (see
 * lib/budgets/math.test.ts, the first tests in this repo). CLAUDE.md flags
 * Budgets as the point where real calculation logic arrives and unit tests
 * start earning their keep; this module is that logic, and nothing else in
 * lib/budgets/ should compute money.
 *
 * Two rules run through everything here:
 *
 * 1. NULL IS NOT ZERO. An unpriced line has no cost — it is not free. Every
 *    function returns null rather than 0 when an input is missing, and the
 *    roll-ups count those lines separately instead of adding nothing.
 *
 * 2. ROUND ONLY WHEN DISPLAYING. Totals sum full-precision values; the
 *    rounding happens in formatMoney at the very end. Rounding each line
 *    first is how a 200-line quote ends up disagreeing with its own total.
 */

export type PricedLine = {
  quantity: number;
  unit_cost: number | null;
  margin_pct: number | null;
};

/**
 * What the client pays per unit: cost plus margin.
 *
 * Mirrors the `client_rate` generated column in migration 0011. The
 * database is the source of truth — this exists so a screen can show the
 * figure live as someone types, before anything is saved.
 */
export function clientRate(unitCost: number | null, marginPct: number | null): number | null {
  if (unitCost === null || marginPct === null) return null;
  return unitCost * (1 + marginPct / 100);
}

/** Cost to us for the whole line. */
export function lineCost(line: PricedLine): number | null {
  if (line.unit_cost === null) return null;
  return line.quantity * line.unit_cost;
}

/**
 * What the client pays for the whole line.
 *
 * Uses the BUDGET's quantity, never the designer's — the budget team's
 * measured figure is the one being charged for.
 */
export function lineAmount(line: PricedLine): number | null {
  const rate = clientRate(line.unit_cost, line.margin_pct);
  if (rate === null) return null;
  return line.quantity * rate;
}

export type Totals = {
  /** Full precision. Round at display, never here. */
  cost: number;
  client: number;
  /** client − cost, in rupees. */
  margin: number;
  /** Blended margin across everything priced, or null when nothing is. */
  marginPct: number | null;
  lineCount: number;
  pricedCount: number;
  pendingCount: number;
};

/**
 * Rolls a set of lines into one set of figures.
 *
 * Unpriced lines contribute nothing to the money and are counted in
 * `pendingCount` instead. That distinction is the whole point: a total of
 * ₹10,00,000 over 40 lines means something quite different when 12 of them
 * haven't been priced yet, and the screen has to be able to say so.
 */
export function rollUp(lines: PricedLine[]): Totals {
  let cost = 0;
  let client = 0;
  let pricedCount = 0;

  for (const line of lines) {
    const lineTotal = lineCost(line);
    if (lineTotal === null) continue;

    pricedCount++;
    cost += lineTotal;
    // A priced line with no margin still costs us money, so it belongs in
    // the cost total either way; it only reaches the client total once
    // there is a rate to charge.
    client += lineAmount(line) ?? lineTotal;
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

/** True when every line has a cost — the condition for approving a budget. */
export function isFullyPriced(lines: PricedLine[]): boolean {
  return lines.length > 0 && lines.every((line) => line.unit_cost !== null);
}

// Formatting lives in lib/format.ts, not here. This module is arithmetic;
// how a figure is written is a question for screens, documents and
// exports alike, and they must all answer it the same way.
