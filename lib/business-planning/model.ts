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
  type HoldLine,
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
  /** Running an asset you kept: staff, food, utilities, maintenance. */
  operating: number[];
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

/** What every line reports, whichever kind it is. */
type LineResultBase = {
  id: string;
  name: string;
  /** Money earned inside the horizon. */
  revenue: number;
  /** Acquiring the parcel. Follows the plan's land terms. */
  landCost: number;
  /** Everything this line spends. Excludes plan-level overheads. */
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

export type SaleLineResult = LineResultBase & {
  kind: "sale";
  unitsSold: number;
  unitsUnsold: number;
  developmentCost: number;
  constructionCost: number;
};

export type HoldLineResult = LineResultBase & {
  kind: "hold";

  /** The three areas, because they do three different jobs. */
  carpetTotal: number;
  /** Built-up. What construction is costed on. */
  buaTotal: number;
  /** Super built-up. What it would sell for, if sold. */
  sbaTotal: number;

  /** Land development, hard cost, MEP, fees and contingency. */
  capex: number;
  capexPerUnit: number | null;
  capexPerBuaSqft: number | null;

  /** Inside the plan's horizon. */
  entryFees: number;
  recurringCharges: number;
  operatingOpex: number;

  /** At steady state, whatever the horizon. */
  stabilisedNoi: number;
  yieldOnCostPct: number | null;
  /** Stabilised NOI ÷ exit cap rate. What the asset is worth, held. */
  terminalValue: number;

  /** The own-versus-sell question, over the full hold period. */
  holdValue: number;
  sellValue: number;
  verdict: "hold" | "sell";
  holdIrrPct: number | null;
  equityMultiple: number | null;
};

export type LineResult = SaleLineResult | HoldLineResult;

export type ScenarioResult = {
  index: ScenarioIndex;
  name: string;
  lines: LineResult[];

  revenue: number;
  landCost: number;
  developmentCost: number;
  /** SALE construction plus HOLD capex — everything built. */
  constructionCost: number;
  /** Running the held assets, inside the horizon. */
  operatingCost: number;
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
  /**
   * What the held assets are worth at the end, on top of PBT.
   *
   * Kept OUT of pbt on purpose. PBT is money that has actually moved;
   * this is an asset you still own, and adding the two without saying so
   * is how a plan reports a profit that nobody can spend. Shown beside
   * PBT as `pbtWithHeldValue`, which is the workbook's Block 3 row 41.
   */
  terminalValue: number;
  pbtWithHeldValue: number;
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
    operating: zeros(months),
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
 * Land, by the plan's terms.
 *
 * The deal is one deal — cash at month 1, or deferred to a settlement
 * month at a premium — so the terms come from the plan and only the area
 * and rate come from the line. Both kinds of line pay for land the same
 * way, which is why this is shared.
 */
function landSpend(areaSqft: number, costPsf: number, plan: PlanInputs, months: number): number[] {
  const spend = zeros(months);
  const base = areaSqft * costPsf;
  if (base <= 0) return spend;

  const isJv = plan.landTerms === "jv";
  const payable = isJv ? base * (1 + plan.landPremiumPct / 100) : base;
  const payMonth = isJv ? plan.landSettlementMonth : 1;
  // A settlement month past the horizon means this land is genuinely
  // never paid for inside the plan. The Setup tab says so on the field.
  if (payMonth >= 1 && payMonth <= months) spend[payMonth - 1] += payable;
  return spend;
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
): SaleLineResult {
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

  const land = landSpend(line.landAreaSqft, line.landCostPsf, plan, months);

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
    operating: zeros(months),
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

// ---------------------------------------------------------------------
// HOLD lines
// ---------------------------------------------------------------------

/**
 * Carpet → built-up → super built-up, and what building it costs.
 *
 * The order is the whole point. Construction is costed on BUILT-UP area
 * (carpet ÷ efficiency), which is always the largest of the three;
 * costing it on carpet is how a build gets understated by a third.
 * Super built-up (carpet × (1 + loading)) is only used if the thing is
 * SOLD rather than kept.
 */
export function holdAreasAndCapex(line: HoldLine) {
  const carpetTotal = line.units * line.carpetSqftPerUnit;
  const buaTotal = carpetTotal / (line.efficiencyPct / 100);
  const sbaTotal = carpetTotal * (1 + line.loadingPct / 100);

  const landDevelopment = line.landAreaSqft * line.devCostPsf;
  const buaCost = buaTotal * line.buaCostPsf;
  const basementCost = line.basementSqft * line.basementCostPsf;
  const hard = buaCost + basementCost + line.amenitiesLumpsum;
  const mep = hard * (line.mepPct / 100);
  const professional = (hard + mep) * (line.professionalPct / 100);
  const contingency = (hard + mep) * (line.contingencyPct / 100);
  const capex = landDevelopment + hard + mep + professional + contingency;

  return {
    carpetTotal,
    buaTotal,
    sbaTotal,
    landDevelopment,
    buaCost,
    basementCost,
    hard,
    mep,
    professional,
    contingency,
    capex,
  };
}

/**
 * The long-horizon question: is this worth more held or sold?
 *
 * Annual, in years from completion, and independent of the plan's
 * monthly horizon — a 20-year hold is a different question from a 6-year
 * development, and squeezing it into the same grid would answer neither.
 *
 * Occupancy ramps at the fill rate to a stabilised level. Charges, opex
 * and entry fees each escalate at their own rate. Turnover matters
 * because a resident leaving and being replaced earns another entry fee.
 * Exit is the following year's NOI capitalised at the exit cap rate, in
 * the final year only.
 */
export function holdEconomics(line: HoldLine, capex: number, sbaTotal: number) {
  const years = Math.max(1, Math.round(line.holdYears));
  const stabilisedUnits = line.units * (line.occupancyPct / 100);
  const chargeEsc = 1 + line.chargeEscalationPct / 100;
  const opexEsc = 1 + line.opexEscalationPct / 100;
  const entryEsc = 1 + line.entryEscalationPct / 100;
  const discount = 1 + line.discountRatePct / 100;

  // Index 0 is completion: nothing occupied, nothing earned.
  const occupied = [0];
  const netCash = [0];
  const noi = [0];
  for (let y = 1; y <= years; y += 1) {
    const filled = Math.min(stabilisedUnits, line.fillRatePerMonth * 12 * y);
    const average = (occupied[y - 1] + filled) / 2;
    const moveIns = Math.max(0, filled - occupied[y - 1]) + (line.turnoverPct / 100) * average;

    const revenue = average * line.chargePerUnitMonth * 12 * chargeEsc ** (y - 1);
    const entry = moveIns * line.entryFeePerUnit * entryEsc ** (y - 1);
    const opex =
      (line.fixedOpexMonth * 12 + average * line.varOpexPerUnitMonth * 12) * opexEsc ** (y - 1);

    occupied.push(filled);
    noi.push(revenue - opex);
    netCash.push(revenue - opex + entry);
  }

  const exitValue = (noi[years] * chargeEsc) / (line.exitCapRatePct / 100);

  let holdValue = 0;
  const irrFlow = [-capex];
  for (let y = 1; y <= years; y += 1) {
    const cash = netCash[y] + (y === years ? exitValue : 0);
    holdValue += cash / discount ** y;
    irrFlow.push(cash);
  }

  const sellValue = sbaTotal * line.sellPricePsf * (1 - line.sellingCostPct / 100);
  const totalCash = netCash.reduce((a, b) => a + b, 0) + exitValue;

  return {
    holdValue,
    sellValue,
    // A tie goes to selling: holding costs attention, and a model that
    // says "hold" on an identical number is telling you nothing.
    verdict: (holdValue > sellValue ? "hold" : "sell") as "hold" | "sell",
    holdIrrPct: capex > 0 ? (irr(irrFlow) ?? Number.NaN) * 100 || null : null,
    equityMultiple: capex > 0 ? totalCash / capex : null,
    exitValue,
  };
}

function runHoldLine(
  line: HoldLine,
  plan: PlanInputs,
  months: number,
  monthlyRate: number,
): HoldLineResult {
  const areas = holdAreasAndCapex(line);

  // Capex spreads evenly across the build, from the month it starts.
  const construction = zeros(months);
  const buildMonths = Math.max(1, Math.round(line.buildMonths));
  for (let i = 0; i < buildMonths; i += 1) {
    const m = line.buildStartMonth - 1 + i;
    if (m >= 0 && m < months) construction[m] += areas.capex / buildMonths;
  }

  const land = landSpend(line.landAreaSqft, line.landCostPsf, plan, months);

  // Ready the month after the last month of building.
  const readyMonth = line.buildStartMonth + buildMonths;
  const stabilisedUnits = line.units * (line.occupancyPct / 100);

  const entry = zeros(months);
  const recurring = zeros(months);
  const operating = zeros(months);
  let previousOccupied = 0;
  for (let m = 0; m < months; m += 1) {
    const monthNumber = m + 1;
    if (monthNumber < readyMonth) continue;

    const occupied = Math.min(
      stabilisedUnits,
      (monthNumber - readyMonth + 1) * line.fillRatePerMonth,
    );
    // Inside the plan's horizon there is no turnover — that is a
    // long-horizon effect, and it belongs to holdEconomics. Here an
    // entry fee is earned only by a unit filling for the first time.
    entry[m] = Math.max(0, occupied - previousOccupied) * line.entryFeePerUnit;
    recurring[m] = occupied * line.chargePerUnitMonth;
    operating[m] = line.fixedOpexMonth + occupied * line.varOpexPerUnitMonth;
    previousOccupied = occupied;
  }

  const bookings = zeros(months);
  const collections = zeros(months);
  const outflow = zeros(months);
  const net = zeros(months);
  for (let m = 0; m < months; m += 1) {
    // A held asset earns as the money arrives — there is nothing to
    // recognise up front, so bookings and collections are the same.
    bookings[m] = entry[m] + recurring[m];
    collections[m] = bookings[m];
    outflow[m] = land[m] + construction[m] + operating[m];
    net[m] = collections[m] - outflow[m];
  }

  const cash = runCash(net, monthlyRate, 0);

  // Stabilised, whatever the horizon: what it earns in a steady year.
  const stabilisedRevenue = stabilisedUnits * line.chargePerUnitMonth * 12;
  const stabilisedOpex = (line.fixedOpexMonth + stabilisedUnits * line.varOpexPerUnitMonth) * 12;
  const stabilisedNoi = stabilisedRevenue - stabilisedOpex;
  const terminalValue = stabilisedNoi / (line.exitCapRatePct / 100);

  const economics = holdEconomics(line, areas.capex, areas.sbaTotal);

  const entryFees = sum(entry);
  const recurringCharges = sum(recurring);
  const operatingOpex = sum(operating);
  const landCost = sum(land);
  const capexInHorizon = sum(construction);
  const revenue = entryFees + recurringCharges;
  const directCost = landCost + capexInHorizon + operatingOpex;

  return {
    id: line.id,
    name: line.name,
    kind: "hold",
    carpetTotal: areas.carpetTotal,
    buaTotal: areas.buaTotal,
    sbaTotal: areas.sbaTotal,
    capex: areas.capex,
    capexPerUnit: line.units > 0 ? areas.capex / line.units : null,
    capexPerBuaSqft: areas.buaTotal > 0 ? areas.capex / areas.buaTotal : null,
    entryFees,
    recurringCharges,
    operatingOpex,
    stabilisedNoi,
    yieldOnCostPct: areas.capex > 0 ? (stabilisedNoi / areas.capex) * 100 : null,
    terminalValue,
    holdValue: economics.holdValue,
    sellValue: economics.sellValue,
    verdict: economics.verdict,
    holdIrrPct: economics.holdIrrPct,
    equityMultiple: economics.equityMultiple,
    revenue,
    landCost,
    directCost,
    grossProfit: revenue - directCost,
    interest: cash.totalInterest,
    profit: revenue - directCost - cash.totalInterest,
    marginPct: revenue > 0 ? ((revenue - directCost - cash.totalInterest) / revenue) * 100 : null,
    cashTrough: cash.cashTrough,
    peakFunding: cash.peakFunding,
    monthly: {
      unitsSold: zeros(months),
      bookings,
      collections,
      land,
      development: zeros(months),
      construction,
      operating,
      overheads: zeros(months),
      commonInfra: zeros(months),
      outflow,
      net,
      interest: cash.interest,
      closing: cash.closing,
      revolver: cash.revolver,
    },
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

  // Sales first, together, because a launch trigger makes them
  // interdependent; then each line's own series.
  const saleLines = plan.lines.filter(isSaleLine);
  const sold = unitsSoldByMonth(saleLines, scenario, months);
  let saleIndex = 0;
  const lines: LineResult[] = plan.lines.map((line) =>
    line.kind === "sale"
      ? runSaleLine(line, plan, sold[saleIndex++], months, monthlyRate)
      : runHoldLine(line, plan, months, monthlyRate),
  );

  // Consolidate the lines, then add what no line owns.
  const monthly = emptySeries(months);
  // Selling cost is a percentage of SALE bookings only. A senior-living
  // resident's monthly charge does not attract brokerage, and folding
  // hold income into the base would quietly tax it.
  const saleBookings = zeros(months);
  for (const line of lines) {
    for (let m = 0; m < months; m += 1) {
      monthly.unitsSold[m] += line.monthly.unitsSold[m];
      monthly.bookings[m] += line.monthly.bookings[m];
      monthly.collections[m] += line.monthly.collections[m];
      monthly.land[m] += line.monthly.land[m];
      monthly.development[m] += line.monthly.development[m];
      monthly.construction[m] += line.monthly.construction[m];
      monthly.operating[m] += line.monthly.operating[m];
      if (line.kind === "sale") saleBookings[m] += line.monthly.bookings[m];
    }
  }

  const planCosts = runPlanCosts(plan, saleBookings, months);
  for (let m = 0; m < months; m += 1) {
    monthly.overheads[m] = planCosts.overheads[m];
    monthly.commonInfra[m] = planCosts.commonInfra[m];
    monthly.outflow[m] =
      monthly.land[m] +
      monthly.development[m] +
      monthly.construction[m] +
      monthly.operating[m] +
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
  const operatingCost = sum(monthly.operating);
  const terminalValue = lines.reduce(
    (total, line) => total + (line.kind === "hold" ? line.terminalValue : 0),
    0,
  );
  const planCost =
    planCosts.fixedTotal +
    planCosts.variableTotal +
    planCosts.oneTimeTotal +
    planCosts.infraCapexTotal +
    planCosts.infraOpexTotal;
  const totalCost = landCost + developmentCost + constructionCost + operatingCost + planCost;
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
    operatingCost,
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
    terminalValue,
    pbtWithHeldValue: pbt + terminalValue,
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

// ---------------------------------------------------------------------
// Sensitivity
// ---------------------------------------------------------------------

/**
 * The same plan with every price, or every build cost, moved by a
 * percentage.
 *
 * The workbook's two-way table swings two named cells — the plotted
 * house price and the plotted construction cost. That cannot work here,
 * because a plan has as many lines as it has, and there is no single
 * "the price". So the axes are proportional and apply to every line:
 * what you SELL for (and charge, on a held line) against what it costs
 * to BUILD. Those are the two numbers a Kerala project is actually at
 * the mercy of, and moving all of them together is the honest version of
 * the question — prices do not fall on villas and hold on row houses.
 */
export function adjustPlan(
  plan: PlanInputs,
  { pricePct, buildCostPct }: { pricePct: number; buildCostPct: number },
): PlanInputs {
  const price = 1 + pricePct / 100;
  const build = 1 + buildCostPct / 100;

  return {
    ...plan,
    lines: plan.lines.map((line) =>
      line.kind === "sale"
        ? {
            ...line,
            landPricePsf: line.landPricePsf * price,
            housePricePsf: line.housePricePsf * price,
            constructionPsf: line.constructionPsf * build,
          }
        : {
            ...line,
            // What a held line earns moves with prices; what it would
            // fetch if sold moves with them too.
            chargePerUnitMonth: line.chargePerUnitMonth * price,
            entryFeePerUnit: line.entryFeePerUnit * price,
            sellPricePsf: line.sellPricePsf * price,
            buaCostPsf: line.buaCostPsf * build,
            basementCostPsf: line.basementCostPsf * build,
            amenitiesLumpsum: line.amenitiesLumpsum * build,
          },
    ),
  };
}

/** The percentage swings each axis of the sensitivity grid steps through. */
export const SENSITIVITY_STEPS = [-10, -5, 0, 5, 10] as const;

export type SensitivityCell = {
  pricePct: number;
  buildCostPct: number;
  pbt: number;
  marginPct: number | null;
  peakFunding: number;
};

/**
 * Twenty-five runs of the whole model, at the ACTIVE velocity.
 *
 * Cheap precisely because the engine is pure and takes no I/O: the grid
 * is just the model called again with different numbers, so it can never
 * drift from the headline figures the way a separate sensitivity formula
 * in a spreadsheet does.
 */
export function sensitivityGrid(plan: PlanInputs): SensitivityCell[][] {
  return SENSITIVITY_STEPS.map((buildCostPct) =>
    SENSITIVITY_STEPS.map((pricePct) => {
      const result = runScenario(adjustPlan(plan, { pricePct, buildCostPct }), plan.activeScenario);
      return {
        pricePct,
        buildCostPct,
        pbt: result.pbt,
        marginPct: result.marginPct,
        peakFunding: result.peakFunding,
      };
    }),
  );
}
