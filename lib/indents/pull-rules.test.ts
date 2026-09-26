/**
 * The pull-safety rules. What these protect: material never being
 * requested against a superseded design revision (the double-buy bug),
 * and the "design revised since this was requested" badge telling the
 * truth on lines that were pulled before a revision landed.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  classifyBudgetChooser,
  classifyDesignDrift,
  classifyEstimatePull,
  groupEstimatePull,
  requestedByItem,
  type BudgetCandidate,
  type DriftLine,
  type EstimateFact,
  type IssuedRevision,
} from "./pull-rules";

const budget = (id: string, unit: string, selection: string): BudgetCandidate => ({
  budget_id: id,
  unit_id: unit,
  selection_id: selection,
  version: 1,
  approved_at: "2026-08-01",
});

const issued = (selection: string, revision: number): IssuedRevision => ({
  selection_id: selection,
  revision_no: revision,
});

test("the issued revision's budget is pullable, the superseded one is not", () => {
  const rows = classifyBudgetChooser(
    [budget("b-r1", "villa", "sel-r1"), budget("b-r2", "villa", "sel-r2")],
    new Map([["villa", issued("sel-r2", 2)]]),
  );
  assert.equal(rows.length, 1);
  assert.ok(rows[0].kind === "pullable");
  assert.equal(rows[0].budget.budget_id, "b-r2");
  assert.equal(rows[0].revision_no, 2);
});

test("a unit whose new revision has no approved budget yet shows one pending row", () => {
  // R2 is issued but only R1's budget is approved — the unit is paused,
  // not silently offered the old design.
  const rows = classifyBudgetChooser(
    [budget("b-r1-v1", "villa", "sel-r1"), budget("b-r1-v2", "villa", "sel-r1")],
    new Map([["villa", issued("sel-r2", 2)]]),
  );
  assert.deepEqual(rows, [{ kind: "pending", unit_id: "villa", revision_no: 2 }]);
});

test("units classify independently", () => {
  const rows = classifyBudgetChooser(
    [budget("b-a", "unit-a", "sel-a1"), budget("b-b", "unit-b", "sel-b1")],
    new Map([
      ["unit-a", issued("sel-a1", 1)],
      ["unit-b", issued("sel-b2", 2)],
    ]),
  );
  assert.deepEqual(
    rows.map((row) => row.kind),
    ["pullable", "pending"],
  );
});

test("a unit with no issued revision contributes nothing", () => {
  const rows = classifyBudgetChooser([budget("b", "villa", "sel-r1")], new Map());
  assert.deepEqual(rows, []);
});

const line = (key: string, item: string, quantity: number, space: string): DriftLine => ({
  line_key: key,
  item_id: item,
  quantity,
  unit_space_id: space,
});

test("drift: untouched lines are absent from the map", () => {
  const lines = [line("a", "sofa", 2, "living")];
  const drift = classifyDesignDrift(["a"], lines, lines);
  assert.equal(drift.size, 0);
});

test("drift: quantity change, item swap and space move all count as changed", () => {
  const anchored = [
    line("qty", "sofa", 2, "living"),
    line("swap", "sofa", 1, "living"),
    line("move", "sofa", 1, "living"),
  ];
  const latest = [
    line("qty", "sofa", 5, "living"),
    line("swap", "armchair", 1, "living"),
    line("move", "sofa", 1, "bed1"),
  ];
  const drift = classifyDesignDrift(["qty", "swap", "move"], anchored, latest);
  assert.equal(drift.get("qty"), "changed");
  assert.equal(drift.get("swap"), "changed");
  assert.equal(drift.get("move"), "changed");
});

test("drift: a line gone from the latest revision is removed", () => {
  const drift = classifyDesignDrift(["gone"], [line("gone", "sofa", 1, "living")], []);
  assert.equal(drift.get("gone"), "removed");
});

test("drift: only the asked-about keys are classified", () => {
  // The latest revision may have added lines the indent never touched —
  // they are not drift on this indent.
  const drift = classifyDesignDrift(
    ["mine"],
    [line("mine", "sofa", 1, "living")],
    [line("mine", "sofa", 1, "living"), line("new", "lamp", 2, "bed1")],
  );
  assert.equal(drift.size, 0);
});

test("estimate pull: an unlinked material cannot be pulled", () => {
  assert.deepEqual(
    classifyEstimatePull({
      quantity: 50,
      material_uom: "bag",
      item_id: null,
      item_default_uom: null,
      item_uom_factor: null,
    }),
    { state: "unlinked" },
  );
});

test("estimate pull: matching units prefill as-is; nos and each are one unit", () => {
  assert.deepEqual(
    classifyEstimatePull({
      quantity: 50,
      material_uom: "Bag",
      item_id: "i1",
      item_default_uom: "bag",
      item_uom_factor: null,
    }),
    { state: "ready", prefillQty: 50 },
  );
  assert.deepEqual(
    classifyEstimatePull({
      quantity: 12,
      material_uom: "nos",
      item_id: "i1",
      item_default_uom: "each",
      item_uom_factor: null,
    }),
    { state: "ready", prefillQty: 12 },
  );
});

test("estimate pull: a factor converts into the item's unit", () => {
  assert.deepEqual(
    classifyEstimatePull({
      quantity: 2,
      material_uom: "cum",
      item_id: "i1",
      item_default_uom: "cft",
      item_uom_factor: 35.31,
    }),
    { state: "ready", prefillQty: 70.62 },
  );
});

const fact = (
  work: string,
  item: string | null,
  quantity: number,
  uom: string,
  factor: number | null = null,
  name = "cement",
): EstimateFact => ({
  work_item_id: work,
  material_name: name,
  uom,
  quantity,
  item_id: item,
  item_uom_factor: factor,
});

test("estimate pull groups by ITEM, so rows with no material id are seen (BUGCATCHER #16)", () => {
  // Since 0086 every takeoff row names its item and carries no material
  // id — the old pull keyed on material_id and saw an empty estimate.
  const groups = groupEstimatePull(
    [fact("slab", "cement", 40, "bag"), fact("footing", "cement", 10.5, "bag")],
    new Map([["cement", "bag"]]),
  );
  assert.equal(groups.length, 1);
  assert.equal(groups[0].key, "cement");
  assert.equal(groups[0].work_count, 2);
  assert.deepEqual(groups[0].estimate_parts, [{ quantity: 50.5, uom: "bag" }]);
  assert.deepEqual(groups[0].verdict, { state: "ready", prefillQty: 50.5 });
});

test("estimate pull: an older row converts through its own factor before adding up", () => {
  const groups = groupEstimatePull(
    [
      fact("slab", "sand", 2, "cum", 35.31, "sand"),
      fact("plaster", "sand", 10, "cft", null, "sand"),
    ],
    new Map([["sand", "cft"]]),
  );
  assert.deepEqual(groups[0].verdict, { state: "ready", prefillQty: 80.62 });
  assert.deepEqual(groups[0].estimate_parts, [
    { quantity: 2, uom: "cum" },
    { quantity: 10, uom: "cft" },
  ]);
});

test("estimate pull: one unconvertible row makes the whole item ask a person", () => {
  const groups = groupEstimatePull(
    [fact("slab", "cement", 8, "cft"), fact("footing", "cement", 2, "bag")],
    new Map([["cement", "bag"]]),
  );
  assert.deepEqual(groups[0].verdict, { state: "needs_qty" });
});

test("estimate pull: an older row with no item stays its own unpickable row", () => {
  const groups = groupEstimatePull(
    [fact("slab", null, 3, "cum", null, "old sand"), fact("slab", "cement", 5, "bag")],
    new Map([["cement", "bag"]]),
  );
  const unlinked = groups.find((group) => group.item_id === null);
  assert.equal(unlinked?.key, "unlinked:old sand");
  assert.deepEqual(unlinked?.verdict, { state: "unlinked" });
});

test("already requested counts every estimate the villa has had, and marks this indent", () => {
  // 5 bags pulled against the superseded EST/…/001 are still cement on its
  // way to the same villa — the staging case that exposed the gap.
  const { requested, onThisIndent } = requestedByItem(
    [
      { item_id: "cement", quantity: 5, indent_id: "ind-25" },
      { item_id: "cement", quantity: 10, indent_id: "ind-26" },
      { item_id: "steel", quantity: 100, indent_id: "ind-27" },
    ],
    "ind-27",
  );
  assert.equal(requested.get("cement"), 15);
  assert.deepEqual([...onThisIndent], ["steel"]);
});

test("estimate pull: differing units with no factor ask a person instead of guessing", () => {
  assert.deepEqual(
    classifyEstimatePull({
      quantity: 100,
      material_uom: "sqm",
      item_id: "i1",
      item_default_uom: "sqft",
      item_uom_factor: null,
    }),
    { state: "needs_qty" },
  );
});
