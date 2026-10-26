/** Business planning: a plan's name and project, its setup, its lines and its costs. */
import type { Field, Value } from "../catalogue-fields";
import { defineEntries } from "./define";

/**
 * One number of a plan's document: its name there (`prop`, `at` for a velocity), and the range
 * `parsePlanInputs` in lib/business-planning/inputs.ts keeps it to (a test holds the two together).
 * The parser clamps silently, so a number outside it is refused here instead of saved as another.
 */
export type PlanNumber = {
  key: string;
  prop: string;
  at?: 0 | 1 | 2;
  label: string;
  min: number;
  max?: number;
  whole?: true;
  /** What a new line or cost starts as, as the editor's own `new…()` starts it. */
  start: number;
};

/** A yes or no of a plan's document. */
export type PlanFlag = { key: string; prop: string; label: string; start: boolean };

/** The longest plan, `MAX_HORIZON_MONTHS`: every month is clamped to it. */
export const MONTHS = 144;

const month = (key: string, prop: string, label: string, start: number): PlanNumber => ({
  key,
  prop,
  label,
  min: 1,
  max: MONTHS,
  whole: true,
  start,
});
const pct = (key: string, prop: string, label: string, start: number, min = 0): PlanNumber => ({
  key,
  prop,
  label,
  min,
  max: 100,
  start,
});
const atLeastZero = (key: string, prop: string, label: string, start = 0): PlanNumber => ({
  key,
  prop,
  label,
  min: 0,
  start,
});

export const SETUP: PlanNumber[] = [
  month("horizon_months", "horizonMonths", "Plan horizon", 72),
  pct("financing_rate_pct", "financingRatePct", "Financing rate (annual)", 15),
  atLeastZero("opening_equity", "openingEquity", "Opening equity"),
  month("development_months", "devMonths", "Development period", 24),
  { ...pct("land_premium_pct", "landPremiumPct", "Premium for deferring", 0), max: 1000 },
  month("land_settlement_month", "landSettlementMonth", "Settlement month", 48),
  pct("booking_pct", "bookingPct", "Paid on booking", 30),
  {
    key: "instalments",
    prop: "instalments",
    label: "Instalments",
    min: 1,
    max: 60,
    whole: true,
    start: 10,
  },
];

/** A SALE line's numbers. Build starts is the scheduled build's only, as the editor shows it. */
export const SALE: PlanNumber[] = [
  atLeastZero("parcel_area_sqft", "landAreaSqft", "Parcel area (sqft)"),
  atLeastZero("land_cost_psf", "landCostPsf", "Land cost (₹/sqft)"),
  atLeastZero("development_psf", "devCostPsf", "Development & infra (₹/sqft)"),
  atLeastZero("units", "units", "Units"),
  atLeastZero("plot_sqft_per_unit", "plotSqftPerUnit", "Saleable plot / unit (sqft)"),
  atLeastZero("built_up_sqft_per_unit", "buaSqftPerUnit", "Built-up area / unit (sqft)"),
  atLeastZero("land_price_psf", "landPricePsf", "Land price (₹/sqft)"),
  atLeastZero("house_price_psf", "housePricePsf", "House price (₹/sqft)"),
  atLeastZero("construction_psf", "constructionPsf", "Construction cost (₹/sqft)"),
  month("build_start_month", "buildStartMonth", "Build starts", 1),
  month("build_months", "buildMonths", "Build takes", 18),
  month("first_sale_month", "salesStartMonth", "First sale month", 1),
  { ...atLeastZero("velocity_base", "velocity", "Sales a month, Base", 1), at: 0 },
  { ...atLeastZero("velocity_moderate", "velocity", "Sales a month, Moderate", 1.5), at: 1 },
  { ...atLeastZero("velocity_high", "velocity", "Sales a month, High", 2), at: 2 },
];

/** A SALE line's own collection terms and its hold-back: none means the plan's, and straight away. */
export const SALE_OWN: PlanNumber[] = [
  pct("release_at_pct", "launchTriggerPct", "Release at (% of every other line sold)", 70),
  pct("booking_pct", "bookingPct", "Paid on booking", 30),
  {
    key: "instalments",
    prop: "instalments",
    label: "Instalments",
    min: 1,
    max: 60,
    whole: true,
    start: 10,
  },
];

