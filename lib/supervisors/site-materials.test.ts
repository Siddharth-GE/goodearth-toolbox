import assert from "node:assert/strict";
import { test } from "node:test";
import { groupSiteMaterials } from "./site-materials";

const takeoff = [
  {
    workItemId: "w1",
    materialId: "cement",
    materialName: "Cement",
    uom: "bag",
    quantity: 80,
    itemId: "i-cem",
    itemUomFactor: null,
  },
  {
    workItemId: "w2",
    materialId: "sand",
    materialName: "M-sand",
    uom: "cum",
    quantity: 10,
    itemId: "i-sand",
    itemUomFactor: 35.31,
  },
];
const itemUoms = new Map([
  ["i-cem", "bag"],
  ["i-sand", "cft"],
]);

test("issued quantities line up per work, converted into the material's unit", () => {
  const result = groupSiteMaterials(
    takeoff,
    [
      { workItemId: "w1", itemId: "i-cem", quantity: 50 },
      { workItemId: "w2", itemId: "i-sand", quantity: 353.1 },
    ],
    itemUoms,
  );
  const cement = result.rows.find((row) => row.workItemId === "w1");
  const sand = result.rows.find((row) => row.workItemId === "w2");
  assert.equal(cement?.issued, 50);
  assert.equal(cement?.over, false);
  assert.ok(Math.abs((sand?.issued ?? 0) - 10) < 1e-9);
  assert.equal(result.unplanned.length, 0);
});

test("drawing past the estimate flags over", () => {
  const result = groupSiteMaterials(
    takeoff,
    [{ workItemId: "w1", itemId: "i-cem", quantity: 90 }],
    itemUoms,
  );
  assert.equal(result.rows.find((row) => row.workItemId === "w1")?.over, true);
});

test("no factor and differing units reports raw, never flags", () => {
  const noFactor = [{ ...takeoff[1], itemUomFactor: null }];
  const result = groupSiteMaterials(
    noFactor,
    [{ workItemId: "w2", itemId: "i-sand", quantity: 9999 }],
    itemUoms,
  );
  const row = result.rows[0];
  assert.equal(row.issued, null);
  assert.deepEqual(row.issuedRaw, { quantity: 9999, uom: "cft" });
  assert.equal(row.over, false);
});

test("an unlinked material never matches and shows zero drawn", () => {
  const unlinked = [{ ...takeoff[0], itemId: null, itemUomFactor: null }];
  const result = groupSiteMaterials(
    unlinked,
    [{ workItemId: "w1", itemId: "i-cem", quantity: 40 }],
    itemUoms,
  );
  assert.equal(result.rows[0].issued, 0);
  // The movement still shows — as unplanned, not nowhere.
  assert.deepEqual(result.unplanned, [{ workItemId: "w1", itemId: "i-cem", quantity: 40 }]);
});

test("untagged history and unknown works land in unplanned", () => {
  const result = groupSiteMaterials(
    takeoff,
    [
      { workItemId: null, itemId: "i-cem", quantity: 20 },
      { workItemId: "w9", itemId: "i-cem", quantity: 5 },
    ],
    itemUoms,
  );
  assert.equal(result.rows.find((row) => row.workItemId === "w1")?.issued, 0);
  assert.equal(result.unplanned.length, 2);
  assert.ok(result.unplanned.some((entry) => entry.workItemId === null && entry.quantity === 20));
  assert.ok(result.unplanned.some((entry) => entry.workItemId === "w9" && entry.quantity === 5));
});

test("matching unit labels convert 1:1 without a factor, nos equals each", () => {
  const rods = [
    {
      workItemId: "w3",
      materialId: "rod",
      materialName: "Steel rod",
      uom: "nos",
      quantity: 100,
      itemId: "i-rod",
      itemUomFactor: null,
    },
  ];
  const result = groupSiteMaterials(
    rods,
    [{ workItemId: "w3", itemId: "i-rod", quantity: 60 }],
    new Map([["i-rod", "each"]]),
  );
  assert.equal(result.rows[0].issued, 60);
});
