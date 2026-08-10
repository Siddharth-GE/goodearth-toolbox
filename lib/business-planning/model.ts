/**
 * The engine. Takes a plan's inputs, returns every number the screens
 * show, for all three scenarios.
 *
 * Pure: no imports, no I/O, no clock. It runs unchanged in the browser
 * (recalculating as the founder types, before anything is saved) and on
 * the server (the list page's figures) — which is the only arrangement
 * where the two can never disagree.
 *
 * THE FOUR RULES
 *
 * 1. MONTHLY, ALWAYS. Everything is a series of `horizonMonths` numbers,
 *    index 0 = month 1. Totals are sums of those series, never a
 *    shortcut — so a cost that falls outside the horizon is genuinely
 *    absent from the total rather than quietly included. The founder's
 *    workbook does the same and it is why its Base construction figure
 *    is ₹39.43 Cr and not ₹42.34 Cr: the last row houses sell too late
 *    for their build to finish inside six years.
 *
 * 2. ROUND ONLY WHEN DISPLAYING. Full precision throughout; formatting
 *    happens in lib/format.ts at the very end.
 *
 * 3. NULL IS NOT ZERO. A margin with no revenue behind it is `null`, not
 *    0%. An IRR that cannot be computed is `null`, not a made-up number.
 *    The screens render a dash.
 *
 * 4. ONE ROOT, THREE SCENARIOS. Base, Moderate and High differ in
 *    exactly one input — sale velocity per line — so the whole model
 *    runs three times over the same document rather than branching.
 *
 * WHERE THIS DELIBERATELY IMPROVES ON THE WORKBOOK
 *
 *   * Interest. In Excel, interest on a revolver depends on the balance,
 *     which depends on the interest — a circular reference the sheet has
 *     to work around, and its ex-SL block simply does not charge any. A
 *     sequential monthly loop just does it correctly.
 *   * Collections. The sheet convolves against a fixed 31-month window,
 *     so a product with a build cycle over ~30 months silently loses the
 *     instalments that fall past it. Here the convolution runs to the
 *     horizon.
 *   * Peak funding. The sheet reports `-MIN(closing cash)`, which for
 *     Vihara is a NEGATIVE number — the cash never actually goes below
 *     zero. That is the trough of a positive balance, not money anyone
 *     has to raise. Both figures are returned here, named for what they
 *     are: `cashTrough` and `peakFunding`.
 */

import {
  MAX_HORIZON_MONTHS,
  SCENARIOS,
  type PlanInputs,
  type SaleLine,
  type ScenarioIndex,
} from "./inputs";

// ---------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------

/** One row of the cashflow table, as parallel series. Index 0 = month 1. */
export type MonthlySeries = {
  unitsSold: number[];
  bookings: number[];
  collections: number[];
  land: number[];
  development: number[];
  construction: number[];
  overheads: number[];
  commonInfra: number[];
  outflow: number[];
  /** collections − outflow. Excludes interest and the equity injection. */
  net: number[];
  interest: number[];
  /** Balance at the end of the month, after interest. */
  closing: number[];
  /** What is drawn on the revolver at the end of the month. */
  revolver: number[];
};

export type LineResult = {
  id: string;
  name: string;
  kind: "sale";
  unitsSold: number;
  unitsUnsold: number;
  /** Booking value. Recognised when a unit sells, not when it is paid for. */
  revenue: number;
  landCost: number;
  developmentCost: number;
  constructionCost: number;
  /** Land + development + construction. This line's own costs only. */
  directCost: number;
  /** Revenue − direct cost. Before plan-level overheads and interest. */
  grossProfit: number;
  /**
   * Interest this line would carry ON ITS OWN, starting from no equity.
   * It will not add up to the plan's consolidated interest, and should
   * not: pooled, a line in surplus funds a line in deficit.
   */
  interest: number;
  profit: number;
  marginPct: number | null;
  cashTrough: number;
  peakFunding: number;
  monthly: MonthlySeries;
};