export const HOLD: PlanNumber[] = [
  atLeastZero("parcel_area_sqft", "landAreaSqft", "Parcel area (sqft)"),
  atLeastZero("land_cost_psf", "landCostPsf", "Land cost (₹/sqft)"),
  atLeastZero("development_psf", "devCostPsf", "Development (₹/sqft)"),
  atLeastZero("units", "units", "Units"),
  atLeastZero("carpet_sqft_per_unit", "carpetSqftPerUnit", "Carpet / unit (sqft)"),
  pct("efficiency_pct", "efficiencyPct", "Efficiency", 50, 1),
  { ...pct("loading_pct", "loadingPct", "Loading", 100), max: 500 },
  atLeastZero("basement_sqft", "basementSqft", "Basement / parking (sqft)"),
  atLeastZero("built_up_cost_psf", "buaCostPsf", "Built-up construction (₹/sqft)"),
  atLeastZero("basement_cost_psf", "basementCostPsf", "Basement construction (₹/sqft)"),
  atLeastZero("amenities", "amenitiesLumpsum", "Amenities (₹)"),
  pct("mep_pct", "mepPct", "MEP / services", 2),
  pct("professional_pct", "professionalPct", "Professional fees", 1),
  pct("contingency_pct", "contingencyPct", "Contingency", 1),
  month("build_start_month", "buildStartMonth", "Build starts", 1),
  month("build_months", "buildMonths", "Build takes", 12),
  atLeastZero("fills_per_month", "fillRatePerMonth", "Fills at (units a month)", 1),
  pct("occupancy_pct", "occupancyPct", "Occupancy", 90),
  atLeastZero("charge_per_unit_month", "chargePerUnitMonth", "Charge / occupied unit / month"),
  atLeastZero("entry_fee_per_unit", "entryFeePerUnit", "Entry fee / unit"),
  atLeastZero(
    "running_cost_per_unit_month",
    "varOpexPerUnitMonth",
    "Running cost / occupied unit / month",
  ),
  atLeastZero("fixed_cost_month", "fixedOpexMonth", "Fixed cost / month"),
  {
    key: "hold_years",
    prop: "holdYears",
    label: "Hold for (years)",
    min: 1,
    max: 50,
    whole: true,
    start: 20,
  },
  pct("discount_rate_pct", "discountRatePct", "Discount rate", 11),
  pct("turnover_pct", "turnoverPct", "Resident turnover", 12),
  pct("charges_rise_pct", "chargeEscalationPct", "Charges rise", 6),
  pct("running_costs_rise_pct", "opexEscalationPct", "Running costs rise", 5),
  pct("entry_fees_rise_pct", "entryEscalationPct", "Entry fees rise", 6),
  pct("exit_cap_rate_pct", "exitCapRatePct", "Exit cap rate", 9, 0.1),
  atLeastZero("sale_price_psf", "sellPricePsf", "Sale price (₹/sqft)"),
  pct("selling_cost_pct", "sellingCostPct", "Selling cost", 1),
];

/** A plan's costs, each list of the document as the Setup tab shows it. */
export const COSTS = {
  overheads: {
    noun: "overhead",
    numbers: [
      atLeastZero("per_month", "monthly", "Per month (₹)"),
      month("from_month", "startMonth", "From", 1),
      month("to_month", "endMonth", "To", 60),
    ],
    flags: [
      {
        key: "ends_with_sales",
        prop: "endsWithSales",
        label: "Stops at the last sale",
        start: false,
      },
    ],
  },
  variableCosts: {
    noun: "selling cost",
    numbers: [pct("of_bookings_pct", "pct", "Of bookings", 0)],
    flags: [],
  },
  oneTimeCosts: {
    noun: "one-time cost",
    numbers: [atLeastZero("amount", "amount", "Amount (₹)"), month("month", "month", "Month", 1)],
    flags: [],
  },
  commonInfra: {
    noun: "shared item",
    numbers: [
      atLeastZero("capex", "capex", "Capex (₹)"),
      month("capex_from_month", "capexStartMonth", "Capex from", 1),
      month("spread_over_months", "capexMonths", "Spread over (months)", 12),
      atLeastZero("opex_per_year", "annualOpex", "Opex / year (₹)"),
    ],
    flags: [],
  },
} satisfies Record<string, { noun: string; numbers: PlanNumber[]; flags: PlanFlag[] }>;
export type CostList = keyof typeof COSTS;

