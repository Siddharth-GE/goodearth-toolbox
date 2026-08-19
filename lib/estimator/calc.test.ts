import assert from "node:assert/strict";
import { test } from "node:test";
import {
  computeEstimateTotals,
  computeLine,
  computeTakeoff,
  computeWorkTakeoff,
  frozenLineCosts,
  aggregateFrozenTakeoff,
  expandRecipe,
  groupLineCosts,
  type MaterialDef,
  type MixDef,
  type WorkRecipe,
} from "./calc";

const cement: MaterialDef = { id: "cement", name: "OPC 53 Cement", uom: "bag", rate: 400 };
const sand: MaterialDef = { id: "sand", name: "M-sand", uom: "cum", rate: 2000 };
const jelly: MaterialDef = { id: "jelly", name: "20mm Jelly", uom: "cum", rate: 1500 };
const unpriced: MaterialDef = { id: "steel", name: "TMT Steel", uom: "kg", rate: null };

const materials = new Map([cement, sand, jelly, unpriced].map((m) => [m.id, m]));

// M20: 8 bags cement, 0.45 cum sand, 0.9 cum jelly per cum of concrete.
const m20: MixDef = {
  id: "m20",
  name: "M20 concrete",
  uom: "cum",
  components: [
    { materialId: "cement", qtyPerUnit: 8 },
    { materialId: "sand", qtyPerUnit: 0.45 },
    { materialId: "jelly", qtyPerUnit: 0.9 },
  ],
};
const emptyMix: MixDef = { id: "empty", name: "Undefined mix", uom: "cum", components: [] };
const mixes = new Map([m20, emptyMix].map((m) => [m.id, m]));

const mix = (mixId: string, qtyPerUnit: number) => ({ materialId: null, mixId, qtyPerUnit });
const direct = (materialId: string, qtyPerUnit: number) => ({
  materialId,
  mixId: null,
  qtyPerUnit,
});

test("expandRecipe multiplies a mix into its materials", () => {
  const recipe: WorkRecipe = {
    workItemId: "w1",
    uom: "cum",
    labourRate: 900,
    components: [mix("m20", 1)],
  };
  const needs = expandRecipe(recipe, mixes);
  assert.deepEqual(
    needs.sort((a, b) => a.materialId.localeCompare(b.materialId)),
    [
      { materialId: "cement", qtyPerWorkUnit: 8 },
      { materialId: "jelly", qtyPerWorkUnit: 0.9 },
      { materialId: "sand", qtyPerWorkUnit: 0.45 },
    ],
  );
});

test("expandRecipe merges a material reached directly and through a mix", () => {
  const recipe: WorkRecipe = {
    workItemId: "w1",
    uom: "cum",
    labourRate: 900,
    // Half a cum of M20 (4 bags of cement) plus 2 bags used neat.
    components: [mix("m20", 0.5), direct("cement", 2)],
  };
  const needs = expandRecipe(recipe, mixes);
  const cementNeed = needs.find((n) => n.materialId === "cement");
  assert.equal(cementNeed?.qtyPerWorkUnit, 6);
  assert.equal(needs.filter((n) => n.materialId === "cement").length, 1);
});

test("expandRecipe survives an empty or missing mix", () => {
  const recipe: WorkRecipe = {
    workItemId: "w1",
    uom: "cum",
    labourRate: 100,
    components: [mix("empty", 3), mix("deleted-mix", 2), direct("sand", 1)],
  };
  assert.deepEqual(expandRecipe(recipe, mixes), [{ materialId: "sand", qtyPerWorkUnit: 1 }]);
});

test("computeLine prices labour and materials together", () => {
  const recipe: WorkRecipe = {
    workItemId: "w1",
    uom: "cum",
    labourRate: 900,
    components: [mix("m20", 1)],
  };
  const line = computeLine({ workItemId: "w1", qty: 10 }, recipe, mixes, materials);
  assert.equal(line.isSetUp, true);
  assert.equal(line.hasRecipe, true);
  assert.equal(line.labourCost, 9000);
  // 10 cum: 80 bags x 400 + 4.5 cum x 2000 + 9 cum x 1500 = 54500
  assert.equal(line.materialCost, 54500);
  assert.equal(line.totalCost, 63500);
  assert.deepEqual(line.missingRateMaterialIds, []);
});

test("a work with no setup costs nothing and says so", () => {
  const line = computeLine({ workItemId: "w9", qty: 5 }, undefined, mixes, materials);
  assert.equal(line.isSetUp, false);
  assert.equal(line.hasRecipe, false);
  assert.equal(line.labourCost, null);
  assert.equal(line.materialCost, null);
  assert.equal(line.totalCost, null);
});

