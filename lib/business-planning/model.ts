/**
 * The engine: a plan's inputs in, every number the screens show out, for all three scenarios.
 * Pure (no imports, I/O or clock), so the browser and the server can never disagree.
 *
 * 1. Cash is monthly. Every series is `horizonMonths` numbers (index 0 = month 1); money that
 *    moves after the horizon is genuinely absent.
 * 2. Profit is matched. A sale books in full the month it happens while its build spreads over
 *    `buildMonths`, so cutting both at the horizon would reward a scenario for not finishing.
 *    The `*Cost` series are cash (interest, funding, Cashflow tab); `matchedCost` is the cost of
 *    what sold, whenever spent (PBT, margin). `costOutsideHorizon` is the gap.
 * 3. Round only when displaying.
 * 4. Null is not zero: a margin with no revenue and an uncomputable IRR are `null`, but an IRR
 *    of exactly 0 is a real answer.
 * 5. One root, three scenarios: they differ only in sale velocity per line. Out-of-order
 *    velocities are flagged, never rewritten (`velocityOutOfOrder`).
 *
 * Deliberately better than the workbook: interest is a sequential loop (no circular reference),
 * collections convolve to the horizon (not a fixed 31 months), and `cashTrough` and
 * `peakFunding` are separate (the sheet's -MIN(closing cash) is a trough, not money to raise).
 */

import {
  MAX_HORIZON_MONTHS,
  SCENARIOS,
  type HoldLine,
  type PlanInputs,
  type SaleLine,
  type ScenarioIndex,
} from "./inputs";

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
  /** Equity put in, by month: the opening balance in month 1. All zeros means the revolver funded everything. */
  equity: number[];
  interest: number[];
  closing: number[];
  revolver: number[];
};

type LineResultBase = {
  id: string;
  name: string;
  revenue: number;
  landCost: number;
  /** CASH out inside the horizon. Excludes plan-level overheads. */
  directCost: number;
  grossProfit: number;
  /**
   * Cost of what sold, whenever spent (rule 2). Adds back build past the horizon, drops the
   * unsold share of land and infra, so it can sit above or below `directCost`.
   */
  matchedCost: number;
  /** Revenue − matched cost. Before plan-level overheads and interest. */
  matchedProfit: number;
  /** Interest this line would carry alone with no equity; pooled lines fund each other, so it need not sum to the plan's. */
  interest: number;
  profit: number;
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
  constructionMatched: number;
  landMatched: number;
  developmentMatched: number;
  /** Build cost of units put up but unsold. Always 0 on an "on-sale" line; on a "scheduled" line it is the mode's whole risk. */
  unsoldStock: number;
  /** Matched profit over revenue, percent, before overheads and interest. The only sale-margin formula. */
  marginPct: number | null;
};

export type HoldLineResult = LineResultBase & {
  kind: "hold";
  /** No marginPct on purpose: capex against rent reads as a large negative. Judge a hold line by `yieldOnCostPct` and `holdIrrPct`. */

  carpetTotal: number;
  /** Built-up. What construction is costed on. */
  buaTotal: number;
  /** Super built-up. What it would sell for, if sold. */
  sbaTotal: number;

  /** Land development, hard cost, MEP, fees and contingency. */
  capex: number;
  capexPerUnit: number | null;
  capexPerBuaSqft: number | null;

  entryFees: number;
  recurringCharges: number;
  operatingOpex: number;

  /** At steady state, whatever the horizon. */
  stabilisedNoi: number;
  yieldOnCostPct: number | null;
  terminalValue: number;

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

  // Cash costs: what leaves the account inside the horizon.
  landCost: number;
  developmentCost: number;
  /** SALE construction plus HOLD capex — everything built, inside the horizon. */
  constructionCost: number;
  operatingCost: number;

  // Matched costs: the cost of what sold, whenever spent. They drive PBT and margin (rule 2).
  landMatched: number;
  developmentMatched: number;
  constructionMatched: number;

  overheadsFixed: number;
  overheadsVariable: number;
  overheadsOneTime: number;
  commonInfraCapex: number;
  commonInfraOpex: number;
  /** Overheads and common infrastructure: everything no single line owns. */
  planCost: number;
  totalCost: number;
  /** Every MATCHED cost except interest. What PBT is struck against. */
  matchedTotalCost: number;
  collected: number;
  /**
   * Sold and owed but not banked by the horizon. Never touches PBT, but it inflates `peakFunding`
   * (Vihara at 0.5 units a month: ₹9.70 Cr of apparent funding is ₹11.19 Cr of late collections).
   */
  receivableAtHorizon: number;
  /** `matchedTotalCost − totalCost`, its own row so the Summary tab adds up to PBT. */
  costOutsideHorizon: number;
  interest: number;
  standaloneInterest: number;

  pbt: number;
  /** Worth of the held assets at the end. Kept out of pbt (PBT is money that moved); `pbtWithHeldValue` adds it (workbook Block 3 row 41). */
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
    equity: zeros(months),
    interest: zeros(months),
    closing: zeros(months),
    revolver: zeros(months),
  };
}