export const COST_KINDS: Record<string, CostList> = {
  overhead: "overheads",
  "selling cost": "variableCosts",
  "one-time cost": "oneTimeCosts",
  "shared item": "commonInfra",
};

const range = (n: PlanNumber) =>
  n.max === undefined ? `at least ${n.min}` : `${n.min} to ${n.max}`;

/** The first number given outside what the plan keeps, in words. */
export function outOfRange(
  numbers: PlanNumber[],
  values: Record<string, Value>,
): string | undefined {
  for (const n of numbers) {
    const value = values[n.key];
    if (value === undefined || value === "") continue;
    const given = Number(value);
    if (given < n.min || (n.max !== undefined && given > n.max))
      return `${n.label} is ${range(n)}${n.whole ? ", a whole number" : ""}.`;
  }
  return undefined;
}

/** The same name, as a person reads it: case and spacing aside. */
export const sameName = (a: string, b: string) =>
  a.trim().replace(/\s+/g, " ").toLowerCase() === b.trim().replace(/\s+/g, " ").toLowerCase();

const plan: Field = {
  key: "plan_id",
  label: "Plan",
  kind: "id",
  table: "business_plans",
  record: true,
};

/** A number on a new record starts as the editor starts it; on a change it is kept, never emptied, unless it may be cleared. */
const asField = (n: PlanNumber, as: "start" | "keep" | "clear"): Field => ({
  key: n.key,
  label: n.label,
  kind: n.whole ? "whole" : "amount",
  optional: true,
  ...(as === "start" ? { start: String(n.start) } : as === "keep" ? { keep: true } : {}),
});
const flagField = (f: PlanFlag, adds: boolean): Field => ({
  key: f.key,
  label: f.label,
  kind: "yesno",
  optional: true,
  ...(adds ? { start: f.start } : {}),
});

const lineName: Field = { key: "line", label: "Line", kind: "text", max: 80, record: true };
const newName: Field = {
  key: "new_name",
  label: "New name",
  kind: "text",
  optional: true,
  keep: true,
  max: 80,
};

const BUILD_MODES = ["on-sale", "scheduled"] as const;
const buildMode: Field = {
  key: "build_mode",
  label: "Built",
  kind: "choice",
  choices: BUILD_MODES,
  labels: {
    "on-sale": "To order, one unit at a time once it sells",
    scheduled: "On a schedule, the whole thing, sold or not",
  },
  optional: true,
};

/** A row that changes something: at least one field beyond what it is about. */
const changes =
  (about: string[], ask: string) =>
  (values: Record<string, Value>): string | undefined =>
    Object.keys(values).some((key) => !about.includes(key)) ? undefined : ask;

const checks =
  (...rules: ((values: Record<string, Value>) => string | undefined)[]) =>
  (values: Record<string, Value>) =>
    rules.map((rule) => rule(values)).find(Boolean);

const OPEN_ELSEWHERE =
  "The plan is saved whole, so if it is open on a screen, reload it there before typing, or that screen's next save puts back what it showed.";