test("a work with no recipe is labour only, and flagged", () => {
  const recipe: WorkRecipe = { workItemId: "w2", uom: "sqm", labourRate: 55, components: [] };
  const line = computeLine({ workItemId: "w2", qty: 100 }, recipe, mixes, materials);
  assert.equal(line.isSetUp, true);
  assert.equal(line.hasRecipe, false);
  assert.equal(line.labourCost, 5500);
  assert.equal(line.materialCost, 0);
  assert.equal(line.totalCost, 5500);
});

test("an unpriced material makes the material cost unknown, never zero", () => {
  const recipe: WorkRecipe = {
    workItemId: "w3",
    uom: "cum",
    labourRate: 900,
    components: [mix("m20", 1), direct("steel", 80)],
  };
  const line = computeLine({ workItemId: "w3", qty: 2 }, recipe, mixes, materials);
  assert.equal(line.materialCost, null);
  assert.equal(line.totalCost, null);
  // Labour is still known, and still reported.
  assert.equal(line.labourCost, 1800);
  assert.deepEqual(line.missingRateMaterialIds, ["steel"]);
});

test("a missing labour rate leaves materials priced and the total unknown", () => {
  const recipe: WorkRecipe = {
    workItemId: "w4",
    uom: "cum",
    labourRate: null,
    components: [direct("cement", 1)],
  };
  const line = computeLine({ workItemId: "w4", qty: 3 }, recipe, mixes, materials);
  assert.equal(line.labourCost, null);
  assert.equal(line.materialCost, 1200);
  assert.equal(line.totalCost, null);
});

test("computeTakeoff sums one material across several lines", () => {
  const recipes = new Map<string, WorkRecipe>([
    ["w1", { workItemId: "w1", uom: "cum", labourRate: 900, components: [mix("m20", 1)] }],
    ["w2", { workItemId: "w2", uom: "sqm", labourRate: 50, components: [direct("cement", 0.5)] }],
  ]);
  const takeoff = computeTakeoff(
    [
      { workItemId: "w1", qty: 10 },
      { workItemId: "w2", qty: 100 },
    ],
    recipes,
    mixes,
    materials,
  );
  const cementRow = takeoff.find((row) => row.materialId === "cement");
  // 10 cum of M20 = 80 bags, plus 100 sqm x 0.5 = 50 bags.
  assert.equal(cementRow?.quantity, 130);
  assert.equal(cementRow?.cost, 52000);
  assert.equal(cementRow?.missingRate, false);
});

test("takeoff keeps the quantity of an unpriced material and flags the cost", () => {
  const recipes = new Map<string, WorkRecipe>([
    ["w3", { workItemId: "w3", uom: "cum", labourRate: 0, components: [direct("steel", 80)] }],
  ]);
  const takeoff = computeTakeoff([{ workItemId: "w3", qty: 2 }], recipes, mixes, materials);
  assert.deepEqual(takeoff, [
    { materialId: "steel", quantity: 160, cost: null, missingRate: true },
  ]);
});

test("takeoff ignores lines whose work is not set up", () => {
  const takeoff = computeTakeoff(
    [{ workItemId: "unknown", qty: 5 }],
    new Map<string, WorkRecipe>(),
    mixes,
    materials,
  );
  assert.deepEqual(takeoff, []);
});

test("totals add up what is known and refuse to call it complete", () => {
  const priced: WorkRecipe = {
    workItemId: "w1",
    uom: "cum",
    labourRate: 900,
    components: [mix("m20", 1)],
  };
  const unpricedRecipe: WorkRecipe = {
    workItemId: "w3",
    uom: "cum",
    labourRate: 900,
    components: [direct("steel", 80)],
  };

  const lines = [
    computeLine({ workItemId: "w1", qty: 10 }, priced, mixes, materials),
    computeLine({ workItemId: "w3", qty: 2 }, unpricedRecipe, mixes, materials),
    computeLine({ workItemId: "w9", qty: 1 }, undefined, mixes, materials),
  ];
  const totals = computeEstimateTotals(lines);

  assert.equal(totals.labour, 10800);
  assert.equal(totals.material, 54500);
  assert.equal(totals.grand, 65300);
  assert.equal(totals.isComplete, false);
  assert.equal(totals.missingMaterialRateCount, 1);
  assert.equal(totals.missingLabourCount, 0);
  assert.equal(totals.notSetUpCount, 1);
});