/** Land cost by the plan's terms (cash at month 1, or deferred to a settlement month at a premium); area and rate come from the line. */
function landSpend(areaSqft: number, costPsf: number, plan: PlanInputs, months: number): number[] {
  const spend = zeros(months);
  const base = areaSqft * costPsf;
  if (base <= 0) return spend;

  const isJv = plan.landTerms === "jv";
  const payable = isJv ? base * (1 + plan.landPremiumPct / 100) : base;
  const payMonth = isJv ? plan.landSettlementMonth : 1;
  // A settlement month past the horizon means the land is never paid for inside the plan.
  if (payMonth >= 1 && payMonth <= months) spend[payMonth - 1] += payable;
  return spend;
}

/**
 * Share of a unit's price collected `offset` months after it sells: the booking percent at 0,
 * the balance in equal instalments. Always sums to 1; a test asserts it.
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

/** Spread each month's `source` forward by `schedule`. What lands past the horizon is dropped on purpose. */
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

function npv(rate: number, cashflows: number[]): number {
  let total = 0;
  for (let i = 0; i < cashflows.length; i += 1) total += cashflows[i] / (1 + rate) ** i;
  return total;
}

/**
 * The periodic rate at which these cashflows break even, or null.
 * Bisection, not Newton, which diverges on long lumpy flows. Null if the flow does not open
 * with money going OUT (the workbook reported a 1150% IRR that way) or the root is not bracketed.
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

function annualisePct(monthlyRate: number | null): number | null {
  if (monthlyRate === null) return null;
  const annual = (1 + monthlyRate) ** 12 - 1;
  return Number.isFinite(annual) ? annual * 100 : null;
}

/** Walk monthly net cashflow into a balance, compounding interest on any month that ends below zero (a revolver). */
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

function isSaleLine(line: { kind: string }): line is SaleLine {
  return line.kind === "sale";
}