export type ScenarioResult = {
  index: ScenarioIndex;
  name: string;
  lines: LineResult[];

  revenue: number;
  landCost: number;
  developmentCost: number;
  constructionCost: number;
  overheadsFixed: number;
  overheadsVariable: number;
  overheadsOneTime: number;
  commonInfraCapex: number;
  commonInfraOpex: number;
  /** Overheads and common infrastructure: everything no single line owns. */
  planCost: number;
  /** Every cost except interest. */
  totalCost: number;
  /** On the pooled cash position — see LineResult.interest. */
  interest: number;
  /** Sum of each line's standalone interest, for the gap the summary names. */
  standaloneInterest: number;

  pbt: number;
  marginPct: number | null;
  /** The lowest the pooled balance gets. Positive means it never ran out. */
  cashTrough: number;
  /** The most ever borrowed. Zero when equity covered the trough. */
  peakFunding: number;
  /** Positive monthly net ÷ negative monthly net. null when nothing went out. */
  moneyMultiple: number | null;
  /** Annualised, as a percent. null when the flow has no meaningful IRR. */
  irrAnnualPct: number | null;

  monthly: MonthlySeries;
};

export type PlanResult = {
  scenarios: [ScenarioResult, ScenarioResult, ScenarioResult];
  active: ScenarioResult;
};

// ---------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------

function zeros(n: number): number[] {
  return new Array<number>(n).fill(0);
}

function sum(values: number[]): number {
  let total = 0;
  for (const value of values) total += value;
  return total;
}

function emptySeries(months: number): MonthlySeries {
  return {
    unitsSold: zeros(months),
    bookings: zeros(months),
    collections: zeros(months),
    land: zeros(months),
    development: zeros(months),
    construction: zeros(months),
    overheads: zeros(months),
    commonInfra: zeros(months),
    outflow: zeros(months),
    net: zeros(months),
    interest: zeros(months),
    closing: zeros(months),
    revolver: zeros(months),
  };
}

/**
 * The share of a unit's price collected `offset` months after it sells.
 *
 * Booking percent lands at offset 0; the balance arrives in equal
 * instalments spaced `round(buildMonths / instalments)` months apart.
 * The schedule always sums to 1 — every rupee of a sale is collected
 * eventually, and `collectionScheduleSum` is asserted in the tests
 * because a schedule that quietly sums to 0.98 is a 2% error nobody
 * would ever spot on screen.
 */
export function collectionSchedule(
  bookingPct: number,
  instalments: number,
  buildMonths: number,
): number[] {
  const booking = bookingPct / 100;
  const count = Math.max(1, Math.round(instalments));
  const step = Math.max(1, Math.round(buildMonths / count));
  const schedule = zeros(count * step + 1);
  schedule[0] = booking;
  const each = (1 - booking) / count;
  for (let i = 1; i <= count; i += 1) schedule[i * step] += each;
  return schedule;
}

/** Construction spend spreads evenly across the build cycle from month of sale. */
export function constructionSchedule(buildMonths: number): number[] {
  const months = Math.max(1, Math.round(buildMonths));
  return new Array<number>(months).fill(1 / months);
}

/**
 * Convolution: each month's `source` value spread forward by `schedule`.
 *
 * `out[m] = Σ source[m - k] × schedule[k]`. Anything landing past the
 * horizon is lost, deliberately — that money does arrive, but not inside
 * the period being modelled, and pretending otherwise is how a plan
 * shows profit it will not see.
 */
function spreadForward(source: number[], schedule: number[], months: number): number[] {
  const out = zeros(months);
  for (let m = 0; m < months; m += 1) {
    const value = source[m];
    if (value === 0) continue;
    for (let k = 0; k < schedule.length; k += 1) {
      const target = m + k;
      if (target >= months) break;
      out[target] += value * schedule[k];
    }
  }
  return out;
}

// ---------------------------------------------------------------------
// IRR
// ---------------------------------------------------------------------

function npv(rate: number, cashflows: number[]): number {
  let total = 0;
  for (let i = 0; i < cashflows.length; i += 1) total += cashflows[i] / (1 + rate) ** i;
  return total;
}

/**
 * The periodic rate at which these cashflows break even, or null.
 *
 * Bisection, not Newton: Newton diverges on the long, lumpy flows a
 * property plan produces, and reports whatever it landed on.
 *
 * Two guards, both of which return null rather than a number:
 *
 *   * The flow must start with money going OUT. A flow that opens
 *     positive has no rate of return to speak of, and asking anyway is
 *     how the founder's workbook came to report a Venture IRR of 1150%
 *     for Moderate and −52% for High off the same model.
 *   * The root must be bracketed. If NPV has the same sign at both ends
 *     of the search range there is nothing to find.
 */