test("a column with nothing known in it is null, not zero", () => {
  // The bug this exists to stop: one line, its only material unpriced.
  // The materials column knows NOTHING, and a screen printing ₹0 there
  // would be saying the materials are free. Caught on staging before
  // the tool shipped.
  const unpricedRecipe: WorkRecipe = {
    workItemId: "w3",
    uom: "cum",
    labourRate: 900,
    components: [direct("steel", 80)],
  };
  const totals = computeEstimateTotals([
    computeLine({ workItemId: "w3", qty: 10 }, unpricedRecipe, mixes, materials),
  ]);

  assert.equal(totals.material, null);
  assert.equal(totals.labour, 9000);
  // The grand total is still the honest floor: labour is genuinely known.
  assert.equal(totals.grand, 9000);
  assert.equal(totals.isComplete, false);
});

test("nothing known anywhere leaves every column null", () => {
  const totals = computeEstimateTotals([
    computeLine({ workItemId: "w9", qty: 1 }, undefined, mixes, materials),
  ]);
  assert.equal(totals.labour, null);
  assert.equal(totals.material, null);
  assert.equal(totals.grand, null);
  assert.equal(totals.notSetUpCount, 1);
});

test("a genuinely free column is zero, not null", () => {
  // Labour-only work: the materials really do cost nothing, and that is
  // a different statement from "nobody has priced them".
  const labourOnly: WorkRecipe = {
    workItemId: "w2",
    uom: "sqm",
    labourRate: 55,
    components: [],
  };
  const totals = computeEstimateTotals([
    computeLine({ workItemId: "w2", qty: 100 }, labourOnly, mixes, materials),
  ]);
  assert.equal(totals.material, 0);
  assert.equal(totals.labour, 5500);
  assert.equal(totals.grand, 5500);
  assert.equal(totals.isComplete, true);
});

test("a fully priced estimate reports itself complete", () => {
  const recipe: WorkRecipe = {
    workItemId: "w1",
    uom: "cum",
    labourRate: 900,
    components: [mix("m20", 1)],
  };
  const totals = computeEstimateTotals([
    computeLine({ workItemId: "w1", qty: 1 }, recipe, mixes, materials),
  ]);
  assert.equal(totals.isComplete, true);
  assert.equal(totals.grand, 900 + 8 * 400 + 0.45 * 2000 + 0.9 * 1500);
});

test("an empty estimate totals zero and is not called incomplete", () => {
  const totals = computeEstimateTotals([]);
  assert.equal(totals.grand, 0);
  assert.equal(totals.isComplete, true);
});

test("groupLineCosts gathers lines under categories in vocabulary order", () => {
  const priced: WorkRecipe = {
    workItemId: "w1",
    uom: "cum",
    labourRate: 900,
    components: [mix("m20", 1)],
  };
  const labourOnly: WorkRecipe = { workItemId: "w2", uom: "sqm", labourRate: 55, components: [] };
  const lineCosts = [
    computeLine({ workItemId: "w2", qty: 100 }, labourOnly, mixes, materials),
    computeLine({ workItemId: "w1", qty: 10 }, priced, mixes, materials),
  ];
  const categories = new Map([
    ["w1", { code: "FD", name: "Foundation" }],
    ["w2", { code: "F", name: "Finishes" }],
  ]);

  const groups = groupLineCosts(lineCosts, categories, ["FD", "F"]);
  // FD first even though the F line came first — the vocabulary decides.
  assert.deepEqual(
    groups.map((g) => g.code),
    ["FD", "F"],
  );
  assert.equal(groups[0].totals.grand, 63500);
  assert.equal(groups[1].totals.grand, 5500);
});

test("a category's subtotal keeps the null-never-zero rule", () => {
  const unpricedRecipe: WorkRecipe = {
    workItemId: "w3",
    uom: "cum",
    labourRate: 900,
    components: [direct("steel", 80)],
  };
  const groups = groupLineCosts(
    [computeLine({ workItemId: "w3", qty: 2 }, unpricedRecipe, mixes, materials)],
    new Map([["w3", { code: "SS", name: "Super-structure" }]]),
    ["SS"],
  );
  assert.equal(groups[0].totals.material, null);
  assert.equal(groups[0].totals.labour, 1800);
  assert.equal(groups[0].totals.isComplete, false);
});

