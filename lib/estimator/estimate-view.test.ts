import assert from "node:assert/strict";
import { test } from "node:test";

import type { EstimateDetail, EstimateVariations, RecipeBook } from "./estimate-queries";
import { buildEstimateView, missingParts, officialRemoval, otherCostsTotal } from "./estimate-view";
import type { WorkStatusRow } from "./works-queries";

const book: RecipeBook = {
  materials: [
    { id: "sand", name: "M-sand", uom: "cum", rate: 2000 },
    { id: "cement", name: "OPC 53 Cement", uom: "bag", rate: 400 },
  ],
  mixes: [],
  recipes: [
    {
      workItemId: "plaster",
      uom: "sqm",
      labourRate: 100,
      components: [
        { materialId: "cement", mixId: null, qtyPerUnit: 0.5 },
        { materialId: "sand", mixId: null, qtyPerUnit: 0.01 },
      ],
    },
  ],
};

const works: WorkStatusRow[] = [
  {
    workItemId: "plaster",
    code: "PL.1",
    name: "Plastering",
    categoryCode: "PL",
    categoryName: "Plastering",
    groupName: null,
    isActive: true,
    uom: "sqm",
    labourRate: 100,
    componentCount: 2,
  },
];

const noVariations: EstimateVariations = {
  byLine: new Map(),
  componentsByLine: new Map(),
  labourRateByLine: new Map(),
  rateByMaterialId: new Map(),
  extraMaterials: [],
  modelByLine: new Map(),
  addsByLine: new Map(),
  useModelMaterials: true,
};

const estimate = (over: Partial<EstimateDetail> = {}): EstimateDetail => ({
  id: "e1",
  name: "Villa 3",
  note: null,
  isTemplate: false,
  isWorking: true,
  projectId: "p1",
  projectName: "Saarang",
  unitId: "u3",
  unitName: "Villa 3",
  sourceName: null,
  lines: [
    {
      id: "l1",
      workItemId: "plaster",
      code: "PL.1",
      name: "Plastering",
      label: null,
      categoryCode: "PL",
      qty: 100,
      note: null,
      labourRate: null,
    },
  ],
  status: "draft",
  reference: null,
  submittedByName: null,
  submittedAt: null,
  supersededAt: null,
  cancelledAt: null,
  cancelledByName: null,
  cancelReason: null,
  drawingIndentRefs: [],
  villaWorkingId: null,
  villaOfficial: null,
  model: null,
  useModelMaterials: true,
  modelSettings: null,
  modelBuaSqft: null,
  otherCosts: [],
  frozen: null,
  ...over,
});

const view = (over: Partial<EstimateDetail> = {}, variations = noVariations) =>
  buildEstimateView({
    estimate: estimate(over),
    book,
    works,
    variations,
    materialItems: [],
    mixRows: [],
  });

test("a working estimate prices live: labour plus materials, per unit and in all", () => {
  const v = view();
  // 100 labour + 0.5 bag × 400 + 0.01 cum × 2000 = 320 a sqm.
  assert.equal(v.unitRateByLine.get("l1"), 320);
  assert.equal(v.totals.grand, 32000);
  assert.deepEqual(v.missing, []);
  assert.equal(v.isDraft, true);
});

test("the materials list is sorted by name and priced", () => {
  const v = view();
  assert.deepEqual(
    v.takeoffRows.map((row) => [row.name, row.quantity, row.cost]),
    [
      ["M-sand", 1, 2000],
      ["OPC 53 Cement", 50, 20000],
    ],
  );
});

test("this villa's price for a material replaces Masters' before any arithmetic", () => {
  const v = view({}, { ...noVariations, rateByMaterialId: new Map([["cement", 500]]) });
  assert.equal(v.unitRateByLine.get("l1"), 370);
  const rate = v.rateViewFor(estimate().lines[0], "sqm");
  assert.equal(rate.own, false);
  const cement = rate.prices.find((price) => price.itemId === "cement");
  assert.equal(cement?.mastersPrice, 400);
  assert.equal(cement?.villaPrice, 500);
});

test("an official estimate renders its frozen figures, not today's rates", () => {
  const v = view({
    status: "submitted",
    frozen: {
      lineCosts: [
        {
          workItemId: "plaster",
          lineId: "l1",
          qty: 100,
          uom: "sqm",
          labourCost: 10000,
          materialCost: 15000,
          totalCost: 25000,
        },
      ],
      takeoff: [
        {
          workItemId: "plaster",
          materialId: "cement",
          materialName: "OPC 53 Cement",
          uom: "bag",
          quantity: 50,
          rate: 300,
        },
      ],
    },
  });
  assert.equal(v.isDraft, false);
  assert.equal(v.unitRateByLine.get("l1"), 250);
  assert.equal(v.totals.grand, 25000);
});