export function irr(cashflows: number[]): number | null {
  const firstNonZero = cashflows.find((value) => value !== 0);
  if (firstNonZero === undefined || firstNonZero > 0) return null;
  if (!cashflows.some((value) => value > 0)) return null;

  let lo = -0.9999;
  let hi = 10;
  let npvLo = npv(lo, cashflows);
  let npvHi = npv(hi, cashflows);
  if (npvLo === 0) return lo;
  if (npvHi === 0) return hi;
  if (npvLo > 0 === npvHi > 0) return null;

  for (let i = 0; i < 200; i += 1) {
    const mid = (lo + hi) / 2;
    const npvMid = npv(mid, cashflows);
    if (npvMid === 0) return mid;
    if (npvMid > 0 === npvLo > 0) {
      lo = mid;
      npvLo = npvMid;
    } else {
      hi = mid;
      npvHi = npvMid;
    }
  }
  return (lo + hi) / 2;
}

/** A monthly rate as an annual percentage. */
function annualisePct(monthlyRate: number | null): number | null {
  if (monthlyRate === null) return null;
  const annual = (1 + monthlyRate) ** 12 - 1;
  return Number.isFinite(annual) ? annual * 100 : null;
}

// ---------------------------------------------------------------------
// Cash
// ---------------------------------------------------------------------

/**
 * Walk a monthly net cashflow into a balance, charging interest on any
 * month the balance ends below zero.
 *
 * The interest compounds into the balance, which is what a revolver
 * does: you borrow to cover the shortfall, and next month you owe the
 * shortfall plus the interest. Straightforward here; a circular
 * reference in a spreadsheet.
 */
function runCash(net: number[], monthlyRate: number, openingEquity: number) {
  const months = net.length;
  const interest = zeros(months);
  const closing = zeros(months);
  const revolver = zeros(months);

  let balance = 0;
  for (let m = 0; m < months; m += 1) {
    if (m === 0) balance += openingEquity;
    const before = balance + net[m];
    const charge = before < 0 ? -before * monthlyRate : 0;
    interest[m] = charge;
    balance = before - charge;
    closing[m] = balance;
    revolver[m] = Math.max(0, -balance);
  }

  const cashTrough = months === 0 ? openingEquity : Math.min(...closing);
  return {
    interest,
    closing,
    revolver,
    cashTrough,
    peakFunding: Math.max(0, -cashTrough),
    totalInterest: sum(interest),
  };
}

// ---------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------

function isSaleLine(line: { kind: string }): line is SaleLine {
  return line.kind === "sale";
}

/**
 * Month-by-month unit sales for every line at once, because a launch
 * trigger makes them interdependent.
 *
 * A triggered line stays at zero until the given share of every OTHER
 * line's units has sold. Lines are evaluated in list order within each
 * month, so a trigger sees the current month's sales from lines above it
 * and not from lines below — the same order a spreadsheet column
 * evaluates in, and the reason Vihara's row houses release the month
 * plotted crosses 70% rather than the month after.
 */
function unitsSoldByMonth(lines: SaleLine[], scenario: ScenarioIndex, months: number): number[][] {
  const sold = lines.map(() => zeros(months));
  const remaining = lines.map((line) => line.units);
  const cumulative = lines.map(() => 0);
  const totalUnits = lines.map((line) => line.units);

  for (let m = 0; m < months; m += 1) {
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (m + 1 < line.salesStartMonth) continue;
      if (remaining[i] <= 0) continue;

      if (line.launchTriggerPct !== null) {
        let othersUnits = 0;
        let othersCumulative = 0;
        for (let j = 0; j < lines.length; j += 1) {
          if (j === i) continue;
          othersUnits += totalUnits[j];
          othersCumulative += cumulative[j];
        }
        // A single-line plan with a trigger set has nothing to wait for,
        // so it launches rather than never selling anything.
        if (othersUnits > 0 && othersCumulative < (line.launchTriggerPct / 100) * othersUnits) {
          continue;
        }
      }

      const units = Math.min(line.velocity[scenario], remaining[i]);
      sold[i][m] = units;
      remaining[i] -= units;
      cumulative[i] += units;
    }
  }

  return sold;
}

