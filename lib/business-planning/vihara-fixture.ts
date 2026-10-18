/**
 * The founder's Vihara workbook as engine inputs: 42 plotted villas and 35 row houses on JV land
 * settled at a 30% premium in year four, company overheads and a biodiversity park.
 * model.test.ts asserts every Block 1 Summary figure for Base and Moderate against it.
 *
 * Two deliberate departures from a literal transcription:
 * 1. Land is per line. The workbook's one ₹13.2 Cr site cost is split across the two lines by
 *    plot area (₹405.5299... per sqft over 3,25,500 sqft); the total is identical to the rupee.
 * 2. No senior living: Block 1 is "excl. Senior Living". The biodiversity park is included.
 */

import type { HoldLine, PlanInputs, SaleLine } from "./inputs";

/** 42 × 6,500 + 35 × 1,500 — the plotted area the site's ₹13.2 Cr buys. */
const TOTAL_PLOT_SQFT = 42 * 6500 + 35 * 1500;
const SITE_LAND_COST = 132_000_000;
const LAND_PSF = SITE_LAND_COST / TOTAL_PLOT_SQFT;

const plottedVillas: SaleLine = {
  id: "fixture-plotted",
  kind: "sale",
  name: "Plotted villas",
  landAreaSqft: 42 * 6500,
  landCostPsf: LAND_PSF,
  devCostPsf: 400,
  units: 42,
  plotSqftPerUnit: 6500,
  buaSqftPerUnit: 2400,
  landPricePsf: 1150,
  housePricePsf: 5500,
  constructionPsf: 3000,
  // Built to order: nothing is spent ahead of a buyer.
  buildMode: "on-sale" as const,
  buildStartMonth: 1,
  buildMonths: 22,
  salesStartMonth: 1,
  velocity: [0.8, 1.3, 2],
  launchTriggerPct: null,
  bookingPct: null,
  instalments: null,
};

const rowHouses: SaleLine = {
  id: "fixture-row",
  kind: "sale",
  name: "Row houses",
  landAreaSqft: 35 * 1500,
  landCostPsf: LAND_PSF,
  devCostPsf: 400,
  units: 35,
  plotSqftPerUnit: 1500,
  buaSqftPerUnit: 1400,
  landPricePsf: 1150,
  housePricePsf: 5500,
  constructionPsf: 3000,
  // Built to order: nothing is spent ahead of a buyer.
  buildMode: "on-sale" as const,
  buildStartMonth: 1,
  buildMonths: 18,
  salesStartMonth: 1,
  velocity: [0.8, 1.3, 2],
  // Staggered launch: row houses wait until 70% of the plotted villas have gone.
  launchTriggerPct: 70,
  bookingPct: null,
  instalments: null,
};

/**
 * The workbook's Block 2 as a HOLD line: 34 serviced two-bed units, built months 19–30, filling
 * three a month, held twenty years. Per unit, not per pax (the beds cancel out of every figure).
 * Land is development only (₹200/sqft over 15,000 sqft): acquisition already sits on the
 * residential lines and would double-count ₹13.2 Cr.
 */
const seniorLiving: HoldLine = {
  id: "fixture-senior-living",
  kind: "hold",
  name: "Senior living",

  landAreaSqft: 15_000,
  landCostPsf: 0,
  devCostPsf: 200,

  units: 34,
  carpetSqftPerUnit: 800,
  efficiencyPct: 50,
  loadingPct: 100,
  basementSqft: 10_000,

  buaCostPsf: 4500,
  basementCostPsf: 1700,
  amenitiesLumpsum: 15_000_000,
  mepPct: 2,
  professionalPct: 1,
  contingencyPct: 1,

  buildStartMonth: 18,
  buildMonths: 12,
  fillRatePerMonth: 3,
  occupancyPct: 90,

  chargePerUnitMonth: 135_000,
  entryFeePerUnit: 1_000_000,
  varOpexPerUnitMonth: 42_000,
  fixedOpexMonth: 550_000,

  holdYears: 20,
  discountRatePct: 11,
  exitCapRatePct: 9,
  chargeEscalationPct: 6,
  opexEscalationPct: 5,
  entryEscalationPct: 6,
  turnoverPct: 12,

  sellPricePsf: 8000,
  sellingCostPct: 1,
};

export function viharaSeniorLivingPlan(): PlanInputs {
  return { ...viharaPlan(), lines: [seniorLiving] };
}

export function viharaConsolidatedPlan(): PlanInputs {
  const plan = viharaPlan();
  return { ...plan, lines: [...plan.lines, seniorLiving] };
}

export function viharaPlan(): PlanInputs {
  return {
    horizonMonths: 72,
    financingRatePct: 15,
    // Capital tab: 50% of the ₹13.02 Cr land-development cost as project equity; land is JV-deferred, so that is all the equity.
    openingEquity: 65_100_000,
    landTerms: "jv",
    landPremiumPct: 30,
    landSettlementMonth: 48,
    devMonths: 24,
    bookingPct: 30,
    instalments: 10,

    overheads: [
      {
        id: "oh-1",
        name: "Marketing retainer",
        monthly: 150_000,
        startMonth: 1,
        endMonth: 48,
        endsWithSales: false,
      },
      {
        id: "oh-2",
        name: "Brand / creative",
        monthly: 50_000,
        startMonth: 1,
        endMonth: 48,
        endsWithSales: false,
      },
      {
        id: "oh-3",
        name: "Admin & ops staff",
        monthly: 200_000,
        startMonth: 1,
        endMonth: 60,
        endsWithSales: false,
      },
      {
        id: "oh-4",
        name: "CRM software",
        monthly: 25_000,
        startMonth: 1,
        endMonth: 60,
        endsWithSales: false,
      },
      {
        id: "oh-5",
        name: "Sales team (salaried)",
        monthly: 300_000,
        startMonth: 1,
        endMonth: 48,
        endsWithSales: false,
      },
      {
        id: "oh-6",
        name: "Site office overhead",
        monthly: 150_000,
        startMonth: 1,
        endMonth: 60,
        endsWithSales: false,
      },
      {
        id: "oh-7",
        name: "Legal retainer",
        monthly: 75_000,
        startMonth: 1,
        endMonth: 60,
        endsWithSales: false,
      },
      {
        id: "oh-8",
        name: "Accounts & audit",
        monthly: 50_000,
        startMonth: 1,
        endMonth: 60,
        endsWithSales: false,
      },
      {
        id: "oh-9",
        name: "Management allocation",
        monthly: 250_000,
        startMonth: 1,
        endMonth: 60,
        endsWithSales: false,
      },
    ],

    variableCosts: [
      { id: "vc-1", name: "Brokerage / channel", pct: 2 },
      { id: "vc-2", name: "Performance ads", pct: 1.5 },
      { id: "vc-3", name: "Referral / incentives", pct: 0.5 },
    ],

    oneTimeCosts: [
      { id: "ot-1", name: "Branding & website", amount: 1_000_000, month: 1 },
      { id: "ot-2", name: "Show / model unit", amount: 3_000_000, month: 2 },
      { id: "ot-3", name: "Launch event", amount: 1_500_000, month: 3 },
    ],

    commonInfra: [
      {
        id: "ci-1",
        name: "Biodiversity park",
        capex: 40_000_000,
        capexStartMonth: 15,
        capexMonths: 12,
        annualOpex: 3_000_000,
        opexStartMonth: 1,
        opexEndMonth: null,
      },
    ],

    lines: [plottedVillas, rowHouses],
    activeScenario: 1,
  };
}
