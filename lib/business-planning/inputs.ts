/**
 * A business plan as the founder types it, and nothing that can be worked out from it.
 * A plan is a set of LINES plus whole-project items (financing rate, overheads, common
 * infrastructure, the land deal). Two line kinds:
 *   SALE: build and sell. The zeros do the work: a bare plot has no built-up area, so no
 *         construction; an apartment has no plot area, so it sells built-up area only.
 *   HOLD: build and keep earning (senior living, leased commercial, hospitality).
 *
 * 1. Inputs only: anything derived (revenue per unit, capex, a stage's month) lives in model.ts.
 * 2. Percentages are percents: `financingRatePct: 15` means 15%. The engine divides by 100 once.
 * 3. Months are 1-based; there is no month 0.
 *
 * `parsePlanInputs` is the only way a stored document becomes `PlanInputs`. The jsonb column
 * checks nothing (0048), so the parser coerces, defaults and clamps every field, which also
 * lets a document saved before a field existed open.
 */

export const PLAN_SCHEMA_VERSION = 1;

/** Base, Moderate, High — the three velocities, in this order, always. */
export const SCENARIOS = ["Base", "Moderate", "High"] as const;
export type ScenarioIndex = 0 | 1 | 2;

export type SaleLine = {
  id: string;
  kind: "sale";
  name: string;

  /** The parcel this line sits on. Dev/infra is costed on this area. */
  landAreaSqft: number;
  /** Acquisition cost of that parcel, ₹ per sqft. */
  landCostPsf: number;
  /** Development and infrastructure, ₹ per sqft of the parcel. */
  devCostPsf: number;

  units: number;
  /** Saleable plot area per unit. Zero for an apartment. */
  plotSqftPerUnit: number;
  /** Built-up area per unit. Zero for a bare plot. */
  buaSqftPerUnit: number;

  /** Sale price, ₹ per sqft of saleable plot. */
  landPricePsf: number;
  /** Sale price, ₹ per sqft of built-up area. */
  housePricePsf: number;
  /** Construction cost, ₹ per sqft of built-up area. */
  constructionPsf: number;

  /**
   * When the building work happens:
   *   "on-sale": a unit is built because it sold; `buildMonths` is one unit's cycle from its sale
   *              month. Nothing is spent ahead of a buyer.
   *   "scheduled": the whole line is built on its own calendar (an apartment tower) from
   *              `buildStartMonth`; unsold flats are carried on debt.
   */
  buildMode: "on-sale" | "scheduled";
  /** First month of construction. `scheduled` only; ignored on-sale. */
  buildStartMonth: number;
  /** On-sale: one unit's build cycle. Scheduled: the whole building's. */
  buildMonths: number;
  /** First month this line can sell anything. 1-based. */
  salesStartMonth: number;
  /** Units per month for Base, Moderate, High. */
  velocity: [number, number, number];
  /** Staggered launch: stay at zero until this share of every OTHER line's units has sold. null = launch straight away. */
  launchTriggerPct: number | null;

  /** Overrides of the plan-level collection terms. null = use the plan's. */
  bookingPct: number | null;
  instalments: number | null;
};

/**
 * A line you build and keep earning from. Three areas do three jobs: carpet (what charges are
 * set against), BUA = carpet ÷ efficiency (what construction is costed on, always the largest)
 * and SBA = carpet × (1 + loading) (what it would sell for). Costing on carpet understates a build.
 */