function costEntries<S extends string>(kind: CostList, slug: S) {
  const { noun, numbers, flags } = COSTS[kind];
  const listed = kind === "commonInfra" ? "shared infrastructure" : `${noun}s`;
  return [
    {
      key: `${slug}_new` as const,
      tool: "/business-planning",
      title: `A plan's ${noun}, added`,
      description: `Adds a ${noun} to a plan's ${listed}, by a name no other ${noun} of the plan has. ${OPEN_ELSEWHERE}`,
      adds: true as const,
      check: (values: Record<string, Value>) => outOfRange(numbers, values),
      fields: [
        plan,
        { key: "name", label: "Item", kind: "text" as const, max: 80 },
        ...numbers.map((n) => asField(n, "start")),
        ...flags.map((f) => flagField(f, true)),
      ],
    },
    {
      key: `${slug}_change` as const,
      tool: "/business-planning",
      title: `A plan's ${noun}, changed`,
      description: `Changes one of a plan's ${listed}, found by its name. ${OPEN_ELSEWHERE}`,
      check: checks(changes(["plan_id", "item"], "Say what changes."), (values) =>
        outOfRange(numbers, values),
      ),
      fields: [
        plan,
        { key: "item", label: "Item", kind: "text" as const, max: 80, record: true as const },
        newName,
        ...numbers.map((n) => asField(n, "keep")),
        ...flags.map((f) => flagField(f, false)),
      ],
    },
  ];
}

const ownTerms = (values: Record<string, Value>) =>
  values.plan_terms === false
    ? "Plan's terms is only ever yes; give the line's own booking % or instalments instead."
    : values.plan_terms === true && ("booking_pct" in values || "instalments" in values)
      ? "Either the plan's terms or the line's own, not both."
      : undefined;