function runSaleLine(
  line: SaleLine,
  plan: PlanInputs,
  unitsSold: number[],
  months: number,
  monthlyRate: number,
): LineResult {
  const revenuePerUnit =
    line.plotSqftPerUnit * line.landPricePsf + line.buaSqftPerUnit * line.housePricePsf;
  const constructionPerUnit = line.buaSqftPerUnit * line.constructionPsf;

  const bookings = unitsSold.map((units) => units * revenuePerUnit);

  const collections = spreadForward(
    bookings,
    collectionSchedule(
      line.bookingPct ?? plan.bookingPct,
      line.instalments ?? plan.instalments,
      line.buildMonths,
    ),
    months,
  );

  const construction = spreadForward(
    unitsSold.map((units) => units * constructionPerUnit),
    constructionSchedule(line.buildMonths),
    months,
  ).map((value) => value);

  // Land: one deal for the whole plan, so the terms come from the plan
  // and only the area and rate are the line's. Cash pays at month 1;
  // a JV defers to the settlement month and pays the premium for it.
  const land = zeros(months);
  const landBase = line.landAreaSqft * line.landCostPsf;
  if (landBase > 0) {
    const isJv = plan.landTerms === "jv";
    const payable = isJv ? landBase * (1 + plan.landPremiumPct / 100) : landBase;
    const payMonth = isJv ? plan.landSettlementMonth : 1;
    if (payMonth >= 1 && payMonth <= months) land[payMonth - 1] += payable;
  }

  // Development and infrastructure: this line's parcel, spread evenly
  // over the plan's development period from month 1.
  const development = zeros(months);
  const developmentTotal = line.landAreaSqft * line.devCostPsf;
  if (developmentTotal > 0) {
    const spreadMonths = Math.max(1, plan.devMonths);
    for (let m = 0; m < Math.min(spreadMonths, months); m += 1) {
      development[m] += developmentTotal / spreadMonths;
    }
  }

  const outflow = zeros(months);
  const net = zeros(months);
  for (let m = 0; m < months; m += 1) {
    outflow[m] = land[m] + development[m] + construction[m];
    net[m] = collections[m] - outflow[m];
  }

  // Standalone: no equity. This answers "what does this line do on its
  // own", and handing every line the plan's whole equity cushion would
  // count the same rupees once per line.
  const cash = runCash(net, monthlyRate, 0);

  const monthly: MonthlySeries = {
    unitsSold,
    bookings,
    collections,
    land,
    development,
    construction,
    overheads: zeros(months),
    commonInfra: zeros(months),
    outflow,
    net,
    interest: cash.interest,
    closing: cash.closing,
    revolver: cash.revolver,
  };

  const totalUnitsSold = sum(unitsSold);
  const revenue = sum(bookings);
  const landCost = sum(land);
  const developmentCost = sum(development);
  const constructionCost = sum(construction);
  const directCost = landCost + developmentCost + constructionCost;
  const grossProfit = revenue - directCost;

  return {
    id: line.id,
    name: line.name,
    kind: "sale",
    unitsSold: totalUnitsSold,
    unitsUnsold: Math.max(0, line.units - totalUnitsSold),
    revenue,
    landCost,
    developmentCost,
    constructionCost,
    directCost,
    grossProfit,
    interest: cash.totalInterest,
    profit: grossProfit - cash.totalInterest,
    marginPct: revenue > 0 ? ((grossProfit - cash.totalInterest) / revenue) * 100 : null,
    cashTrough: cash.cashTrough,
    peakFunding: cash.peakFunding,
    monthly,
  };
}

/** Overheads, selling cost, one-timers and common infrastructure, by month. */
function runPlanCosts(plan: PlanInputs, bookings: number[], months: number) {
  const fixed = zeros(months);
  const variable = zeros(months);
  const oneTime = zeros(months);
  const infraCapex = zeros(months);
  const infraOpex = zeros(months);

  for (const item of plan.overheads) {
    for (let m = 0; m < months; m += 1) {
      const monthNumber = m + 1;
      if (monthNumber >= item.startMonth && monthNumber <= item.endMonth) fixed[m] += item.monthly;
    }
  }

  const variableRate = sum(plan.variableCosts.map((item) => item.pct)) / 100;
  for (let m = 0; m < months; m += 1) variable[m] = bookings[m] * variableRate;

  for (const item of plan.oneTimeCosts) {
    if (item.month >= 1 && item.month <= months) oneTime[item.month - 1] += item.amount;
  }

  for (const item of plan.commonInfra) {
    if (item.capex > 0) {
      const spreadMonths = Math.max(1, item.capexMonths);
      for (let i = 0; i < spreadMonths; i += 1) {
        const m = item.capexStartMonth - 1 + i;
        if (m >= 0 && m < months) infraCapex[m] += item.capex / spreadMonths;
      }
    }
    if (item.annualOpex > 0) {
      const from = Math.max(1, item.opexStartMonth);
      const to = Math.min(months, item.opexEndMonth ?? months);
      for (let monthNumber = from; monthNumber <= to; monthNumber += 1) {
        infraOpex[monthNumber - 1] += item.annualOpex / 12;
      }
    }
  }

  const overheads = zeros(months);
  const commonInfra = zeros(months);
  for (let m = 0; m < months; m += 1) {
    overheads[m] = fixed[m] + variable[m] + oneTime[m];
    commonInfra[m] = infraCapex[m] + infraOpex[m];
  }

  return {
    overheads,
    commonInfra,
    fixedTotal: sum(fixed),
    variableTotal: sum(variable),
    oneTimeTotal: sum(oneTime),
    infraCapexTotal: sum(infraCapex),
    infraOpexTotal: sum(infraOpex),
  };
}

