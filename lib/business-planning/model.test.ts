/** The engine against Vihara, the founder's independent workbook, figure for figure; the rest cover pieces where being subtly wrong would still look plausible. */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  defaultPlanInputs,
  newHoldLine,
  newSaleLine,
  parsePlanInputs,
  type PlanInputs,
  type SaleLine,
} from "./inputs";
import {
  adjustPlan,
  collectionSchedule,
  constructionSchedule,
  irr,
  runPlan,
  runScenario,
  sensitivityGrid,
  velocityOutOfOrder,
  type SaleLineResult,
  type ScenarioResult,
} from "./model";
import { viharaConsolidatedPlan, viharaPlan, viharaSeniorLivingPlan } from "./vihara-fixture";

/** ₹1,000 on figures in the hundreds of crore — six significant figures. */
const RUPEE_TOLERANCE = 1_000;

function closeTo(actual: number, expected: number, tolerance = RUPEE_TOLERANCE) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${expected.toLocaleString()}, got ${actual.toLocaleString()} (off by ${(actual - expected).toLocaleString()})`,
  );
}

/** Narrow a line result to the SALE kind, failing loudly if it isn't. */
function sale(result: ScenarioResult, index = 0): SaleLineResult {
  const line = result.lines[index];
  assert.ok(line.kind === "sale", `line ${index} is not a sale line`);
  return line;
}

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

  // Summary!C14: zero because the pooled balance never goes below zero (see the cash-trough assertion).
  assert.equal(result.interest, 0);

  // Summary!C15:C16. Moderate sells out, so matched and cash cost are equal and rule 2 leaves it untouched.
  closeTo(result.pbt, 266_596_000);
  assert.ok(result.marginPct !== null);
  closeTo(result.marginPct, 22.249243672932881, 0.001);
  closeTo(result.matchedTotalCost, result.totalCost, 1);
  closeTo(result.costOutsideHorizon, 0, 1);

  // Summary!C17: the sheet's -MIN(closing cash) is the LOWEST balance, not money to raise.
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
  // 41.999999999999993: forty-odd additions of 0.8, the same as the workbook's own total.
  closeTo(sale(result).unitsSold, 42, 1e-9);

  // Summary!B7: the row houses wait for the villas to cross 70% (month 37), leaving 28.8 units, not 35.
  closeTo(result.lines[1].revenue, 271_440_000);
  closeTo(sale(result, 1).unitsSold, 28.8, 0.001);
  closeTo(sale(result, 1).unitsUnsold, 6.2, 0.001);

  closeTo(result.revenue, 1_139_790_000);

  // Summary!B11: ₹39.43 Cr of cash, not the ₹42.34 Cr built; late build cycles run past month 72.
  closeTo(result.constructionCost, 394_276_363.64);

  // Summary!B12:B13
  closeTo(result.overheadsFixed + result.overheadsVariable + result.overheadsOneTime, 120_091_600);
  closeTo(result.commonInfraCapex + result.commonInfraOpex, 58_000_000);

  // Rule 2: ₹42.34 Cr is what the homes that sold cost to build. Cash above, cost of what sold here.
  closeTo(result.constructionMatched, 423_360_000);

  // Land and infra go the other way: the 6.2 unsold row houses' parcel share is not charged.
  assert.ok(result.landMatched < result.landCost);
  assert.ok(result.developmentMatched < result.developmentCost);
  closeTo(result.landMatched, 166_697_142.86);
  closeTo(result.developmentMatched, 126_480_000);

  // The gap the Summary shows as its own row: build put back, less land and infra taken out.
  closeTo(result.costOutsideHorizon, result.matchedTotalCost - result.totalCost, 1);
  closeTo(result.costOutsideHorizon, 20_460_779.22);

  // Summary!B15:B17, B55: PBT and margin depart from the workbook on purpose. The sheet's 23.3%
  // beats Moderate's 22.2% because it counts all the revenue and only the finished build.
  closeTo(result.pbt, 245_161_257.14);
  assert.ok(result.marginPct !== null);
  closeTo(result.marginPct, 21.50933567963023, 0.001);

  // Cash is untouched: same trough, same money multiple as the workbook.
  closeTo(result.cashTrough, 36_030_266.67);
  assert.ok(result.moneyMultiple !== null);
  closeTo(result.moneyMultiple, 2.0797565863242262, 0.0001);
});

test("money sold but not yet banked is reported, not lost", () => {
  // Mirror of costOutsideHorizon: late collections never touch PBT but make `peakFunding` look
  // worse (Vihara at 0.5/month: ₹9.7 Cr apparent funding, ₹11.2 Cr collected past month 72).
  const plan = viharaPlan();
  const slow = runScenario(
    {
      ...plan,
      lines: plan.lines.map((line) =>
        line.kind === "sale"
          ? { ...line, velocity: [0.5, 0.5, 0.5] as [number, number, number] }
          : line,
      ),
    },
    0,
  );

  assert.ok(slow.receivableAtHorizon > 0, "slow selling leaves money uncollected");
  closeTo(slow.receivableAtHorizon, slow.revenue - slow.collected, 1);
  closeTo(slow.receivableAtHorizon, 111_900_000, 1_000_000);
  assert.ok(
    slow.receivableAtHorizon > slow.peakFunding,
    "the whole apparent funding gap is late collections",
  );

  // A plan that sells out early collects everything: exactly zero, no rounding ghost.
  const fast = runScenario(
    {
      ...plan,
      lines: plan.lines.map((line) =>
        line.kind === "sale" ? { ...line, velocity: [4, 4, 4] as [number, number, number] } : line,
      ),
    },
    0,
  );
  closeTo(fast.receivableAtHorizon, 0, 1);
  closeTo(fast.collected, fast.revenue, 1);
});

test("an overhead that ends with sales is what makes velocity worth anything", () => {
  // Vihara's overheads run to a fixed calendar month, so selling out in month 16 paid as much
  // retainer as month 64 and PBT was identical at 1/mo and 4/mo.
  const plan = viharaPlan();
  const at = (v: number, endsWithSales: boolean): PlanInputs => ({
    ...plan,
    overheads: plan.overheads.map((item) => ({ ...item, endsWithSales })),
    lines: plan.lines.map((line) =>
      line.kind === "sale" ? { ...line, velocity: [v, v, v] as [number, number, number] } : line,
    ),
  });

  // Fixed to the calendar: identical, however fast it goes.
  const slowFixed = runScenario(at(1, false), 0);
  const fastFixed = runScenario(at(4, false), 0);
  closeTo(slowFixed.overheadsFixed, fastFixed.overheadsFixed, 1);
  closeTo(slowFixed.pbt, fastFixed.pbt, 1);

  // Ending with sales: the fast plan stops paying sooner, so profit responds.
  const slowTracking = runScenario(at(1, true), 0);
  const fastTracking = runScenario(at(4, true), 0);
  assert.ok(
    fastTracking.overheadsFixed < slowTracking.overheadsFixed,
    "selling out sooner should pay fewer months of overhead",
  );
  assert.ok(
    fastTracking.pbt > slowTracking.pbt + 10_000_000,
    `selling four times faster should be worth crore, got ${fastTracking.pbt - slowTracking.pbt}`,
  );

  // Never charges more than the calendar schedule: the item's own end month is a ceiling.
  assert.ok(fastTracking.overheadsFixed <= fastFixed.overheadsFixed);
  assert.ok(slowTracking.overheadsFixed <= slowFixed.overheadsFixed);
});

test("an overhead that ends with sales survives a plan with no sales", () => {
  // Nothing has sold: falling back to zero would make an empty plan look profitable.
  const plan: PlanInputs = {
    ...defaultPlanInputs(),
    overheads: [
      {
        id: "o",
        name: "Retainer",
        monthly: 100_000,
        startMonth: 1,
        endMonth: 12,
        endsWithSales: true,
      },
    ],
  };
  const result = runScenario(plan, 1);
  closeTo(result.overheadsFixed, 1_200_000, 1);
  assert.ok(Number.isFinite(result.pbt));
});

/** A tower: 100 flats, built months 1-30, sold from month 6. */
function apartmentPlan(velocity: number, openingEquity = 0): PlanInputs {
  return {
    ...defaultPlanInputs(),
    horizonMonths: 72,
    financingRatePct: 15,
    openingEquity,
    landTerms: "cash",
    lines: [
      {
        ...newSaleLine("Tower A"),
        landAreaSqft: 50_000,
        landCostPsf: 2_000, // ₹10 Cr of land, paid month 1
        devCostPsf: 0,
        units: 100,
        plotSqftPerUnit: 0,
        buaSqftPerUnit: 1_200,
        housePricePsf: 7_000, // ₹84 L a flat
        constructionPsf: 3_000, // ₹36 L to build one
        buildMode: "scheduled",
        buildStartMonth: 1,
        buildMonths: 30,
        salesStartMonth: 6,
        velocity: [velocity, velocity, velocity],
      } as SaleLine,
    ],
  };
}

test("an apartment tower is built whether or not it has sold", () => {
  // Built to order spends nothing ahead of a buyer; on a schedule the whole tower goes up on its own calendar.
  const slow = runScenario(apartmentPlan(1), 0);
  const tower = sale(slow);

  // ₹36 Cr of construction, all 100 flats, inside months 1-30 though only 67 have sold.
  closeTo(tower.constructionCost, 360_000_000);
  closeTo(tower.unitsSold, 67);
  // Cost of sales counts only what sold; the rest is stock, not expense.
  closeTo(tower.constructionMatched, 67 * 3_600_000);
  closeTo(tower.unsoldStock, 33 * 3_600_000);

  const toOrder = sale(
    runScenario(
      {
        ...apartmentPlan(1),
        lines: apartmentPlan(1).lines.map((l) => ({ ...l, buildMode: "on-sale" }) as SaleLine),
      },
      0,
    ),
  );
  assert.ok(
    toOrder.constructionCost < tower.constructionCost,
    "building to order spends less inside the horizon than building it all",
  );
  assert.equal(toOrder.unsoldStock, 0, "nothing is built without a buyer");
});

test("with no equity the interest starts at the land and compounds", () => {
  // Zero equity, everything borrowed including land: the revolver is drawn from month 1.
  const funded = runScenario(apartmentPlan(1, 500_000_000), 0);
  const unfunded = runScenario(apartmentPlan(1, 0), 0);

  assert.equal(unfunded.monthly.equity[0], 0, "no equity went in");
  assert.ok(unfunded.monthly.revolver[0] > 0, "borrowing starts in month 1");
  assert.ok(unfunded.monthly.interest[0] > 0, "and so does the interest");
  assert.ok(unfunded.interest > funded.interest, "a plan with equity behind it pays less interest");
  closeTo(funded.monthly.equity[0], 500_000_000);
  closeTo(sum(funded.monthly.equity), 500_000_000);

  // Interest is the only difference: same revenue and build, profit apart by exactly it.
  closeTo(unfunded.revenue, funded.revenue, 1);
  closeTo(unfunded.pbt, funded.pbt - (unfunded.interest - funded.interest), 1);
});

test("on a tower, selling faster is worth real money", () => {
  // The build is a sunk calendar, so each unsold month costs interest, visible in profit with no overhead change.
  const slow = runScenario(apartmentPlan(1), 0);
  const fast = runScenario(apartmentPlan(4), 0);

  assert.ok(fast.interest < slow.interest, "selling out sooner carries the debt for less time");
  assert.ok(fast.pbt > slow.pbt, "and that lands in the profit");
  assert.ok(sale(fast).unsoldStock < sale(slow).unsoldStock);
  assert.ok(fast.marginPct !== null && slow.marginPct !== null);
  assert.ok(fast.marginPct! > slow.marginPct!);
});

/** Local sum, so the test does not reach into the engine's private one. */
function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

test("selling faster never shows a worse margin", () => {
  // Regression: Base once read 23.3% against Moderate's 22.2% (its unbuilt cost fell outside the
  // horizon, its revenue did not). Reintroducing that asymmetry fails here.
  const plan = viharaPlan();
  const [base, moderate, high] = [0, 1, 2].map((s) => runScenario(plan, s as 0 | 1 | 2));

  for (const scenario of [base, moderate, high]) {
    assert.ok(scenario.marginPct !== null);
  }
  // Moderate and High land on the same margin within floating-point dust, hence a tolerance.
  const DUST = 1e-9;
  assert.ok(
    base.marginPct! <= moderate.marginPct! + DUST,
    `Base ${base.marginPct}% must not beat Moderate ${moderate.marginPct}%`,
  );
  assert.ok(
    moderate.marginPct! <= high.marginPct! + DUST,
    `Moderate ${moderate.marginPct}% must not beat High ${high.marginPct}%`,
  );
  assert.ok(moderate.marginPct! - base.marginPct! > 0.5);
});

test("a line's own margin does not move with velocity", () => {
  // Unit economics belong to the product, not the sales pace; only the plan's margin moves, as
  // fixed overheads spread over less revenue.
  const plan = viharaPlan();
  const rowHouses = [0, 1, 2].map((s) => sale(runScenario(plan, s as 0 | 1 | 2), 1));

  for (const line of rowHouses) assert.ok(line.marginPct !== null);
  closeTo(rowHouses[0].marginPct!, rowHouses[1].marginPct!, 1e-9);
  closeTo(rowHouses[1].marginPct!, rowHouses[2].marginPct!, 1e-9);

  closeTo(rowHouses[0].unitsUnsold, 6.2, 0.001);
  assert.equal(rowHouses[2].unitsUnsold, 0);
});

test("Vihara, High: selling out faster leaves more cash in the trough", () => {
  const result = runScenario(viharaPlan(), 2);

  // Summary!D15:D17: High and Moderate reach the same PBT (only timing differs), but faster
  // collections keep the balance from dipping as low.
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
  closeTo(base.active.pbt, 245_161_257.14);
});

test("a collection schedule always adds up to the whole price", () => {
  // A schedule summing to 0.98 is a silent 2% revenue error, so check awkward shapes.
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
  assert.equal(sale(result).unitsSold, 10);
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

  // Line B releases the month line A crosses 7 of 10: the trigger reads the cumulative including this month.
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
  assert.equal(sale(result).unitsSold, 5);
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
  closeTo(unfunded.pbt, funded.pbt - unfunded.interest);
});

test("pooling borrows less than the lines would separately", () => {
  // A line in surplus funds one in deficit, so consolidated interest is below the standalone sum.
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
  assert.equal(sale(result).marginPct, null);
  assert.ok(Number.isFinite(result.pbt));
  assert.ok(Number.isFinite(result.matchedTotalCost));
});

test("velocities out of order are reported, not rewritten", () => {
  // Columns are labelled Base, Moderate, High in fixed order, so a slowest-"High" plan reads
  // backwards: flag it, don't correct it. Enough units that the horizon binds.
  const backwards = planWith([
    saleLine({ units: 500, plotSqftPerUnit: 1000, landPricePsf: 1000, velocity: [2, 1.5, 1] }),
  ]);
  assert.equal(velocityOutOfOrder(backwards), true);
  assert.equal(
    velocityOutOfOrder(planWith([saleLine({ units: 10, velocity: [1, 1.5, 2] })])),
    false,
  );
  assert.equal(velocityOutOfOrder(planWith([saleLine({ units: 10, velocity: [1, 1, 1] })])), false);
  // And it still runs exactly as typed, unclamped.
  assert.ok(runScenario(backwards, 2).revenue < runScenario(backwards, 0).revenue);
});

test("IRR finds a known rate", () => {
  // −100 now, 110 in one period: 10%.
  const rate = irr([-100, 110]);
  assert.ok(rate !== null);
  closeTo(rate, 0.1, 1e-6);
});

test("IRR refuses a flow that opens with money coming in", () => {
  // The guard the workbook lacks: its Venture IRR reports 1150% off a flow that starts positive.
  assert.equal(irr([100, 50, -20]), null);
  assert.equal(irr([0, 0, 100, -50]), null);
});

test("IRR refuses a flow that never turns around", () => {
  assert.equal(irr([-100, -50, -20]), null);
  assert.equal(irr([0, 0, 0]), null);
});

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

test("the engine survives raw keystrokes the parser hasn't seen yet", () => {
  // The editor recalculates before parsePlanInputs clamps, so the engine gets a literal 0 for
  // Efficiency or Exit cap rate and must not emit Infinity.
  const line = { ...newHoldLine(), units: 10, carpetSqftPerUnit: 1000 };
  const plan: PlanInputs = {
    ...defaultPlanInputs(),
    lines: [{ ...line, efficiencyPct: 0, exitCapRatePct: 0 }],
  };

  const result = runScenario(plan, 1);
  const held = result.lines[0];
  assert.ok(held.kind === "hold");
  assert.ok(Number.isFinite(held.buaTotal), "built-up area must not be Infinity");
  assert.ok(Number.isFinite(held.capex));
  assert.ok(Number.isFinite(held.terminalValue), "terminal value must not be Infinity");
  assert.ok(Number.isFinite(result.pbt));
  assert.ok(Number.isFinite(result.pbtWithHeldValue));
});

test("Vihara senior living: the capex build-up matches the workbook", () => {
  const result = runScenario(viharaSeniorLivingPlan(), 1);
  const line = result.lines[0];
  assert.ok(line.kind === "hold");

  // SL_Capex!B7, B9, B11: built-up is twice carpet at 50% efficiency, and is what construction costs.
  closeTo(line.carpetTotal, 27_200, 1e-6);
  closeTo(line.buaTotal, 54_400, 1e-6);
  closeTo(line.sbaTotal, 54_400, 1e-6);

  // SL_Capex!B33:B35
  closeTo(line.capex, 290_982_720);
  assert.ok(line.capexPerUnit !== null);
  closeTo(line.capexPerUnit, 8_558_315.29, 1);
  assert.ok(line.capexPerBuaSqft !== null);
  closeTo(line.capexPerBuaSqft, 5_348.95, 0.01);
});

test("Vihara senior living: stabilised NOI and the terminal value match", () => {
  const result = runScenario(viharaSeniorLivingPlan(), 1);
  const line = result.lines[0];
  assert.ok(line.kind === "hold");

  // SL_Operations!B36, B37, B39
  closeTo(line.stabilisedNoi, 27_549_600);
  closeTo(line.terminalValue, 306_106_666.67);
  assert.ok(line.yieldOnCostPct !== null);
  closeTo(line.yieldOnCostPct, 9.4677787052097118, 0.0001);
});

test("Vihara senior living: HOLD beats SELL, and by how much", () => {
  const result = runScenario(viharaSeniorLivingPlan(), 1);
  const line = result.lines[0];
  assert.ok(line.kind === "hold");

  // SL_Hold!B28:B34: twenty years discounted at 11% against selling the super built-up area at 8,000/sqft on day one.
  closeTo(line.holdValue, 543_370_321.02);
  closeTo(line.sellValue, 430_848_000);
  assert.equal(line.verdict, "hold");
  assert.ok(line.holdIrrPct !== null);
  closeTo(line.holdIrrPct, 17.919765676767963, 0.0001);
  assert.ok(line.equityMultiple !== null);
  closeTo(line.equityMultiple, 8.0869827254307651, 0.0001);
});

test("Vihara senior living: the monthly operations inside the horizon match", () => {
  const result = runScenario(viharaSeniorLivingPlan(), 1);
  const line = result.lines[0];
  assert.ok(line.kind === "hold");

  // Engine_Moderate!B35, B36, B32: ready in month 30, filling three units a month to 90% of 34.
  closeTo(line.entryFees, 30_600_000);
  closeTo(line.recurringCharges, 158_598_000);
  closeTo(line.operatingOpex, 72_991_600);
});

test("a held asset is judged on yield and IRR, not on a margin", () => {
  const result = runScenario(viharaSeniorLivingPlan(), 1);
  const line = result.lines[0];
  assert.ok(line.kind === "hold");

  // No marginPct on a HOLD line: capex against ramping rent gives a large negative. Judge it by these two.
  assert.ok(!("marginPct" in line));
  assert.ok(line.yieldOnCostPct !== null);
  assert.ok(line.holdIrrPct !== null);

  // Capex is charged in full, not just inside the horizon, because terminalValue prices the asset as finished (rule 2).
  closeTo(line.matchedCost, line.landCost + line.capex + line.operatingOpex, 1);
  // Vihara's asset finishes by month 29 of 72, so matched and cash cost agree.
  closeTo(line.matchedCost, line.directCost, 1);

  // Push the build past the horizon and they differ by the capex that no longer fits (12 months from month 66: five outside).
  const plan = viharaSeniorLivingPlan();
  const input = plan.lines[0];
  assert.ok(input.kind === "hold");
  const late = runScenario({ ...plan, lines: [{ ...input, buildStartMonth: 66 }] }, 1);
  const lateLine = late.lines[0];
  assert.ok(lateLine.kind === "hold");
  assert.ok(lateLine.matchedCost > lateLine.directCost);
  closeTo(lateLine.matchedCost - lateLine.directCost, lateLine.capex - inHorizonCapex(lateLine), 1);
});

/** Capex the cash series actually paid: everything inside the horizon. */
function inHorizonCapex(line: { directCost: number; landCost: number; operatingOpex: number }) {
  return line.directCost - line.landCost - line.operatingOpex;
}

test("an asset that exactly breaks even reports 0%, not a dash", () => {
  // Guards the old `|| null` bug that turned a real zero into a dash. Rule 4 cuts both ways.
  const plan = viharaSeniorLivingPlan();
  const line = plan.lines[0];
  assert.ok(line.kind === "hold");

  // A ₹1 asset earning nothing: the only flow with a rate of exactly zero returns what went in.
  const zeroed = runScenario(
    {
      ...plan,
      lines: [
        {
          ...line,
          holdYears: 1,
          fillRatePerMonth: 0,
          occupancyPct: 0,
          entryFeePerUnit: 0,
          chargePerUnitMonth: 0,
          varOpexPerUnitMonth: 0,
          // Make the exit alone return exactly the capex.
          fixedOpexMonth: 0,
          exitCapRatePct: 100,
        },
      ],
    },
    1,
  );
  const held = zeroed.lines[0];
  assert.ok(held.kind === "hold");
  // NOI is zero, so no bracketed root: the null comes from the guard in irr(), not a later `|| null`.
  assert.equal(held.holdIrrPct, null);

  // And the direct case: irr() itself returns a genuine zero.
  const flat = irr([-100, 100]);
  assert.ok(flat !== null, "a flow that returns exactly what went in has a rate, and it is 0");
  closeTo(flat, 0, 1e-6);
});

test("a sell verdict flips when the sale price is high enough", () => {
  const plan = viharaSeniorLivingPlan();
  const line = plan.lines[0];
  assert.ok(line.kind === "hold");
  // At ₹12,000/sqft the sale beats a twenty-year hold, and the tool should say so.
  const selling = runScenario({ ...plan, lines: [{ ...line, sellPricePsf: 12_000 }] }, 1);
  const result = selling.lines[0];
  assert.ok(result.kind === "hold");
  assert.equal(result.verdict, "sell");
  assert.ok(result.sellValue > result.holdValue);
});

test("an empty hold line doesn't divide by zero on any of its rates", () => {
  const plan = { ...defaultPlanInputs(), lines: [newHoldLine("Nothing yet")] };
  const result = runScenario(plan, 1);
  const line = result.lines[0];
  assert.ok(line.kind === "hold");
  assert.equal(line.capex, 0);
  assert.equal(line.buaTotal, 0);
  assert.equal(line.terminalValue, 0);
  assert.equal(line.capexPerUnit, null);
  assert.equal(line.holdIrrPct, null);
  assert.equal(line.equityMultiple, null);
  assert.ok(Number.isFinite(result.pbt));
});

test("a mixed plan collates both kinds without double-counting", () => {
  const consolidated = runScenario(viharaConsolidatedPlan(), 1);
  const saleOnly = runScenario(viharaPlan(), 1);
  const holdOnly = runScenario(viharaSeniorLivingPlan(), 1);

  // Engine_Moderate!B46: residential bookings plus senior-living entry fees and charges.
  closeTo(consolidated.revenue, 1_387_423_000);
  closeTo(consolidated.revenue, saleOnly.revenue + holdOnly.revenue);

  // Senior-living capex joins construction; its running costs get their own line.
  const held = holdOnly.lines[0];
  assert.ok(held.kind === "hold");
  closeTo(consolidated.constructionCost, saleOnly.constructionCost + held.capex);
  closeTo(consolidated.operatingCost, 72_991_600);

  // Terminal value stays out of PBT: an asset still owned, not money moved.
  closeTo(consolidated.terminalValue, 306_106_666.67);
  closeTo(consolidated.pbtWithHeldValue, consolidated.pbt + consolidated.terminalValue);
});

test("selling cost is charged on sales, never on a held asset's income", () => {
  // A resident's charge attracts no brokerage: a hold line adds nothing to selling cost.
  const saleOnly = runScenario(viharaPlan(), 1);
  const consolidated = runScenario(viharaConsolidatedPlan(), 1);
  closeTo(consolidated.overheadsVariable, saleOnly.overheadsVariable, 1e-6);
  closeTo(consolidated.overheadsVariable, 47_929_000);
});

test("the sensitivity grid's centre cell is the plan itself", () => {
  // The grid is the same engine, so 0% / 0% is the headline figure exactly.
  const plan = viharaPlan();
  const grid = sensitivityGrid(plan);
  const centre = grid[2][2];
  assert.equal(centre.pricePct, 0);
  assert.equal(centre.buildCostPct, 0);
  closeTo(centre.pbt, runScenario(plan, plan.activeScenario).pbt, 1e-6);
  closeTo(centre.pbt, 266_596_000);
});

test("prices up lifts profit, build costs up cuts it", () => {
  const grid = sensitivityGrid(viharaPlan());
  const centre = grid[2][2].pbt;
  // Same row (build cost unchanged), price 10% higher.
  assert.ok(grid[2][4].pbt > centre);
  assert.ok(grid[2][0].pbt < centre);
  // Same column (price unchanged), build cost 10% higher.
  assert.ok(grid[4][2].pbt < centre);
  assert.ok(grid[0][2].pbt > centre);
});

test("swinging prices moves every line, not just the first", () => {
  const dearer = adjustPlan(viharaPlan(), { pricePct: 10, buildCostPct: 0 });
  const base = viharaPlan();
  for (let i = 0; i < base.lines.length; i += 1) {
    const before = base.lines[i];
    const after = dearer.lines[i];
    assert.ok(before.kind === "sale" && after.kind === "sale");
    closeTo(after.housePricePsf, before.housePricePsf * 1.1, 1e-9);
    closeTo(after.landPricePsf, before.landPricePsf * 1.1, 1e-9);
    // Build cost untouched on this axis.
    closeTo(after.constructionPsf, before.constructionPsf, 1e-9);
  }
});

test("a held line's charges swing with prices and its capex with build cost", () => {
  const plan = viharaSeniorLivingPlan();
  const adjusted = adjustPlan(plan, { pricePct: 10, buildCostPct: 20 });
  const before = plan.lines[0];
  const after = adjusted.lines[0];
  assert.ok(before.kind === "hold" && after.kind === "hold");
  closeTo(after.chargePerUnitMonth, before.chargePerUnitMonth * 1.1, 1e-9);
  closeTo(after.sellPricePsf, before.sellPricePsf * 1.1, 1e-9);
  closeTo(after.buaCostPsf, before.buaCostPsf * 1.2, 1e-9);
});
