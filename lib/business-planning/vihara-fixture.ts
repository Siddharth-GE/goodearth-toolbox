/**
 * The founder's own workbook, as inputs to this engine.
 *
 * `Vihara_BusinessPlan_JV.xlsx`, handed over 2026-08-10: an eco-village
 * with 42 plotted villas and 35 row houses on JV land settled at a 30%
 * premium in year four, company overheads, and a biodiversity park.
 *
 * This exists so the engine can be checked against numbers that were
 * arrived at independently of it. Every figure the workbook's Summary
 * sheet reports for Block 1 — revenue, each cost line, PBT, margin, the
 * cash trough, the money multiple — is asserted in model.test.ts, for
 * both Base and Moderate. If the engine matches a thirteen-sheet model
 * built by hand, it is right; if it drifts, a test fails rather than a
 * plan quietly reporting the wrong profit.
 *
 * TWO PLACES THIS IS NOT A LITERAL TRANSCRIPTION, both deliberate:
 *
 *   1. LAND IS PER LINE HERE. The workbook holds one site-level land
 *      cost of ₹13.2 Cr; this tool puts land area and rate on each line,
 *      because the founder asked for lines that stand alone. So the
 *      ₹13.2 Cr is split across the two lines in proportion to their
 *      plot area, at ₹405.5299... per sqft over 3,25,500 sqft. The total
 *      is identical to the rupee, which is what the assertions check.
 *
 *   2. NO SENIOR LIVING. The workbook's Block 1 is explicitly "excl.
 *      Senior Living", which is exactly the scope of a SALE-only plan.
 *      The biodiversity park IS included, as Block 1 includes it.
 */

import type { PlanInputs, SaleLine } from "./inputs";

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
  buildMonths: 18,
  salesStartMonth: 1,
  velocity: [0.8, 1.3, 2],
  // The staggered launch: row houses stay at zero until 70% of the
  // plotted villas have gone.
  launchTriggerPct: 70,
  bookingPct: null,
  instalments: null,
};

export function viharaPlan(): PlanInputs {
  return {
    horizonMonths: 72,
    financingRatePct: 15,
    // Capital tab: 50% of the ₹13.02 Cr land-development cost, raised as
    // project equity. Land is JV-deferred, so equity is that and nothing
    // more.
    openingEquity: 65_100_000,
    landTerms: "jv",
    landPremiumPct: 30,
    landSettlementMonth: 48,
    devMonths: 24,
    bookingPct: 30,
    instalments: 10,

    overheads: [
      { id: "oh-1", name: "Marketing retainer", monthly: 150_000, startMonth: 1, endMonth: 48 },
      { id: "oh-2", name: "Brand / creative", monthly: 50_000, startMonth: 1, endMonth: 48 },
      { id: "oh-3", name: "Admin & ops staff", monthly: 200_000, startMonth: 1, endMonth: 60 },
      { id: "oh-4", name: "CRM software", monthly: 25_000, startMonth: 1, endMonth: 60 },
      { id: "oh-5", name: "Sales team (salaried)", monthly: 300_000, startMonth: 1, endMonth: 48 },
      { id: "oh-6", name: "Site office overhead", monthly: 150_000, startMonth: 1, endMonth: 60 },
      { id: "oh-7", name: "Legal retainer", monthly: 75_000, startMonth: 1, endMonth: 60 },
      { id: "oh-8", name: "Accounts & audit", monthly: 50_000, startMonth: 1, endMonth: 60 },
      { id: "oh-9", name: "Management allocation", monthly: 250_000, startMonth: 1, endMonth: 60 },
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
