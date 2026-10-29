import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSetup, type SetupSource } from "./sketchup-setup";

const work = (id: string, code: string, extra: Partial<SetupSource["works"][number]> = {}) => ({
  workItemId: id,
  code,
  name: `Work ${code}`,
  isActive: true,
  uom: "cum",
  modelMeasure: null,
  categoryCode: "FD",
  categoryName: "Foundation",
  groupCode: "FD.03",
  groupName: "Isolated footing",
  ...extra,
});

function source(): SetupSource {
  return {
    works: [
      work("w1", "FD.03.03"),
      work("w2", "FD.03.04", { uom: "sqft", modelMeasure: "base_and_sides" }),
      work("w3", "FD.99.01", { isActive: false }),
      work("w4", "ENC.01", { uom: null }),
    ],
    labourRates: new Map<string, number | null>([
      ["w1", "4000" as unknown as number],
      ["w2", 75],
      ["w4", null],
    ]),
    workComponents: new Map([
      ["w1", [{ itemId: null, mixId: "m1", qtyPerUnit: 1 }]],
      ["w2", [{ itemId: "i3", mixId: null, qtyPerUnit: "0.05" as unknown as number }]],
    ]),
    mixes: [
      { id: "m1", name: "M20 Concrete", uom: "cum", groupName: "Concrete", isActive: true },
      { id: "m2", name: "Old mix", uom: "cum", groupName: null, isActive: false },
      { id: "m3", name: "Steel 8 mm", uom: "kg", groupName: "Steel", isActive: true },
    ],
    mixComponents: new Map([
      [
        "m1",
        [
          { itemId: "i1", qtyPerUnit: 8 },
          { itemId: "i2", qtyPerUnit: 15.5 },
        ],
      ],
      ["m2", [{ itemId: "i9", qtyPerUnit: 1 }]],
    ]),
    items: new Map([
      ["i1", { code: "CVL/07", name: "Cement OPC", uom: "bag", price: "417" as unknown as number }],
      ["i2", { code: "CVL/27", name: "M Sand", uom: "cft", price: null }],
      ["i3", { code: null, name: "Shuttering oil", uom: "ltr", price: 120 }],
      ["i9", { code: "OLD/1", name: "Old", uom: "nos", price: 1 }],
    ]),
  };
}

const built = () => buildSetup(source(), "2026-10-29T10:00:00.000Z", "https://toolbox.example");

test("the setup names itself, its toolbox and its counts", () => {
  const setup = built();
  assert.equal(setup.format, "goodearth-qs-setup");
  assert.equal(setup.version, 1);
  assert.equal(setup.toolbox, "https://toolbox.example");
  assert.deepEqual(setup.summary, { works: 3, mixes: 2, items: 3, priced_works: 2 });
});

test("only active works go, each with its unit, measure, rate and recipe", () => {
  const setup = built();
  assert.deepEqual(
    setup.works.map((w) => w.code),
    ["FD.03.03", "FD.03.04", "ENC.01"],
  );
  const footing = setup.works.find((w) => w.code === "FD.03.04")!;
  assert.equal(footing.uom, "sqft");
  assert.equal(footing.measure, "base_and_sides");
  assert.equal(footing.labour_rate, 75);
  // An item with no Masters code is named by its name.
  assert.deepEqual(footing.materials, [{ item: "Shuttering oil", qty: 0.05 }]);
  assert.deepEqual(setup.works[0].materials, [{ mix: "M20 Concrete", qty: 1 }]);
  assert.equal(setup.works[0].labour_rate, 4000);
});

test("an unpriced work or item stays null, never zero", () => {
  const setup = built();
  assert.equal(setup.works.find((w) => w.code === "ENC.01")!.labour_rate, null);
  assert.equal(setup.works.find((w) => w.code === "ENC.01")!.uom, null);
  assert.equal(setup.items.find((i) => i.code === "CVL/27")!.price, null);
  assert.equal(setup.items.find((i) => i.code === "CVL/07")!.price, 417);
});

test("active mixes go with their make-up; a switched-off mix only when a recipe names it", () => {
  const setup = built();
  assert.deepEqual(
    setup.mixes.map((m) => m.name),
    ["M20 Concrete", "Steel 8 mm"],
  );
  assert.deepEqual(setup.mixes[0].materials, [
    { item: "CVL/07", qty: 8 },
    { item: "CVL/27", qty: 15.5 },
  ]);

  const withOld = source();
  withOld.workComponents.set("w1", [{ itemId: null, mixId: "m2", qtyPerUnit: 1 }]);
  const old = buildSetup(withOld, "t", "x").mixes.find((m) => m.name === "Old mix")!;
  assert.equal(old.active, false);
  assert.deepEqual(old.materials, [{ item: "OLD/1", qty: 1 }]);
});

test("items are only those the make-ups use", () => {
  assert.deepEqual(
    built().items.map((i) => i.code ?? i.name),
    ["CVL/07", "CVL/27", "Shuttering oil"],
  );
});
