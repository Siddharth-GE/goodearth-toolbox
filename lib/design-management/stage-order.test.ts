/** Pins how a design stage is placed and moved. */
import assert from "node:assert/strict";
import { test } from "node:test";

import { dropStage, placeStage, renumber, sameStages } from "./stage-order";

const STAGES = ["design", "permit", "wd", "interiors"];

test("a new stage goes where it is put, not only at the end", () => {
  assert.deepEqual(placeStage([...STAGES, "str"], "str", "wd"), [
    "design",
    "permit",
    "wd",
    "str",
    "interiors",
  ]);
  assert.deepEqual(placeStage([...STAGES, "brief"], "brief", "start"), ["brief", ...STAGES]);
  assert.deepEqual(placeStage([...STAGES, "mep"], "mep", "end"), [...STAGES, "mep"]);
  // A stage that went in the meantime: the end, not lost.
  assert.deepEqual(placeStage([...STAGES, "mep"], "mep", "gone"), [...STAGES, "mep"]);
});

test("a dragged stage lands in the place of the one it is dropped on", () => {
  assert.deepEqual(dropStage(STAGES, "interiors", "permit"), [
    "design",
    "interiors",
    "permit",
    "wd",
  ]);
  assert.deepEqual(dropStage(STAGES, "design", "wd"), ["permit", "wd", "design", "interiors"]);
  assert.deepEqual(dropStage(STAGES, "wd", "wd"), STAGES);
  assert.deepEqual(dropStage(STAGES, "wd", "gone"), STAGES);
});

test("only the stages whose number changes are written", () => {
  const current = new Map([
    ["design", 10],
    ["permit", 20],
    ["wd", 30],
    ["interiors", 40],
  ]);
  assert.deepEqual(renumber(["design", "wd", "permit", "interiors"], current), [
    { id: "wd", sortOrder: 20 },
    { id: "permit", sortOrder: 30 },
  ]);
  assert.deepEqual(renumber(STAGES, current), []);
});

test("an order is taken only when it names every stage once", () => {
  assert.equal(sameStages(["wd", "design", "interiors", "permit"], STAGES), true);
  assert.equal(sameStages(["wd", "design", "interiors"], STAGES), false);
  assert.equal(sameStages(["wd", "wd", "interiors", "permit"], STAGES), false);
  assert.equal(sameStages(["wd", "design", "interiors", "mep"], STAGES), false);
});