test("a frozen line with no quantity has no per-unit rate", () => {
  const v = view({
    status: "submitted",
    frozen: {
      lineCosts: [
        {
          workItemId: "plaster",
          lineId: "l1",
          qty: 0,
          uom: "sqm",
          labourCost: 0,
          materialCost: 0,
          totalCost: 0,
        },
      ],
      takeoff: [],
    },
  });
  assert.equal(v.unitRateByLine.get("l1"), null);
});

test("an unmeasured line is named in the warning under the total", () => {
  const v = view({
    lines: [{ ...estimate().lines[0], qty: null }],
  });
  assert.deepEqual(v.missing, ["1 work is still to measure"]);
});

test("the warning counts in plain words", () => {
  const totals = {
    toMeasureCount: 2,
    notSetUpCount: 1,
    missingLabourCount: 0,
    missingMaterialRateCount: 3,
  } as Parameters<typeof missingParts>[0];
  assert.deepEqual(missingParts(totals), [
    "2 works are still to measure",
    "1 work has no setup",
    "3 works use materials with no rate",
  ]);
});

test("an official estimate withdraws until a live indent draws on it", () => {
  assert.deepEqual(officialRemoval("submitted", []), { kind: "cancel" });
  assert.deepEqual(officialRemoval("submitted", ["IND/S/004"]), {
    kind: "blocked",
    why: "IND/S/004 draws on it — cancel that indent first.",
  });
  assert.deepEqual(officialRemoval("submitted", ["IND/S/004", "IND/S/009"]), {
    kind: "blocked",
    why: "IND/S/004 and IND/S/009 draw on it — cancel those indents first.",
  });
  assert.equal(officialRemoval("draft", []), null);
  assert.equal(officialRemoval("superseded", []), null);
  assert.equal(officialRemoval("cancelled", []), null);
});

test("two rows of one work are each priced on their own, each keeping its labour rate (0157)", () => {
  const second = { ...estimate().lines[0], id: "l2", label: "Ceiling", qty: 10, labourRate: 200 };
  const v = view(
    { lines: [{ ...estimate().lines[0], label: "Walls" }, second] },
    { ...noVariations, labourRateByLine: new Map([["l2", 200]]) },
  );
  assert.equal(v.unitRateByLine.get("l1"), 320);
  assert.equal(v.unitRateByLine.get("l2"), 420);
  // 100 x 320 + 10 x 420
  assert.equal(v.totals.grand, 36200);
  assert.deepEqual(
    v.boq[0].lineCosts.map((line) => line.lineId),
    ["l1", "l2"],
  );
  assert.equal(v.rowsByWork.get("plaster"), 2);
});

test("other costs add to the total; one with no rate is unknown, never zero (0174)", () => {
  const cost = (id: string, qty: number | null, rate: number | null) => ({
    id,
    fromModel: true,
    code: null,
    name: id,
    unit: null,
    qty,
    rate,
    note: null,
    position: 0,
  });
  assert.deepEqual(otherCostsTotal([]), { amount: 0, unpriced: 0 });
  assert.deepEqual(otherCostsTotal([cost("a", 2, null)]), { amount: null, unpriced: 1 });
  const v = view({ otherCosts: [cost("mep", 100, 200), cost("site", 1, null)] });
  assert.deepEqual(v.other, { amount: 20000, unpriced: 1 });
  assert.equal(v.grand.amount, (v.totals.grand ?? 0) + 20000);
  assert.equal(v.grand.isComplete, false);
  assert.ok(v.missing.some((part) => part === "1 other cost has no quantity or rate"));
});

test("a row made of the model's materials says so, and lists them (0174)", () => {
  const v = view(
    {},
    {
      ...noVariations,
      componentsByLine: new Map([["l1", [{ materialId: "cement", mixId: null, qtyPerUnit: 0.5 }]]]),
    },
  );
  const rate = v.rateViewFor(v.lineById.get("l1")!, "sqft");
  assert.equal(rate.fromModel, true);
  assert.equal(rate.own, false);
  assert.deepEqual(
    rate.components.map((row) => [row.ref, row.qtyPerUnit]),
    [["material:cement", 0.5]],
  );
});