export type HoldLine = {
  id: string;
  kind: "hold";
  name: string;

  /** The parcel. Acquisition follows the plan's land terms, as SALE does. */
  landAreaSqft: number;
  landCostPsf: number;
  /** Development of the parcel. Part of capex, not spread like a SALE line's. */
  devCostPsf: number;

  units: number;
  carpetSqftPerUnit: number;
  /** Carpet ÷ built-up. Lower means more walls and circulation. */
  efficiencyPct: number;
  /** Common area added on top of carpet to give saleable area. */
  loadingPct: number;
  basementSqft: number;

  buaCostPsf: number;
  basementCostPsf: number;
  amenitiesLumpsum: number;
  /** Of hard cost. */
  mepPct: number;
  /** Both of hard cost + MEP. */
  professionalPct: number;
  contingencyPct: number;

  buildStartMonth: number;
  buildMonths: number;
  /** Units filled per month once it is ready. */
  fillRatePerMonth: number;
  /** Share of units occupied at steady state. */
  occupancyPct: number;

  /** Per occupied unit, per month. */
  chargePerUnitMonth: number;
  /** Per unit, once, on move-in. */
  entryFeePerUnit: number;
  varOpexPerUnitMonth: number;
  /** Whatever the occupancy: management, security, insurance, reserve. */
  fixedOpexMonth: number;

  holdYears: number;
  discountRatePct: number;
  exitCapRatePct: number;
  chargeEscalationPct: number;
  opexEscalationPct: number;
  entryEscalationPct: number;
  /** Residents leaving and being replaced each year — new entry fees. */
  turnoverPct: number;

  /** The alternative: sell the saleable area at completion instead. */
  sellPricePsf: number;
  sellingCostPct: number;
};

export type PlanLine = SaleLine | HoldLine;

/** A retainer or salary that runs every month between two months. */
export type OverheadItem = {
  id: string;
  name: string;
  monthly: number;
  startMonth: number;
  endMonth: number;
  /** Stop paying the month the last unit sells, if that comes first: a marketing retainer ends when nothing is left to sell, head-office salaries do not. The only plan-level cost that varies by scenario. */
  endsWithSales: boolean;
};

/** Selling cost that scales with bookings: brokerage, ads, referrals. */
export type VariableCostItem = {
  id: string;
  name: string;
  /** Percent of that month's booking value. */
  pct: number;
};

/** A single spend in a single month: branding, show unit, launch event. */
export type OneTimeItem = {
  id: string;
  name: string;
  amount: number;
  month: number;
};

/** Infrastructure the whole project shares (roads, clubhouse). Capex spreads evenly over `capexMonths` from `capexStartMonth`; opex runs monthly at one twelfth of `annualOpex`. */
export type CommonInfraItem = {
  id: string;
  name: string;
  capex: number;
  capexStartMonth: number;
  capexMonths: number;
  annualOpex: number;
  opexStartMonth: number;
  /** null = to the end of the horizon. */
  opexEndMonth: number | null;
};

export type PlanInputs = {
  horizonMonths: number;
  /** Annual financing rate, percent. Drives interest on the revolver. */
  financingRatePct: number;
  /** Cash in the pool at month 1, before anything is spent. */
  openingEquity: number;

  /** One land deal, so its terms sit here (each line carries its own area and rate). "cash" pays at month 1; "jv" defers to `landSettlementMonth` and pays `landPremiumPct` more. */
  landTerms: "cash" | "jv";
  landPremiumPct: number;
  landSettlementMonth: number;

  /** Development and infrastructure spend spreads over these months. */
  devMonths: number;

  /** Default collection terms; a line may override both. */
  bookingPct: number;
  instalments: number;

  overheads: OverheadItem[];
  variableCosts: VariableCostItem[];
  oneTimeCosts: OneTimeItem[];
  commonInfra: CommonInfraItem[];

  lines: PlanLine[];

  activeScenario: ScenarioIndex;
};

function newId(): string {
  return crypto.randomUUID();
}

/** A brand-new plan: Kerala starting assumptions, no lines, no invented figures. Duplicate is the fast path, not a template of numbers true elsewhere. */
export function defaultPlanInputs(): PlanInputs {
  return {
    horizonMonths: 72,
    financingRatePct: 15,
    openingEquity: 0,
    landTerms: "cash",
    landPremiumPct: 0,
    landSettlementMonth: 48,
    devMonths: 24,
    bookingPct: 30,
    instalments: 10,
    overheads: [],
    variableCosts: [],
    oneTimeCosts: [],
    commonInfra: [],
    lines: [],
    activeScenario: 1,
  };
}

