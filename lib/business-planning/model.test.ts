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
  //
  // Moderate sells out inside the horizon, so matched cost and cash cost
  // are the same number and these figures are untouched by rule 2. That
  // is the point of asserting it here: the matched-cost change moves ONLY
  // the scenarios that failed to finish.
  closeTo(result.pbt, 266_596_000);
  assert.ok(result.marginPct !== null);
  closeTo(result.marginPct, 22.249243672932881, 0.001);
  closeTo(result.matchedTotalCost, result.totalCost, 1);
  closeTo(result.costOutsideHorizon, 0, 1);

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
  closeTo(sale(result).unitsSold, 42, 1e-9);

  // Summary!B7 — the row houses do NOT. They wait for the villas to
  // cross 70% (month 37 at this pace) and then have 36 months left,
  // which is 28.8 units, not 35. This is the horizon doing its job.
  closeTo(result.lines[1].revenue, 271_440_000);
  closeTo(sale(result, 1).unitsSold, 28.8, 0.001);
  closeTo(sale(result, 1).unitsUnsold, 6.2, 0.001);

  closeTo(result.revenue, 1_139_790_000);

  // Summary!B11 — ₹39.43 Cr of CASH, not the ₹42.34 Cr those units cost
  // to build, because the last homes sold have build cycles running past
  // month 72. Cash outside the horizon is genuinely outside the plan.
  closeTo(result.constructionCost, 394_276_363.64);

  // Summary!B12:B13
  closeTo(result.overheadsFixed + result.overheadsVariable + result.overheadsOneTime, 120_091_600);
  closeTo(result.commonInfraCapex + result.commonInfraOpex, 58_000_000);

  // Rule 2, and the whole reason this scenario is interesting: the ₹42.34
  // Cr IS what the homes that sold cost to build, and the revenue of
  // every one of them was counted in full. Both numbers are true and they
  // answer different questions — cash above, cost of what sold here.
  closeTo(result.constructionMatched, 423_360_000);

  // Land and infra point the other way. 6.2 row houses never sold, so
  // their share of the parcel earned nothing and is not charged against
  // the revenue of the homes that did.
  assert.ok(result.landMatched < result.landCost);
  assert.ok(result.developmentMatched < result.developmentCost);
  closeTo(result.landMatched, 166_697_142.86);
  closeTo(result.developmentMatched, 126_480_000);

  // The gap the Summary tab shows as its own row, so the cost column
  // visibly adds up to PBT: build put back, less land and infra taken out.
  closeTo(result.costOutsideHorizon, result.matchedTotalCost - result.totalCost, 1);
  closeTo(result.costOutsideHorizon, 20_460_779.22);

  // Summary!B15:B17, B55 — PBT and margin DEPART from the workbook here,
  // deliberately. The sheet reports ₹26.56 Cr at 23.3%, which is a better
  // margin than Moderate's 22.2% off a scenario that left 6.2 homes
  // unsold. That reads backwards because the sheet counts all of the
  // revenue and only the build that finished. Struck against the cost of
  // what sold, Base earns less than Moderate — which is what slower
  // selling actually does.
  closeTo(result.pbt, 245_161_257.14);
  assert.ok(result.marginPct !== null);
  closeTo(result.marginPct, 21.50933567963023, 0.001);

  // Cash is untouched: same trough, same money multiple as the workbook.
  closeTo(result.cashTrough, 36_030_266.67);
  assert.ok(result.moneyMultiple !== null);
  closeTo(result.moneyMultiple, 2.0797565863242262, 0.0001);
});

test("money sold but not yet banked is reported, not lost", () => {
  // The mirror of costOutsideHorizon, on the income side. A home sold
  // near the end books its whole price that month but collects it over
  // the following build, and spreadForward drops whatever lands past the
  // horizon. That never touches PBT — struck on bookings — but it makes
  // the CASH look worse, and `peakFunding` is read as "money to raise".
  //
  // At half a unit a month Vihara appears to need ₹9.7 Cr of funding
  // while ₹11.2 Cr of collections sit just past month 72. Reporting the
  // receivable is what lets that be read correctly.
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

  // A plan that sells out early collects everything, and the figure is
  // zero rather than a small rounding ghost.
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
  // The finding behind the field. Vihara's overheads all run to a fixed
  // calendar month, so selling out in month 16 pays exactly as much
  // marketing retainer as selling out in month 64 — and with equity
  // covering the whole project there is no interest to save either. PBT
  // came out IDENTICAL at 1/mo and 4/mo, which is what made the
  // scenarios look broken.
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

  // Ending with sales: the fast plan stops paying for the months it no
  // longer needs, and the profit finally responds.
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

  // It never charges MORE than the calendar schedule would — the item's
  // own end month is still a ceiling.
  assert.ok(fastTracking.overheadsFixed <= fastFixed.overheadsFixed);
  assert.ok(slowTracking.overheadsFixed <= slowFixed.overheadsFixed);
});