/**
 * Month-by-month unit sales for every line at once. A triggered line stays at zero until the
 * given share of every OTHER line's units has sold; lines evaluate in list order, so a trigger
 * sees this month's sales from lines above it only.
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
        // A single-line plan with a trigger has nothing to wait for, so it launches.
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

  // On-sale: build follows the sales curve. Scheduled: the whole building goes up on its own
  // calendar and every unsold rupee is carried.
  const construction = zeros(months);
  if (line.buildMode === "scheduled") {
    const buildMonths = Math.max(1, Math.round(line.buildMonths));
    const total = line.units * constructionPerUnit;
    for (let i = 0; i < buildMonths; i += 1) {
      const m = line.buildStartMonth - 1 + i;
      if (m >= 0 && m < months) construction[m] += total / buildMonths;
    }
  } else {
    const spread = spreadForward(
      unitsSold.map((units) => units * constructionPerUnit),
      constructionSchedule(line.buildMonths),
      months,
    );
    for (let m = 0; m < months; m += 1) construction[m] = spread[m];
  }

  const land = landSpend(line.landAreaSqft, line.landCostPsf, plan, months);

  // This line's parcel development, spread evenly over the development period.
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

  // Standalone, no equity: giving every line the plan's cushion would count the same rupees per line.
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
    equity: zeros(months),
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

  // Rule 2: cost against booked revenue is the full cost of the homes sold, build past the horizon
  // included. Land and development: only the sold share earned anything, so only it is charged.
  const soldShare = line.units > 0 ? totalUnitsSold / line.units : 0;
  const constructionMatched = totalUnitsSold * constructionPerUnit;
  const landMatched = landCost * soldShare;
  const developmentMatched = developmentCost * soldShare;
  const matchedCost = landMatched + developmentMatched + constructionMatched;

  // Built and not sold: finished stock the money is sunk into. Zero on an on-sale line.
  const unsoldStock =
    line.buildMode === "scheduled"
      ? Math.max(0, line.units - totalUnitsSold) * constructionPerUnit
      : 0;

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
    landMatched,
    developmentMatched,
    constructionMatched,
    unsoldStock,
    directCost,
    grossProfit,
    matchedCost,
    matchedProfit: revenue - matchedCost,
    interest: cash.totalInterest,
    profit: grossProfit - cash.totalInterest,
    marginPct: revenue > 0 ? ((revenue - matchedCost) / revenue) * 100 : null,
    cashTrough: cash.cashTrough,
    peakFunding: cash.peakFunding,
    monthly,
  };
}

/** Carpet → built-up (carpet ÷ efficiency) → super built-up (carpet × (1 + loading)). Construction is costed on built-up; super built-up applies only if sold. */
export function holdAreasAndCapex(line: HoldLine) {
  const carpetTotal = line.units * line.carpetSqftPerUnit;
  // Clamped: the editor recalculates on raw keystrokes, so a typed 0 must not become Infinity.
  // Same for the exit cap rate in runHoldLine.
  const buaTotal = carpetTotal / (Math.max(1, line.efficiencyPct) / 100);
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
 * Hold versus sell over the full hold period: annual from completion, independent of the
 * monthly horizon. Occupancy ramps to a stabilised level; charges, opex and entry fees escalate
 * separately; turnover earns another entry fee. Exit is next year's NOI at the exit cap rate.
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

  // Clamped like efficiency in holdAreasAndCapex.
  const exitValue = (noi[years] * chargeEsc) / (Math.max(0.1, line.exitCapRatePct) / 100);

  let holdValue = 0;
  const irrFlow = [-capex];
  for (let y = 1; y <= years; y += 1) {
    const cash = netCash[y] + (y === years ? exitValue : 0);
    holdValue += cash / discount ** y;
    irrFlow.push(cash);
  }

  const sellValue = sbaTotal * line.sellPricePsf * (1 - line.sellingCostPct / 100);
  const totalCash = netCash.reduce((a, b) => a + b, 0) + exitValue;

  // Rule 4 both ways: no capex or no bracketed root is null, but exactly 0% is a real answer.
  const irrRate = capex > 0 ? irr(irrFlow) : null;

  return {
    holdValue,
    sellValue,
    // A tie goes to selling.
    verdict: (holdValue > sellValue ? "hold" : "sell") as "hold" | "sell",
    holdIrrPct: irrRate === null ? null : irrRate * 100,
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

  const construction = zeros(months);
  const buildMonths = Math.max(1, Math.round(line.buildMonths));
  for (let i = 0; i < buildMonths; i += 1) {
    const m = line.buildStartMonth - 1 + i;
    if (m >= 0 && m < months) construction[m] += areas.capex / buildMonths;
  }

  const land = landSpend(line.landAreaSqft, line.landCostPsf, plan, months);

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
    // No turnover inside the horizon (that is holdEconomics): an entry fee is earned only on first filling.
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
    // Held income is earned as it arrives: bookings equal collections.
    bookings[m] = entry[m] + recurring[m];
    collections[m] = bookings[m];
    outflow[m] = land[m] + construction[m] + operating[m];
    net[m] = collections[m] - outflow[m];
  }

  const cash = runCash(net, monthlyRate, 0);

  const stabilisedRevenue = stabilisedUnits * line.chargePerUnitMonth * 12;
  const stabilisedOpex = (line.fixedOpexMonth + stabilisedUnits * line.varOpexPerUnitMonth) * 12;
  const stabilisedNoi = stabilisedRevenue - stabilisedOpex;
  const terminalValue = stabilisedNoi / (Math.max(0.1, line.exitCapRatePct) / 100);

  const economics = holdEconomics(line, areas.capex, areas.sbaTotal);

  const entryFees = sum(entry);
  const recurringCharges = sum(recurring);
  const operatingOpex = sum(operating);
  const landCost = sum(land);
  const capexInHorizon = sum(construction);
  const revenue = entryFees + recurringCharges;
  const directCost = landCost + capexInHorizon + operatingOpex;

  // Rule 2 for hold: put back the build past the horizon, because `terminalValue` values a finished building.
  const matchedCost = landCost + areas.capex + operatingOpex;

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
    matchedCost,
    matchedProfit: revenue - matchedCost,
    interest: cash.totalInterest,
    profit: revenue - directCost - cash.totalInterest,
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
      equity: zeros(months),
      interest: cash.interest,
      closing: cash.closing,
      revolver: cash.revolver,
    },
  };
}

/** Overheads, selling cost, one-timers and common infrastructure, by month. */
/**
 * The month the last unit sells, or `months` if sales never stop. `months` (not 0) for a plan
 * with no sales, so an "ends with sales" overhead does not vanish and make an empty plan look profitable.
 */
