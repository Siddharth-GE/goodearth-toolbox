/**
 * What a business plan IS: the document the founder types, and nothing
 * that can be worked out from it.
 *
 * A plan is a set of LINES — row houses, plotted development,
 * apartments, commercial, senior living — plus the handful of things
 * that belong to the whole project rather than to any one line
 * (financing rate, company overheads, common infrastructure, the land
 * deal). Some projects are one line; most are a mix.
 *
 * Two line kinds cover every product the founder named:
 *
 *   SALE — you build it and sell it. Plotted development, row houses,
 *          villas, apartments, commercial-for-sale. The zeros do the
 *          work: a bare-plot line has no built-up area and therefore no
 *          construction; an apartment line has no saleable plot area and
 *          sells only built-up area. Same arithmetic, no special cases.
 *   HOLD — you build it and keep earning from it. Senior living, leased
 *          commercial, hospitality. (Arrives in a later migration of
 *          this file; the union is already open for it.)
 *
 * THREE RULES THIS FILE ENFORCES
 *
 * 1. INPUTS ONLY. If it can be derived it does not live here. Revenue
 *    per unit, total capex, the month a stage lands — all of that is
 *    model.ts, recomputed on every read. Same doctrine as Relay's
 *    schedule: dates are worked out, never typed.
 *
 * 2. PERCENTAGES ARE PERCENTS. `financingRatePct: 15` means 15%, not
 *    1500% and not 0.15. Every field ending `Pct` is the number a person
 *    types into a box labelled "%", and the engine divides by 100 once,
 *    at the point of use. The alternative — storing 0.15 and rendering
 *    15 — is one forgotten conversion away from a plan that is off by a
 *    factor of a hundred and looks plausible.
 *
 * 3. MONTHS ARE 1-BASED. Month 1 is the first month of the project.
 *    There is no month 0. The workbook this replaces used both.
 *
 * `parsePlanInputs` is the ONLY way a stored document becomes a
 * `PlanInputs`. The database holds this as one jsonb column and cannot
 * check a thing about it (0048 says why), so this function is the whole
 * validation boundary: every field is coerced, defaulted and clamped,
 * which is also what lets a document saved before a field existed still
 * open.
 */

export const PLAN_SCHEMA_VERSION = 1;

/** Base, Moderate, High — the three velocities, in this order, always. */
export const SCENARIOS = ["Base", "Moderate", "High"] as const;
export type ScenarioIndex = 0 | 1 | 2;

// ---------------------------------------------------------------------
// Lines
// ---------------------------------------------------------------------

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

  /** How long one unit takes to build, from the month it sells. */
  buildMonths: number;
  /** First month this line can sell anything. 1-based. */
  salesStartMonth: number;
  /** Units per month for Base, Moderate, High. */
  velocity: [number, number, number];
  /**
   * Staggered launch: stay at zero until this share of every OTHER
   * line's units has sold. null = launch straight away. The workbook
   * holds row houses back until 70% of the plotted villas are gone.
   */
  launchTriggerPct: number | null;

  /** Overrides of the plan-level collection terms. null = use the plan's. */
  bookingPct: number | null;
  instalments: number | null;
};

/**
 * Placeholder for the HOLD kind so the union, the parser and every
 * `switch` are shaped for it from day one. Fields land with the engine
 * that uses them.
 */
export type HoldLine = {
  id: string;
  kind: "hold";
  name: string;
};

export type PlanLine = SaleLine | HoldLine;

// ---------------------------------------------------------------------
// Plan-level costs
// ---------------------------------------------------------------------

/** A retainer or salary that runs every month between two months. */
export type OverheadItem = {
  id: string;
  name: string;
  monthly: number;
  startMonth: number;
  endMonth: number;
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

/**
 * Infrastructure the whole project shares and no one line owns — roads,
 * a clubhouse, the biodiversity park. Capex spreads evenly over
 * `capexMonths` from `capexStartMonth`; opex runs monthly at one twelfth
 * of `annualOpex` between its two months.
 */
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

// ---------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------

export type PlanInputs = {
  horizonMonths: number;
  /** Annual financing rate, percent. Drives interest on the revolver. */
  financingRatePct: number;
  /** Cash in the pool at month 1, before anything is spent. */
  openingEquity: number;

  /**
   * The land deal is ONE deal, so its terms sit here; each line still
   * carries its own area and rate. "cash" pays at month 1; "jv" defers
   * to `landSettlementMonth` and pays `landPremiumPct` more for the
   * privilege.
   */
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

// ---------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------

function newId(): string {
  return crypto.randomUUID();
}

/**
 * A brand-new plan: the assumptions a Kerala project starts from, and no
 * lines, no overheads, no invented figures. The fast path to a fully
 * populated plan is Duplicate, not a template full of numbers that were
 * true for somewhere else.
 */
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
    buildMonths: 18,
    salesStartMonth: 1,
    velocity: [1, 1.5, 2],
    launchTriggerPct: null,
    bookingPct: null,
    instalments: null,
  };
}

export function newHoldLine(name = "New line"): HoldLine {
  return { id: newId(), kind: "hold", name };
}

export function newOverhead(): OverheadItem {
  return { id: newId(), name: "", monthly: 0, startMonth: 1, endMonth: 60 };
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

// ---------------------------------------------------------------------
// The parser — the only door in
// ---------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A finite number, or the fallback. Rejects NaN, Infinity, strings and
 * nulls alike — a plan with `NaN` in it poisons every total downstream
 * and shows up as a blank cell nobody can explain.
 */
function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** A finite number clamped into a range. */
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

/**
 * Twelve years. Long enough for any village the founder has described,
 * short enough that a fat-fingered horizon can't allocate a 300MB array
 * on the server. Every month field is clamped to it.
 */
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
    // At least one month: a build cycle of zero divides by zero when the
    // construction spend is spread across it.
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
  return { id: id(raw.id), kind: "hold", name: str(raw.name, "Line") };
}

function parseLine(raw: unknown): PlanLine | null {
  if (!isRecord(raw)) return null;
  if (raw.kind === "hold") return parseHoldLine(raw);
  if (raw.kind === "sale") return parseSaleLine(raw);
  // An unrecognised kind is dropped rather than guessed at. Guessing
  // would silently turn a HOLD line written by a newer version of the
  // app into a SALE line worth nothing.
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

/**
 * A deep copy with fresh ids on everything, for Duplicate. New ids
 * matter: React keys and the "which line is open" state are keyed on
 * them, and two plans sharing a line id is the kind of thing that only
 * misbehaves once both are open in two tabs.
 */
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
