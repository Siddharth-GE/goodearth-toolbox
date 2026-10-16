import assert from "node:assert/strict";
import { test } from "node:test";
import { drawnPercent, materialTotals, siteCheckEntries, villaSummaries } from "./site-check";

const row = (work: string, item: string | null, estimated: number, issued: number | null) => ({
  workItemId: work,
  itemId: item,
  materialName: item ?? "old",
  uom: "bag",
  estimated,
  issued,
  over: issued !== null && issued > estimated,
});

const officials = [
  {
    estimateId: "est-10",
    unitId: "villa-10",
    comparison: {
      rows: [row("slab", "cement", 100, 120), row("plaster", "cement", 40, 10)],
      unmatched: [{ workItemId: null, itemId: "tile", quantity: 30 }],
    },
  },
  {
    estimateId: "est-11",
    unitId: "villa-11",
    comparison: {
      rows: [row("slab", "cement", 100, 50), row("old", null, 8, null)],
      unmatched: [{ workItemId: "slab", itemId: "cement", quantity: 5 }],
    },
  },
];

test("the list holds over-runs and unplanned arrivals, nothing else", () => {
  const entries = siteCheckEntries(officials);
  assert.deepEqual(
    entries.map((entry) => `${entry.unitId} ${entry.kind} ${entry.itemId} ${entry.reached}`),
    ["villa-10 over cement 120", "villa-10 outside tile 30", "villa-11 outside cement 5"],
  );
  const over = entries.find((entry) => entry.kind === "over");
  assert.equal(over?.estimated, 100);
});

test("where the cement goes: every villa's estimate and every arrival, planned or not", () => {
  const totals = materialTotals(officials);
  const cement = totals.find((total) => total.itemId === "cement");
  assert.equal(cement?.estimated, 240);
  // 120 + 10 + 50 planned, and 5 that arrived outside the plan.
  assert.equal(cement?.reached, 185);
  assert.equal(cement?.villas, 2);
  const tile = totals.find((total) => total.itemId === "tile");
  assert.equal(tile?.estimated, 0);
  assert.equal(tile?.reached, 30);
  // A row from before materials were items has no item to add up under.
  assert.equal(totals.length, 2);
});

test("one villa's figures, and a percentage that is never a divide by zero", () => {
  const villa11 = materialTotals(officials, "villa-11");
  assert.equal(villa11.find((total) => total.itemId === "cement")?.reached, 55);
  assert.equal(drawnPercent(0, 30), null);
  assert.equal(drawnPercent(200, 50), 25);
});

test("the villa list: waiting for you first, then past the estimate, then the rest", () => {
  const withVilla9 = [
    ...officials,
    {
      estimateId: "est-9",
      unitId: "villa-9",
      comparison: { rows: [row("slab", "sand", 10, 12)], unmatched: [] },
    },
    { estimateId: "est-2", unitId: "villa-2", comparison: { rows: [], unmatched: [] } },
  ];
  const names: Record<string, string> = {
    "villa-2": "Villa 2",
    "villa-9": "Villa 9",
    "villa-10": "Villa 10",
    "villa-11": "Villa 11",
  };
  const summaries = villaSummaries(
    withVilla9,
    siteCheckEntries(withVilla9),
    (entry) => entry.unitId === "villa-11",
    (unitId) => names[unitId] ?? "",
  );
  assert.deepEqual(
    summaries.map((s) => `${s.unitId} over ${s.over} waiting ${s.waiting} approved ${s.approved}`),
    [
      "villa-10 over 1 waiting 1 approved 0",
      "villa-9 over 1 waiting 0 approved 0",
      // Nothing waiting and nothing over: name order, 2 before 11.
      "villa-2 over 0 waiting 0 approved 0",
      "villa-11 over 0 waiting 0 approved 1",
    ],
  );
});