test("a line whose work has no category lands in Uncategorised, last", () => {
  const labourOnly: WorkRecipe = { workItemId: "w2", uom: "sqm", labourRate: 55, components: [] };
  const groups = groupLineCosts(
    [
      computeLine({ workItemId: "w9", qty: 1 }, undefined, mixes, materials),
      computeLine({ workItemId: "w2", qty: 100 }, labourOnly, mixes, materials),
    ],
    new Map([["w2", { code: "F", name: "Finishes" }]]),
    ["F"],
  );
  assert.deepEqual(
    groups.map((g) => g.code),
    ["F", ""],
  );
  assert.equal(groups[1].name, "Uncategorised");
  assert.equal(groups[1].totals.notSetUpCount, 1);
});

test("computeWorkTakeoff keeps quantities per work, and sums to computeTakeoff", () => {
  const recipes = new Map<string, WorkRecipe>([
    ["w1", { workItemId: "w1", uom: "cum", labourRate: 900, components: [mix("m20", 1)] }],
    ["w2", { workItemId: "w2", uom: "sqm", labourRate: 50, components: [direct("cement", 0.5)] }],
  ]);
  const lines = [
    { workItemId: "w1", qty: 10 },
    { workItemId: "w2", qty: 100 },
  ];

  const perWork = computeWorkTakeoff(lines, recipes, mixes);
  const w1Cement = perWork.find((r) => r.workItemId === "w1" && r.materialId === "cement");
  const w2Cement = perWork.find((r) => r.workItemId === "w2" && r.materialId === "cement");
  assert.equal(w1Cement?.quantity, 80);
  assert.equal(w2Cement?.quantity, 50);

  // The per-work rows must sum to exactly what the aggregate takeoff
  // says — the snapshot (0077) stores the former, the screens print the
  // latter, and they can never disagree.
  const summed = new Map<string, number>();
  for (const row of perWork) {
    summed.set(row.materialId, (summed.get(row.materialId) ?? 0) + row.quantity);
  }
  for (const row of computeTakeoff(lines, recipes, mixes, materials)) {
    assert.equal(summed.get(row.materialId), row.quantity);
  }
});

test("computeWorkTakeoff skips works with no setup, like the aggregate does", () => {
  const rows = computeWorkTakeoff([{ workItemId: "w9", qty: 5 }], new Map(), mixes);
  assert.deepEqual(rows, []);
});

test("frozenLineCosts rebuilds LineCost from the snapshot, deriving what it can", () => {
  const rebuilt = frozenLineCosts(
    [
      {
        workItemId: "w1",
        qty: 10,
        uom: "cum",
        labourCost: 9000,
        materialCost: 52000,
        totalCost: 61000,
      },
      {
        workItemId: "w2",
        qty: 100,
        uom: "sqm",
        labourCost: 5000,
        materialCost: null,
        totalCost: null,
      },
      {
        workItemId: "w9",
        qty: 5,
        uom: null,
        labourCost: null,
        materialCost: null,
        totalCost: null,
      },
    ],
    [
      {
        workItemId: "w1",
        materialId: "cement",
        materialName: "Cement",
        uom: "bag",
        quantity: 80,
        rate: 400,
      },
      {
        workItemId: "w2",
        materialId: "steel",
        materialName: "Steel",
        uom: "kg",
        quantity: 160,
        rate: null,
      },
    ],
  );

  assert.equal(rebuilt[0].isSetUp, true);
  assert.equal(rebuilt[0].hasRecipe, true);
  assert.deepEqual(rebuilt[0].missingRateMaterialIds, []);
  assert.deepEqual(rebuilt[1].missingRateMaterialIds, ["steel"]);
  assert.equal(rebuilt[2].isSetUp, false);
  assert.equal(rebuilt[2].hasRecipe, false);
});

test("aggregateFrozenTakeoff sums a material across works and keeps null honest", () => {
  const rows = aggregateFrozenTakeoff([
    {
      workItemId: "w1",
      materialId: "cement",
      materialName: "Cement",
      uom: "bag",
      quantity: 80,
      rate: 400,
    },
    {
      workItemId: "w2",
      materialId: "cement",
      materialName: "Cement",
      uom: "bag",
      quantity: 50,
      rate: 400,
    },
    {
      workItemId: "w2",
      materialId: "steel",
      materialName: "Steel",
      uom: "kg",
      quantity: 160,
      rate: null,
    },
  ]);

  const cement = rows.find((row) => row.materialId === "cement");
  assert.equal(cement?.quantity, 130);
  assert.equal(cement?.cost, 52000);
  const steel = rows.find((row) => row.materialId === "steel");
  assert.equal(steel?.cost, null);
  assert.equal(steel?.missingRate, true);
});