export function newSaleLine(name = "New line"): SaleLine {
  return {
    id: newId(),
    kind: "sale",
    name,
    landAreaSqft: 0,
    landCostPsf: 0,
    devCostPsf: 0,
    units: 0,
    plotSqftPerUnit: 0,
    buaSqftPerUnit: 0,
    landPricePsf: 0,
    housePricePsf: 0,
    constructionPsf: 0,
    buildMode: "on-sale",
    buildStartMonth: 1,
    buildMonths: 18,
    salesStartMonth: 1,
    velocity: [1, 1.5, 2],
    launchTriggerPct: null,
    bookingPct: null,
    instalments: null,
  };
}

/** A hold line starts with its conventional shape filled in (efficiency, loading, escalations, cap rate) and every rupee at zero; blank would divide by zero. */
export function newHoldLine(name = "New line"): HoldLine {
  return {
    id: newId(),
    kind: "hold",
    name,
    landAreaSqft: 0,
    landCostPsf: 0,
    devCostPsf: 0,
    units: 0,
    carpetSqftPerUnit: 0,
    efficiencyPct: 50,
    loadingPct: 100,
    basementSqft: 0,
    buaCostPsf: 0,
    basementCostPsf: 0,
    amenitiesLumpsum: 0,
    mepPct: 2,
    professionalPct: 1,
    contingencyPct: 1,
    buildStartMonth: 1,
    buildMonths: 12,
    fillRatePerMonth: 1,
    occupancyPct: 90,
    chargePerUnitMonth: 0,
    entryFeePerUnit: 0,
    varOpexPerUnitMonth: 0,
    fixedOpexMonth: 0,
    holdYears: 20,
    discountRatePct: 11,
    exitCapRatePct: 9,
    chargeEscalationPct: 6,
    opexEscalationPct: 5,
    entryEscalationPct: 6,
    turnoverPct: 12,
    sellPricePsf: 0,
    sellingCostPct: 1,
  };
}

export function newOverhead(): OverheadItem {
  // Off by default: turning it on is a deliberate statement about that cost.
  return { id: newId(), name: "", monthly: 0, startMonth: 1, endMonth: 60, endsWithSales: false };
}

export function newVariableCost(): VariableCostItem {
  return { id: newId(), name: "", pct: 0 };
}

export function newOneTimeCost(): OneTimeItem {
  return { id: newId(), name: "", amount: 0, month: 1 };
}

export function newCommonInfra(): CommonInfraItem {
  return {
    id: newId(),
    name: "",
    capex: 0,
    capexStartMonth: 1,
    capexMonths: 12,
    annualOpex: 0,
    opexStartMonth: 1,
    opexEndMonth: null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A finite number, or the fallback: a `NaN` in a plan poisons every total downstream. */
function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamped(value: unknown, fallback: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, num(value, fallback)));
}

/** A whole number of months, at least `min` and inside the longest horizon. */
function month(value: unknown, fallback: number, min = 1): number {
  return Math.round(clamped(value, fallback, min, MAX_HORIZON_MONTHS));
}

