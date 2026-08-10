/**
 * The engine, checked against a model that was built without it.
 *
 * The headline tests reproduce the founder's Vihara workbook figure for
 * figure. That is the strongest test available: the workbook was arrived
 * at independently, by hand, over thirteen sheets, so agreement is
 * evidence and not a tautology. The rest cover the pieces where being
 * subtly wrong would still look plausible on screen.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  defaultPlanInputs,
  newSaleLine,
  parsePlanInputs,
  type PlanInputs,
  type SaleLine,
} from "./inputs";
import { collectionSchedule, constructionSchedule, irr, runPlan, runScenario } from "./model";
import { viharaPlan } from "./vihara-fixture";

/** ₹1,000 on figures in the hundreds of crore — six significant figures. */
const RUPEE_TOLERANCE = 1_000;

function closeTo(actual: number, expected: number, tolerance = RUPEE_TOLERANCE) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${expected.toLocaleString()}, got ${actual.toLocaleString()} (off by ${(actual - expected).toLocaleString()})`,
  );
}

// ---------------------------------------------------------------------
// The acceptance test
// ---------------------------------------------------------------------

test("Vihara, Moderate: every Block 1 figure matches the workbook", () => {
  const result = runScenario(viharaPlan(), 1);

  // Summary!C6:C8 — 42 plotted at ₹2.0675 Cr, 35 row houses at ₹0.9425 Cr.
  closeTo(result.lines[0].revenue, 868_350_000);
  closeTo(result.lines[1].revenue, 329_875_000);
  closeTo(result.revenue, 1_198_225_000);

  // Summary!C9:C13 — the cost lines.
  closeTo(result.landCost, 171_600_000); // ₹13.2 Cr JV-settled at +30%
  closeTo(result.developmentCost, 130_200_000);
  closeTo(result.constructionCost, 449_400_000);
  closeTo(result.overheadsFixed + result.overheadsVariable + result.overheadsOneTime, 122_429_000);
  closeTo(result.commonInfraCapex + result.commonInfraOpex, 58_000_000);

  // Summary!C14 — and this one the engine agrees with for a REASON, not
  // by coincidence: the pooled balance never goes below zero, so there
  // is nothing to charge interest on. See the cash-trough assertion.
  assert.equal(result.interest, 0);

  // Summary!C15:C16 — the two figures the founder actually reads.
  closeTo(result.pbt, 266_596_000);
  assert.ok(result.marginPct !== null);
  closeTo(result.marginPct, 22.249243672932881, 0.001);

  // Summary!C17 — the workbook labels this "Peak funding" and reports
  // −₹5.91 Cr. The minus is the tell: it is −MIN(closing cash), and the
  // cash never goes negative. ₹5.91 Cr is the LOWEST the balance gets,
  // not money anyone has to raise.
  closeTo(result.cashTrough, 59_118_147.73);
  assert.equal(result.peakFunding, 0);

  // Summary!C55 — total positive monthly net over total negative.
  assert.ok(result.moneyMultiple !== null);
  closeTo(result.moneyMultiple, 2.5629820851562997, 0.0001);
});

test("Vihara, Base: slower selling leaves units and construction unfinished", () => {
  const result = runScenario(viharaPlan(), 0);

  // Summary!B6 — all 42 villas still sell inside six years at 0.8/month.
  closeTo(result.lines[0].revenue, 868_350_000);
  // 41.999999999999993 — the workbook's own total reads the same, for
  // the same reason: forty-odd additions of 0.8.
  closeTo(result.lines[0].unitsSold, 42, 1e-9);

  // Summary!B7 — the row houses do NOT. They wait for the villas to
  // cross 70% (month 37 at this pace) and then have 36 months left,
  // which is 28.8 units, not 35. This is the horizon doing its job.
  closeTo(result.lines[1].revenue, 271_440_000);
  closeTo(result.lines[1].unitsSold, 28.8, 0.001);
  closeTo(result.lines[1].unitsUnsold, 6.2, 0.001);

  closeTo(result.revenue, 1_139_790_000);

  // Summary!B11 — ₹39.43 Cr, not the ₹42.34 Cr those units would cost to
  // build, because the last homes sold have build cycles running past
  // month 72. Spend outside the horizon is genuinely outside the plan.
  closeTo(result.constructionCost, 394_276_363.64);

  // Summary!B12:B13
  closeTo(result.overheadsFixed + result.overheadsVariable + result.overheadsOneTime, 120_091_600);
  closeTo(result.commonInfraCapex + result.commonInfraOpex, 58_000_000);

  // Summary!B15:B17, B55
  closeTo(result.pbt, 265_622_036.36);
  assert.ok(result.marginPct !== null);
  closeTo(result.marginPct, 23.304471557360254, 0.001);
  closeTo(result.cashTrough, 36_030_266.67);
  assert.ok(result.moneyMultiple !== null);
  closeTo(result.moneyMultiple, 2.0797565863242262, 0.0001);
});

test("Vihara, High: selling out faster leaves more cash in the trough", () => {
  const result = runScenario(viharaPlan(), 2);

  // Summary!D15:D17. High and Moderate reach the same PBT — both sell
  // every unit and build every home inside the horizon, so only the
  // TIMING differs — but the cash position does not: faster collections
  // mean the balance never dips as low.
  closeTo(result.pbt, 266_596_000);
  closeTo(result.cashTrough, 66_788_363.64);
  assert.ok(result.cashTrough > runScenario(viharaPlan(), 1).cashTrough);
});

test("the active scenario is the one the summary reads", () => {
  const plan = viharaPlan();
  const moderate = runPlan(plan);
  assert.equal(moderate.active.name, "Moderate");
  assert.equal(moderate.scenarios.length, 3);

  const base = runPlan({ ...plan, activeScenario: 0 });
  assert.equal(base.active.name, "Base");
  closeTo(base.active.pbt, 265_622_036.36);
});

// ---------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------

test("a collection schedule always adds up to the whole price", () => {
  // A schedule summing to 0.98 is a 2% revenue error that nothing on
  // screen would ever reveal, so this is checked across the awkward
  // shapes rather than one convenient case.
  for (const [booking, instalments, build] of [
    [30, 10, 22],
    [30, 10, 18],
    [0, 1, 1],
    [100, 10, 24],
    [10, 7, 40],
    [45, 3, 5],
  ] as const) {
    const schedule = collectionSchedule(booking, instalments, build);
    const total = schedule.reduce((a, b) => a + b, 0);
    assert.ok(
      Math.abs(total - 1) < 1e-9,
      `booking ${booking}% × ${instalments} over ${build}mo summed to ${total}`,
    );
  }
});

test("booking money lands the month of sale, the balance across the build", () => {
  const schedule = collectionSchedule(30, 10, 22);
  assert.equal(schedule[0], 0.3);
  // round(22/10) = 2, so instalments fall on months 2, 4 … 20.
  closeTo(schedule[2], 0.07, 1e-9);
  assert.equal(schedule[1], 0);
  closeTo(schedule[20], 0.07, 1e-9);
  assert.equal(schedule.length, 21);
});

test("construction spreads evenly across the build cycle", () => {
  const schedule = constructionSchedule(22);
  assert.equal(schedule.length, 22);
  closeTo(
    schedule.reduce((a, b) => a + b, 0),
    1,
    1e-9,
  );
});

// ---------------------------------------------------------------------
// Selling
// ---------------------------------------------------------------------

function planWith(lines: SaleLine[], overrides: Partial<PlanInputs> = {}): PlanInputs {
  return { ...defaultPlanInputs(), horizonMonths: 60, lines, ...overrides };
}

function saleLine(overrides: Partial<SaleLine>): SaleLine {
  return { ...newSaleLine(), ...overrides } as SaleLine;
}

test("a line never sells more units than it has", () => {
  const line = saleLine({
    units: 10,
    plotSqftPerUnit: 1000,
    landPricePsf: 1000,
    velocity: [3, 3, 3],
  });
  const result = runScenario(planWith([line]), 0);
  assert.equal(result.lines[0].unitsSold, 10);
  closeTo(result.revenue, 10_000_000);
  // Four months of 3, 3, 3, 1 — the last month is the remainder.
  closeTo(result.monthly.unitsSold[3], 1, 1e-9);
  assert.equal(result.monthly.unitsSold[4], 0);
});

test("a launch trigger holds a line at zero until the others cross it", () => {
  const first = saleLine({
    id: "a",
    units: 10,
    plotSqftPerUnit: 1000,
    landPricePsf: 1000,
    velocity: [1, 1, 1],
  });
  const second = saleLine({
    id: "b",
    units: 10,
    plotSqftPerUnit: 1000,
    landPricePsf: 1000,
    velocity: [1, 1, 1],
    launchTriggerPct: 70,
  });
  const result = runScenario(planWith([first, second]), 0);

  // Line A sells one a month, so it crosses 7 of 10 in month 7 — and
  // line B releases that same month, because the trigger reads the
  // cumulative INCLUDING this month, the way the spreadsheet column does.
  const soldByB = result.lines[1].monthly.unitsSold;
  assert.equal(
    soldByB.slice(0, 6).reduce((a, b) => a + b, 0),
    0,
  );
  assert.equal(soldByB[6], 1);
});

test("a trigger on the only line in a plan launches rather than deadlocking", () => {
  const only = saleLine({
    units: 5,
    plotSqftPerUnit: 1000,
    landPricePsf: 1000,
    velocity: [1, 1, 1],
    launchTriggerPct: 70,
  });
  const result = runScenario(planWith([only]), 0);
  assert.equal(result.lines[0].unitsSold, 5);
});

test("sales start month holds a line back without a trigger", () => {
  const late = saleLine({
    units: 5,
    plotSqftPerUnit: 1000,
    landPricePsf: 1000,
    velocity: [1, 1, 1],
    salesStartMonth: 10,
  });
  const result = runScenario(planWith([late]), 0);
  assert.equal(result.monthly.unitsSold[8], 0);
  assert.equal(result.monthly.unitsSold[9], 1);
});

// ---------------------------------------------------------------------
// Land, costs and cash
// ---------------------------------------------------------------------

test("JV land is nothing until settlement, then the whole thing plus premium", () => {
  const line = saleLine({ landAreaSqft: 10_000, landCostPsf: 100, units: 0 });
  const result = runScenario(
    planWith([line], { landTerms: "jv", landPremiumPct: 30, landSettlementMonth: 24 }),
    0,
  );
  assert.equal(result.monthly.land[0], 0);
  assert.equal(result.monthly.land[22], 0);
  closeTo(result.monthly.land[23], 1_300_000);
  closeTo(result.landCost, 1_300_000);
});

test("cash land is paid at month one, at face value", () => {
  const line = saleLine({ landAreaSqft: 10_000, landCostPsf: 100, units: 0 });
  // The premium is ignored on a cash deal — it is what the deferral buys.
  const result = runScenario(planWith([line], { landTerms: "cash", landPremiumPct: 30 }), 0);
  closeTo(result.monthly.land[0], 1_000_000);
  closeTo(result.landCost, 1_000_000);
});

test("interest is zero while equity covers the trough, and charged once it doesn't", () => {
  const line = saleLine({
    units: 4,
    plotSqftPerUnit: 1000,
    landPricePsf: 1000,
    landAreaSqft: 4000,
    landCostPsf: 500,
    velocity: [1, 1, 1],
  });

  const funded = runScenario(planWith([line], { openingEquity: 10_000_000 }), 0);
  assert.equal(funded.interest, 0);
  assert.equal(funded.peakFunding, 0);
  assert.ok(funded.cashTrough > 0);

  const unfunded = runScenario(planWith([line], { openingEquity: 0 }), 0);
  assert.ok(unfunded.interest > 0);
  assert.ok(unfunded.peakFunding > 0);
  assert.ok(unfunded.cashTrough < 0);
  // The plan is worse off by exactly the interest it had to pay.
  closeTo(unfunded.pbt, funded.pbt - unfunded.interest);
});

test("pooling borrows less than the lines would separately", () => {
  // A line in surplus funds a line in deficit, so the consolidated
  // interest is below the sum of the standalone figures. The summary
  // shows both and names the gap; this is why they differ.
  const result = runScenario(viharaPlan(), 1);
  assert.ok(result.standaloneInterest > 0, "each line alone has no equity, so it borrows");
  assert.equal(result.interest, 0);
  assert.ok(result.interest < result.standaloneInterest);
});

test("an empty plan reports nothing rather than zeros pretending to be answers", () => {
  const result = runScenario(defaultPlanInputs(), 1);
  assert.equal(result.revenue, 0);
  assert.equal(result.pbt, 0);
  assert.equal(result.marginPct, null);
  assert.equal(result.moneyMultiple, null);
  assert.equal(result.irrAnnualPct, null);
  assert.equal(result.lines.length, 0);
});

test("a plan with no revenue can't divide by it", () => {
  const line = saleLine({ units: 0, landAreaSqft: 1000, landCostPsf: 100 });
  const result = runScenario(planWith([line]), 0);
  assert.equal(result.marginPct, null);
  assert.equal(result.lines[0].marginPct, null);
  assert.ok(Number.isFinite(result.pbt));
});

// ---------------------------------------------------------------------
// IRR
// ---------------------------------------------------------------------

test("IRR finds a known rate", () => {
  // −100 now, 110 in one period: 10%.
  const rate = irr([-100, 110]);
  assert.ok(rate !== null);
  closeTo(rate, 0.1, 1e-6);
});

test("IRR refuses a flow that opens with money coming in", () => {
  // This is the guard the workbook lacks. Its Venture IRR row reports
  // 1150% for Moderate and −52% for High off a flow that starts
  // positive; a dash is the honest answer.
  assert.equal(irr([100, 50, -20]), null);
  assert.equal(irr([0, 0, 100, -50]), null);
});

test("IRR refuses a flow that never turns around", () => {
  assert.equal(irr([-100, -50, -20]), null);
  assert.equal(irr([0, 0, 0]), null);
});

// ---------------------------------------------------------------------
// The engine survives what the parser lets through
// ---------------------------------------------------------------------

test("a garbage document parses to defaults and still runs", () => {
  const parsed = parsePlanInputs({
    horizonMonths: "not a number",
    financingRatePct: null,
    lines: [{ kind: "sale", units: Number.NaN, velocity: ["x", null] }, "nonsense", null],
    overheads: [{ monthly: Number.POSITIVE_INFINITY }],
  });
  const result = runScenario(parsed, 1);
  assert.ok(Number.isFinite(result.pbt));
  assert.equal(parsed.lines.length, 1);
  assert.equal(parsed.overheads[0].monthly, 0);
});

test("zero instalments and a zero build cycle don't divide by zero", () => {
  const parsed = parsePlanInputs({
    instalments: 0,
    lines: [
      {
        kind: "sale",
        units: 2,
        plotSqftPerUnit: 1000,
        landPricePsf: 1000,
        buildMonths: 0,
        velocity: [1, 1, 1],
      },
    ],
  });
  const result = runScenario(parsed, 0);
  assert.ok(Number.isFinite(result.revenue));
  assert.ok(Number.isFinite(result.pbt));
  closeTo(result.revenue, 2_000_000);
});