export const BUSINESS_PLANNING = defineEntries([
  {
    key: "bp_plan_new",
    tool: "/business-planning",
    title: "A business plan, started",
    description:
      "Starts an empty plan with Business planning's starting assumptions and no lines; give its lines and costs as later proposals.",
    adds: true,
    form: { file: "lib/business-planning/actions.ts", reader: "createPlan" },
    fields: [
      { key: "name", label: "Name", kind: "text", max: 120 },
      { key: "location", label: "Location", kind: "text", optional: true, max: 120 },
    ],
  },
  {
    key: "bp_plan_change",
    tool: "/business-planning",
    title: "A business plan, renamed or linked",
    description:
      "A plan's name, location, or the project it is linked to (a linked plan's headline numbers become the project's targets in Reporter and Financial Management; empty unlinks it).",
    form: { file: "lib/business-planning/actions.ts", reader: "renamePlan" },
    check: changes(["plan_id"], "Say what changes: the name, location or project."),
    fields: [
      plan,
      { key: "name", label: "Name", kind: "text", optional: true, keep: true, max: 120 },
      { key: "location", label: "Location", kind: "text", optional: true, max: 120 },
      { key: "project_id", label: "Project", kind: "id", table: "projects", optional: true },
    ],
  },
  {
    key: "bp_plan_copy",
    tool: "/business-planning",
    title: "A business plan, copied",
    description: 'Copies a plan whole, as "<name> (copy)", with its location but no project link.',
    fields: [plan],
  },
  {
    key: "bp_plan_delete",
    tool: "/business-planning",
    title: "A business plan, deleted",
    description: "Deletes a plan, and the targets it gave its project.",
    fields: [plan],
  },
  {
    key: "bp_plan_setup",
    tool: "/business-planning",
    title: "A plan's setup",
    description: `The plan-wide numbers on the Setup tab, and which scenario the plan shows. A JV land deal's premium and settlement month only while the land is paid as a JV. ${OPEN_ELSEWHERE}`,
    check: checks(
      changes(["plan_id"], "Say what changes in the setup."),
      (values) => outOfRange(SETUP, values),
      (values) =>
        values.land_terms === "cash" &&
        ("land_premium_pct" in values || "land_settlement_month" in values)
          ? "A premium and settlement month are a JV's; land paid in cash has neither."
          : undefined,
    ),
    fields: [
      plan,
      ...SETUP.filter((n) => !n.prop.startsWith("land")).map((n) => asField(n, "keep")),
      {
        key: "land_terms",
        label: "Land paid how",
        kind: "choice",
        choices: ["cash", "jv"],
        labels: { cash: "Cash, up front", jv: "JV, settled later" },
        optional: true,
      },
      ...SETUP.filter((n) => n.prop.startsWith("land")).map((n) => asField(n, "keep")),
      {
        key: "scenario",
        label: "Scenario shown",
        kind: "choice",
        choices: ["Base", "Moderate", "High"],
        optional: true,
      },
    ],
  },
  {
    key: "bp_sale_line_new",
    tool: "/business-planning",
    title: "A line you sell, added",
    description: `Adds a SALE line (build and sell) to a plan, by a name no other line of the plan has; the zeros carry the product (a bare plot has no built-up area, an apartment no plot area). Build starts only for a line built on a schedule. Release at holds the line back until that share of every other line has sold (left out: launches straight away). Booking % and instalments are the line's own terms (left out: the plan's). ${OPEN_ELSEWHERE}`,
    adds: true,
    check: checks(
      (values) => outOfRange([...SALE, ...SALE_OWN], values),
      (values) =>
        values.build_mode !== "scheduled" && values.build_start_month !== "1"
          ? "Build starts is for a line built on a schedule."
          : undefined,
    ),
    fields: [
      { key: "name", label: "Name", kind: "text", max: 80 },
      plan,
      { ...buildMode, start: "on-sale" },
      ...SALE.map((n) => asField(n, "start")),
      ...SALE_OWN.map((n) => asField(n, "clear")),
    ],
  },
  {
    key: "bp_sale_line_change",
    tool: "/business-planning",
    title: "A line you sell, changed",
    description: `Changes one of a plan's SALE lines, found by its name. Build starts only for a line built on a schedule. Release at empty launches it straight away. Booking % or instalments give the line its own terms (the other taken from the line, else the plan); Plan's terms yes puts it back on the plan's. ${OPEN_ELSEWHERE}`,
    check: checks(
      changes(["plan_id", "line"], "Say what changes on the line."),
      (values) => outOfRange([...SALE, ...SALE_OWN], values),
      ownTerms,
    ),
    fields: [
      plan,
      lineName,
      newName,
      buildMode,
      ...SALE.map((n) => asField(n, "keep")),
      asField(SALE_OWN[0], "clear"),
      ...SALE_OWN.slice(1).map((n) => asField(n, "keep")),
      { key: "plan_terms", label: "Plan's terms", kind: "yesno", optional: true },
    ],
  },
  {
    key: "bp_hold_line_new",
    tool: "/business-planning",
    title: "A line you hold, added",
    description: `Adds a HOLD line (build and keep earning: senior living, leased commercial, hospitality) to a plan, by a name no other line of the plan has. Left out, a number starts as the editor starts it. ${OPEN_ELSEWHERE}`,
    adds: true,
    check: (values) => outOfRange(HOLD, values),
    fields: [
      { key: "name", label: "Name", kind: "text", max: 80 },
      plan,
      ...HOLD.map((n) => asField(n, "start")),
    ],
  },
  {
    key: "bp_hold_line_change",
    tool: "/business-planning",
    title: "A line you hold, changed",
    description: `Changes one of a plan's HOLD lines, found by its name. ${OPEN_ELSEWHERE}`,
    check: checks(changes(["plan_id", "line"], "Say what changes on the line."), (values) =>
      outOfRange(HOLD, values),
    ),
    fields: [plan, lineName, newName, ...HOLD.map((n) => asField(n, "keep"))],
  },
  {
    key: "bp_line_remove",
    tool: "/business-planning",
    title: "A plan's line, removed",
    description: `Removes a line, sold or held, from a plan, found by its name. ${OPEN_ELSEWHERE}`,
    fields: [plan, lineName],
  },
  ...costEntries("overheads", "bp_overhead"),
  ...costEntries("variableCosts", "bp_selling_cost"),
  ...costEntries("oneTimeCosts", "bp_one_time_cost"),
  ...costEntries("commonInfra", "bp_shared_item"),
  {
    key: "bp_cost_remove",
    tool: "/business-planning",
    title: "A plan's cost, removed",
    description: `Removes an overhead, selling cost, one-time cost or shared infrastructure item from a plan, found by its name. ${OPEN_ELSEWHERE}`,
    fields: [
      plan,
      {
        key: "kind",
        label: "Kind",
        kind: "choice",
        choices: Object.keys(COST_KINDS),
        record: true,
      },
      { key: "item", label: "Item", kind: "text", max: 80, record: true },
    ],
  },
]);