function str(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

/** A number the caller may legitimately leave unset. */
function optionalNum(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function id(value: unknown): string {
  const existing = typeof value === "string" ? value.trim() : "";
  return existing || newId();
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Twelve years: stops a fat-fingered horizon allocating a huge array on the server. Every month field is clamped to it. */
export const MAX_HORIZON_MONTHS = 144;

function parseSaleLine(raw: Record<string, unknown>): SaleLine {
  const velocity = array(raw.velocity);
  return {
    id: id(raw.id),
    kind: "sale",
    name: str(raw.name, "Line"),
    landAreaSqft: Math.max(0, num(raw.landAreaSqft, 0)),
    landCostPsf: Math.max(0, num(raw.landCostPsf, 0)),
    devCostPsf: Math.max(0, num(raw.devCostPsf, 0)),
    units: Math.max(0, num(raw.units, 0)),
    plotSqftPerUnit: Math.max(0, num(raw.plotSqftPerUnit, 0)),
    buaSqftPerUnit: Math.max(0, num(raw.buaSqftPerUnit, 0)),
    landPricePsf: Math.max(0, num(raw.landPricePsf, 0)),
    housePricePsf: Math.max(0, num(raw.housePricePsf, 0)),
    constructionPsf: Math.max(0, num(raw.constructionPsf, 0)),
    // At least one month: a zero build cycle divides by zero. Anything but "scheduled" is on-sale,
    // so older plans behave as before.
    buildMode: raw.buildMode === "scheduled" ? "scheduled" : "on-sale",
    buildStartMonth: month(raw.buildStartMonth, 1),
    buildMonths: month(raw.buildMonths, 18),
    salesStartMonth: month(raw.salesStartMonth, 1),
    velocity: [
      Math.max(0, num(velocity[0], 0)),
      Math.max(0, num(velocity[1], 0)),
      Math.max(0, num(velocity[2], 0)),
    ],
    launchTriggerPct:
      raw.launchTriggerPct === null || raw.launchTriggerPct === undefined
        ? null
        : clamped(raw.launchTriggerPct, 0, 0, 100),
    bookingPct: raw.bookingPct == null ? null : clamped(raw.bookingPct, 0, 0, 100),
    instalments: raw.instalments == null ? null : Math.round(clamped(raw.instalments, 1, 1, 60)),
  };
}

function parseHoldLine(raw: Record<string, unknown>): HoldLine {
  const base = newHoldLine();
  return {
    id: id(raw.id),
    kind: "hold",
    name: str(raw.name, "Line"),

    landAreaSqft: Math.max(0, num(raw.landAreaSqft, 0)),
    landCostPsf: Math.max(0, num(raw.landCostPsf, 0)),
    devCostPsf: Math.max(0, num(raw.devCostPsf, 0)),

    units: Math.max(0, num(raw.units, 0)),
    carpetSqftPerUnit: Math.max(0, num(raw.carpetSqftPerUnit, 0)),
    // Never zero: built-up area is carpet DIVIDED by this.
    efficiencyPct: clamped(raw.efficiencyPct, base.efficiencyPct, 1, 100),
    loadingPct: clamped(raw.loadingPct, base.loadingPct, 0, 500),
    basementSqft: Math.max(0, num(raw.basementSqft, 0)),

    buaCostPsf: Math.max(0, num(raw.buaCostPsf, 0)),
    basementCostPsf: Math.max(0, num(raw.basementCostPsf, 0)),
    amenitiesLumpsum: Math.max(0, num(raw.amenitiesLumpsum, 0)),
    mepPct: clamped(raw.mepPct, base.mepPct, 0, 100),
    professionalPct: clamped(raw.professionalPct, base.professionalPct, 0, 100),
    contingencyPct: clamped(raw.contingencyPct, base.contingencyPct, 0, 100),

    buildStartMonth: month(raw.buildStartMonth, base.buildStartMonth),
    buildMonths: month(raw.buildMonths, base.buildMonths),
    fillRatePerMonth: Math.max(0, num(raw.fillRatePerMonth, base.fillRatePerMonth)),
    occupancyPct: clamped(raw.occupancyPct, base.occupancyPct, 0, 100),

    chargePerUnitMonth: Math.max(0, num(raw.chargePerUnitMonth, 0)),
    entryFeePerUnit: Math.max(0, num(raw.entryFeePerUnit, 0)),
    varOpexPerUnitMonth: Math.max(0, num(raw.varOpexPerUnitMonth, 0)),
    fixedOpexMonth: Math.max(0, num(raw.fixedOpexMonth, 0)),

    holdYears: Math.round(clamped(raw.holdYears, base.holdYears, 1, 50)),
    discountRatePct: clamped(raw.discountRatePct, base.discountRatePct, 0, 100),
    // Never zero: terminal value is NOI divided by this.
    exitCapRatePct: clamped(raw.exitCapRatePct, base.exitCapRatePct, 0.1, 100),
    chargeEscalationPct: clamped(raw.chargeEscalationPct, base.chargeEscalationPct, 0, 100),
    opexEscalationPct: clamped(raw.opexEscalationPct, base.opexEscalationPct, 0, 100),
    entryEscalationPct: clamped(raw.entryEscalationPct, base.entryEscalationPct, 0, 100),
    turnoverPct: clamped(raw.turnoverPct, base.turnoverPct, 0, 100),

    sellPricePsf: Math.max(0, num(raw.sellPricePsf, 0)),
    sellingCostPct: clamped(raw.sellingCostPct, base.sellingCostPct, 0, 100),
  };
}

function parseLine(raw: unknown): PlanLine | null {
  if (!isRecord(raw)) return null;
  if (raw.kind === "hold") return parseHoldLine(raw);
  if (raw.kind === "sale") return parseSaleLine(raw);
  // An unrecognised kind is dropped, not guessed: guessing could turn a newer app's HOLD line into a worthless SALE line.
  return null;
}

export function parsePlanInputs(raw: unknown): PlanInputs {
  const base = defaultPlanInputs();
  if (!isRecord(raw)) return base;

  const horizonMonths = month(raw.horizonMonths, base.horizonMonths, 1);

  return {
    horizonMonths,
    financingRatePct: clamped(raw.financingRatePct, base.financingRatePct, 0, 100),
    openingEquity: Math.max(0, num(raw.openingEquity, 0)),
    landTerms: raw.landTerms === "jv" ? "jv" : "cash",
    landPremiumPct: clamped(raw.landPremiumPct, 0, 0, 1000),
    landSettlementMonth: month(raw.landSettlementMonth, base.landSettlementMonth),
    devMonths: month(raw.devMonths, base.devMonths),
    bookingPct: clamped(raw.bookingPct, base.bookingPct, 0, 100),
    instalments: Math.round(clamped(raw.instalments, base.instalments, 1, 60)),

    overheads: array(raw.overheads)
      .filter(isRecord)
      .map((item) => ({
        id: id(item.id),
        name: str(item.name, ""),
        monthly: Math.max(0, num(item.monthly, 0)),
        startMonth: month(item.startMonth, 1),
        endMonth: month(item.endMonth, horizonMonths),
        // A plan saved before this field existed keeps its old behaviour.
        endsWithSales: item.endsWithSales === true,
      })),

    variableCosts: array(raw.variableCosts)
      .filter(isRecord)
      .map((item) => ({
        id: id(item.id),
        name: str(item.name, ""),
        pct: clamped(item.pct, 0, 0, 100),
      })),

    oneTimeCosts: array(raw.oneTimeCosts)
      .filter(isRecord)
      .map((item) => ({
        id: id(item.id),
        name: str(item.name, ""),
        amount: Math.max(0, num(item.amount, 0)),
        month: month(item.month, 1),
      })),

    commonInfra: array(raw.commonInfra)
      .filter(isRecord)
      .map((item) => ({
        id: id(item.id),
        name: str(item.name, ""),
        capex: Math.max(0, num(item.capex, 0)),
        capexStartMonth: month(item.capexStartMonth, 1),
        // At least one month, or the capex divides by zero.
        capexMonths: month(item.capexMonths, 12),
        annualOpex: Math.max(0, num(item.annualOpex, 0)),
        opexStartMonth: month(item.opexStartMonth, 1),
        opexEndMonth: optionalNum(item.opexEndMonth) === null ? null : month(item.opexEndMonth, 1),
      })),

    lines: array(raw.lines)
      .map(parseLine)
      .filter((line): line is PlanLine => line !== null),

    activeScenario: ([0, 1, 2] as const).includes(raw.activeScenario as ScenarioIndex)
      ? (raw.activeScenario as ScenarioIndex)
      : base.activeScenario,
  };
}

/** A deep copy with fresh ids for Duplicate: React keys and the open-line state are keyed on them. */
export function cloneInputs(inputs: PlanInputs): PlanInputs {
  return {
    ...inputs,
    overheads: inputs.overheads.map((item) => ({ ...item, id: newId() })),
    variableCosts: inputs.variableCosts.map((item) => ({ ...item, id: newId() })),
    oneTimeCosts: inputs.oneTimeCosts.map((item) => ({ ...item, id: newId() })),
    commonInfra: inputs.commonInfra.map((item) => ({ ...item, id: newId() })),
    lines: inputs.lines.map((line) =>
      line.kind === "sale"
        ? { ...line, id: newId(), velocity: [...line.velocity] as [number, number, number] }
        : { ...line, id: newId() },
    ),
  };
}