export function runScenario(plan: PlanInputs, scenario: ScenarioIndex): ScenarioResult {
  const months = Math.min(Math.max(1, Math.round(plan.horizonMonths)), MAX_HORIZON_MONTHS);
  const monthlyRate = plan.financingRatePct / 100 / 12;

  const saleLines = plan.lines.filter(isSaleLine);
  const sold = unitsSoldByMonth(saleLines, scenario, months);
  const lines = saleLines.map((line, index) =>
    runSaleLine(line, plan, sold[index], months, monthlyRate),
  );

  // Consolidate the lines, then add what no line owns.
  const monthly = emptySeries(months);
  for (const line of lines) {
    for (let m = 0; m < months; m += 1) {
      monthly.unitsSold[m] += line.monthly.unitsSold[m];
      monthly.bookings[m] += line.monthly.bookings[m];
      monthly.collections[m] += line.monthly.collections[m];
      monthly.land[m] += line.monthly.land[m];
      monthly.development[m] += line.monthly.development[m];
      monthly.construction[m] += line.monthly.construction[m];
    }
  }

  const planCosts = runPlanCosts(plan, monthly.bookings, months);
  for (let m = 0; m < months; m += 1) {
    monthly.overheads[m] = planCosts.overheads[m];
    monthly.commonInfra[m] = planCosts.commonInfra[m];
    monthly.outflow[m] =
      monthly.land[m] +
      monthly.development[m] +
      monthly.construction[m] +
      monthly.overheads[m] +
      monthly.commonInfra[m];
    monthly.net[m] = monthly.collections[m] - monthly.outflow[m];
  }

  const cash = runCash(monthly.net, monthlyRate, plan.openingEquity);
  for (let m = 0; m < months; m += 1) {
    monthly.interest[m] = cash.interest[m];
    monthly.closing[m] = cash.closing[m];
    monthly.revolver[m] = cash.revolver[m];
  }

  const revenue = sum(monthly.bookings);
  const landCost = sum(monthly.land);
  const developmentCost = sum(monthly.development);
  const constructionCost = sum(monthly.construction);
  const planCost =
    planCosts.fixedTotal +
    planCosts.variableTotal +
    planCosts.oneTimeTotal +
    planCosts.infraCapexTotal +
    planCosts.infraOpexTotal;
  const totalCost = landCost + developmentCost + constructionCost + planCost;
  const pbt = revenue - totalCost - cash.totalInterest;

  // The workbook's "money multiple": every rupee that came in over every
  // rupee that went out, on the operating flow, ignoring when.
  let inflowTotal = 0;
  let outflowTotal = 0;
  for (const value of monthly.net) {
    if (value > 0) inflowTotal += value;
    else outflowTotal -= value;
  }

  return {
    index: scenario,
    name: SCENARIOS[scenario],
    lines,
    revenue,
    landCost,
    developmentCost,
    constructionCost,
    overheadsFixed: planCosts.fixedTotal,
    overheadsVariable: planCosts.variableTotal,
    overheadsOneTime: planCosts.oneTimeTotal,
    commonInfraCapex: planCosts.infraCapexTotal,
    commonInfraOpex: planCosts.infraOpexTotal,
    planCost,
    totalCost,
    interest: cash.totalInterest,
    standaloneInterest: sum(lines.map((line) => line.interest)),
    pbt,
    marginPct: revenue > 0 ? (pbt / revenue) * 100 : null,
    cashTrough: cash.cashTrough,
    peakFunding: cash.peakFunding,
    moneyMultiple: outflowTotal > 0 ? inflowTotal / outflowTotal : null,
    irrAnnualPct: annualisePct(irr(monthly.net)),
    monthly,
  };
}

/** Every scenario, plus whichever one the plan currently reads as ACTIVE. */
export function runPlan(plan: PlanInputs): PlanResult {
  const scenarios: [ScenarioResult, ScenarioResult, ScenarioResult] = [
    runScenario(plan, 0),
    runScenario(plan, 1),
    runScenario(plan, 2),
  ];
  return { scenarios, active: scenarios[plan.activeScenario] };
}