test("an overhead that ends with sales survives a plan with no sales", () => {
  // Nothing has sold, so there is no earlier month to end on. Falling
  // back to zero would silently make an empty plan look profitable.
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

test("selling faster never shows a worse margin", () => {
  // The regression. Before matched cost, Vihara read Base 23.3% against
  // Moderate 22.2%: the scenario that left 6.2 homes unsold and ₹2.9 Cr
  // of building unfinished showed the BEST margin, because its unbuilt
  // cost fell outside the horizon and its revenue did not. Any future
  // change that reintroduces that asymmetry fails here.
  const plan = viharaPlan();
  const [base, moderate, high] = [0, 1, 2].map((s) => runScenario(plan, s as 0 | 1 | 2));

  for (const scenario of [base, moderate, high]) {
    assert.ok(scenario.marginPct !== null);
  }
  // Moderate and High both sell out, so they land on the same margin to
  // within floating-point dust — hence a tolerance rather than a bare
  // `<=`, which a difference of 1e-14 in the last place would fail.
  const DUST = 1e-9;
  assert.ok(
    base.marginPct! <= moderate.marginPct! + DUST,
    `Base ${base.marginPct}% must not beat Moderate ${moderate.marginPct}%`,
  );
  assert.ok(
    moderate.marginPct! <= high.marginPct! + DUST,
    `Moderate ${moderate.marginPct}% must not beat High ${high.marginPct}%`,
  );
  // And the gap is real, not dust: Base genuinely earns less.
  assert.ok(moderate.marginPct! - base.marginPct! > 0.5);
});

test("a line's own margin does not move with velocity", () => {
  // Unit economics are a property of the product, not of how fast it
  // sells: the same home costs the same and fetches the same whenever it
  // goes. Only the PLAN's margin moves, because fixed overheads spread
  // over less revenue. This is what tells the founder that a scenario is
  // a sales question and not a pricing one.
  const plan = viharaPlan();
  const rowHouses = [0, 1, 2].map((s) => sale(runScenario(plan, s as 0 | 1 | 2), 1));

  for (const line of rowHouses) assert.ok(line.marginPct !== null);
  closeTo(rowHouses[0].marginPct!, rowHouses[1].marginPct!, 1e-9);
  closeTo(rowHouses[1].marginPct!, rowHouses[2].marginPct!, 1e-9);

  // And the unsold ones really are absent from both sides of it.
  closeTo(rowHouses[0].unitsUnsold, 6.2, 0.001);
  assert.equal(rowHouses[2].unitsUnsold, 0);
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
  closeTo(base.active.pbt, 245_161_257.14);
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
  assert.equal(sale(result).marginPct, null);
  assert.ok(Number.isFinite(result.pbt));
  assert.ok(Number.isFinite(result.matchedTotalCost));
});

test("velocities out of order are reported, not rewritten", () => {
  // The columns are labelled Base, Moderate, High in fixed order on every
  // screen, so a plan whose "High" is its slowest reads backwards. Worth
  // saying out loud; not worth silently correcting what someone typed.
  // Enough units that the horizon binds, so the mislabelling actually
  // shows up in the answer rather than every scenario selling out anyway.
  const backwards = planWith([
    saleLine({ units: 500, plotSqftPerUnit: 1000, landPricePsf: 1000, velocity: [2, 1.5, 1] }),
  ]);
  assert.equal(velocityOutOfOrder(backwards), true);
  assert.equal(
    velocityOutOfOrder(planWith([saleLine({ units: 10, velocity: [1, 1.5, 2] })])),
    false,
  );
  // Flat is fine — plenty of plans have one honest pace.
  assert.equal(velocityOutOfOrder(planWith([saleLine({ units: 10, velocity: [1, 1, 1] })])), false);
  // And the plan still runs exactly as typed, unclamped: the column
  // labelled "High" really does sell the slowest, which is the whole
  // reason it is worth saying so on screen.
  assert.ok(runScenario(backwards, 2).revenue < runScenario(backwards, 0).revenue);
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

test("the engine survives raw keystrokes the parser hasn't seen yet", () => {
  // The editor recalculates on every keystroke, BEFORE anything is saved
  // and therefore before parsePlanInputs clamps anything. So the engine
  // is handed the literal 0 the instant it is typed into Efficiency or
  // Exit cap rate. Dividing by either used to produce Infinity through
  // every figure on the screen until the next save round trip.
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

// ---------------------------------------------------------------------
// HOLD lines — the workbook's Block 2
// ---------------------------------------------------------------------

test("Vihara senior living: the capex build-up matches the workbook", () => {
  const result = runScenario(viharaSeniorLivingPlan(), 1);
  const line = result.lines[0];
  assert.ok(line.kind === "hold");

  // SL_Capex!B7, B9, B11 — three areas doing three jobs. Built-up is
  // twice carpet at 50% efficiency, and it is what construction costs.
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

  // SL_Hold!B28:B34 — twenty years of escalating charges and entry fees,
  // discounted at 11%, against selling the super built-up area at
  // 8,000/sqft on day one.
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

  // Engine_Moderate!B35, B36, B32 — ready in month 30, filling three
  // units a month to 90% of 34, so 43 months of charges on a ramp.
  closeTo(line.entryFees, 30_600_000);
  closeTo(line.recurringCharges, 158_598_000);
  closeTo(line.operatingOpex, 72_991_600);
});

test("a held asset is judged on yield and IRR, not on a margin", () => {
  const result = runScenario(viharaSeniorLivingPlan(), 1);
  const line = result.lines[0];
  assert.ok(line.kind === "hold");

  // There is deliberately no marginPct on a HOLD line. Expensing ₹29 Cr
  // of capex against six years of ramping rent produces a large negative
  // percentage, and it used to sit in the same "Margin" column as a sale
  // line's +22% — two different questions under one heading. What a held
  // asset is actually judged on is these two.
  assert.ok(!("marginPct" in line));
  assert.ok(line.yieldOnCostPct !== null);
  assert.ok(line.holdIrrPct !== null);

  // Its capex is charged in full, not just the part that fell inside the
  // horizon, because terminalValue prices this asset as finished and
  // filled. Part-paying for a completed building is the same rule-2 error
  // the sale lines had.
  closeTo(line.matchedCost, line.landCost + line.capex + line.operatingOpex, 1);
  // Vihara's asset is built by month 29 of 72, so here the two agree —
  // matched cost only ever differs when something falls outside.
  closeTo(line.matchedCost, line.directCost, 1);

  // Push the build past the horizon and they part company, by exactly the
  // capex that no longer fits. A 12-month build starting at month 66 has
  // five of those months falling outside a 72-month plan.
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
  // `(irr(...) ?? NaN) * 100 || null` turned a real zero into null,
  // because `0 || null` is null — so a break-even asset showed the same
  // dash as one that cannot be computed at all. Rule 4 cuts both ways.
  const plan = viharaSeniorLivingPlan();
  const line = plan.lines[0];
  assert.ok(line.kind === "hold");

  // A ₹1 asset earning nothing and worth nothing: the only flow whose
  // rate is exactly zero is one that returns precisely what went in.
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
          // A single year of NOI equal to −capex/… is fiddly to arrange;
          // instead make the exit alone return exactly the capex.
          fixedOpexMonth: 0,
          exitCapRatePct: 100,
        },
      ],
    },
    1,
  );
  const held = zeroed.lines[0];
  assert.ok(held.kind === "hold");
  // NOI is zero, so the exit is zero and nothing comes back: no bracketed
  // root, honest null. The point being asserted is that the null comes
  // from the guard in irr(), not from `0 || null` further down.
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
  // ₹54.4 Cr of saleable area: at ₹12,000/sqft the sale beats a
  // twenty-year hold, and the tool should say so rather than always
  // preferring the asset.
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

// ---------------------------------------------------------------------
// A mixed plan — the workbook's Block 3
// ---------------------------------------------------------------------

test("a mixed plan collates both kinds without double-counting", () => {
  const consolidated = runScenario(viharaConsolidatedPlan(), 1);
  const saleOnly = runScenario(viharaPlan(), 1);
  const holdOnly = runScenario(viharaSeniorLivingPlan(), 1);

  // Engine_Moderate!B46 — residential bookings plus senior-living entry
  // fees and charges.
  closeTo(consolidated.revenue, 1_387_423_000);
  closeTo(consolidated.revenue, saleOnly.revenue + holdOnly.revenue);

  // The senior-living capex joins construction; its running costs get
  // their own line rather than being buried in it.
  const held = holdOnly.lines[0];
  assert.ok(held.kind === "hold");
  closeTo(consolidated.constructionCost, saleOnly.constructionCost + held.capex);
  closeTo(consolidated.operatingCost, 72_991_600);

  // Terminal value is deliberately NOT in PBT: it is an asset still
  // owned, not money that has moved.
  closeTo(consolidated.terminalValue, 306_106_666.67);
  closeTo(consolidated.pbtWithHeldValue, consolidated.pbt + consolidated.terminalValue);
});

test("selling cost is charged on sales, never on a held asset's income", () => {
  // A resident's monthly charge does not attract brokerage. Adding a
  // hold line must not increase the selling cost by a rupee.
  const saleOnly = runScenario(viharaPlan(), 1);
  const consolidated = runScenario(viharaConsolidatedPlan(), 1);
  closeTo(consolidated.overheadsVariable, saleOnly.overheadsVariable, 1e-6);
  closeTo(consolidated.overheadsVariable, 47_929_000);
});

// ---------------------------------------------------------------------
// Sensitivity
// ---------------------------------------------------------------------

test("the sensitivity grid's centre cell is the plan itself", () => {
  // The grid is the same engine called again, so 0% / 0% must be the
  // headline figure exactly. A separate sensitivity formula is how a
  // spreadsheet's stress test drifts from its own summary.
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