function lastSaleMonth(unitsSold: number[], months: number): number {
  for (let m = unitsSold.length - 1; m >= 0; m -= 1) {
    if (unitsSold[m] > 0) return m + 1;
  }
  return months;
}

function runPlanCosts(plan: PlanInputs, bookings: number[], unitsSold: number[], months: number) {
  const fixed = zeros(months);
  const variable = zeros(months);
  const oneTime = zeros(months);
  const infraCapex = zeros(months);
  const infraOpex = zeros(months);

  // The only plan-level figure that differs by scenario (OverheadItem.endsWithSales).
  const soldOut = lastSaleMonth(unitsSold, months);

  for (const item of plan.overheads) {
    const until = item.endsWithSales ? Math.min(item.endMonth, soldOut) : item.endMonth;
    for (let m = 0; m < months; m += 1) {
      const monthNumber = m + 1;
      if (monthNumber >= item.startMonth && monthNumber <= until) fixed[m] += item.monthly;
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

  // Sales first, together: a launch trigger makes them interdependent.
  const saleLines = plan.lines.filter(isSaleLine);
  const sold = unitsSoldByMonth(saleLines, scenario, months);
  let saleIndex = 0;
  const lines: LineResult[] = plan.lines.map((line) =>
    line.kind === "sale"
      ? runSaleLine(line, plan, sold[saleIndex++], months, monthlyRate)
      : runHoldLine(line, plan, months, monthlyRate),
  );

  const monthly = emptySeries(months);
  // Selling cost applies to SALE bookings only; hold income attracts no brokerage.
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

  const planCosts = runPlanCosts(plan, saleBookings, monthly.unitsSold, months);
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
  // Equity is its own row; on a zero-equity plan it is empty and the revolver funded everything.
  if (months > 0) monthly.equity[0] = plan.openingEquity;

  const revenue = sum(monthly.bookings);
  const collected = sum(monthly.collections);
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

  // Rule 2: PBT and margin are struck against the cost of what SOLD. Plan costs go in unchanged:
  // there is no unit to match them to. A hold line's development sits inside its capex, so it
  // counts as construction here, as in the cash rows.
  let landMatched = 0;
  let developmentMatched = 0;
  let constructionMatched = 0;
  for (const line of lines) {
    if (line.kind === "sale") {
      landMatched += line.landMatched;
      developmentMatched += line.developmentMatched;
      constructionMatched += line.constructionMatched;
    } else {
      landMatched += line.landCost;
      constructionMatched += line.capex;
    }
  }
  // Each line's matchedCost already carries its operating opex: nothing is counted twice.
  const matchedTotalCost = lines.reduce((total, line) => total + line.matchedCost, 0) + planCost;
  const pbt = revenue - matchedTotalCost - cash.totalInterest;

  // Workbook's money multiple: all money in over all money out on the operating flow, ignoring timing.
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
    landMatched,
    developmentMatched,
    constructionMatched,
    overheadsFixed: planCosts.fixedTotal,
    overheadsVariable: planCosts.variableTotal,
    overheadsOneTime: planCosts.oneTimeTotal,
    commonInfraCapex: planCosts.infraCapexTotal,
    commonInfraOpex: planCosts.infraOpexTotal,
    planCost,
    totalCost,
    matchedTotalCost,
    costOutsideHorizon: matchedTotalCost - totalCost,
    collected,
    receivableAtHorizon: Math.max(0, revenue - collected),
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

/** Any sale line with velocities out of ascending order? Flagged, not clamped: rewriting what the founder typed is worse than saying it looks wrong (rule 5). */
export function velocityOutOfOrder(plan: PlanInputs): boolean {
  return plan.lines.some(
    (line) =>
      isSaleLine(line) &&
      (line.velocity[1] < line.velocity[0] || line.velocity[2] < line.velocity[1]),
  );
}

export function runPlan(plan: PlanInputs): PlanResult {
  const scenarios: [ScenarioResult, ScenarioResult, ScenarioResult] = [
    runScenario(plan, 0),
    runScenario(plan, 1),
    runScenario(plan, 2),
  ];
  return { scenarios, active: scenarios[plan.activeScenario] };
}

/** The same plan with every price, or every build cost, moved by a percentage. The axes are proportional across all lines because a plan has no single "the price". */
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
            // Held-line income and its sale value both move with prices.
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

export const SENSITIVITY_STEPS = [-10, -5, 0, 5, 10] as const;

export type SensitivityCell = {
  pricePct: number;
  buildCostPct: number;
  pbt: number;
  marginPct: number | null;
  peakFunding: number;
};

/** Twenty-five runs of the whole model at the ACTIVE velocity: the same engine, so the grid cannot drift from the headline figures. */
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
