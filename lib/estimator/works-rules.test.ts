import assert from "node:assert/strict";
import { test } from "node:test";
import { floorTwinKey, floorTwins } from "./works-rules";

test("the floor comes out of a work's name, wherever it sits", () => {
  assert.equal(floorTwinKey("Rough Plastering GF"), "rough plastering");
  assert.equal(floorTwinKey("Rough Plastering above FF"), "rough plastering");
  assert.equal(floorTwinKey("Ground Floor Lintel Beam"), "lintel beam");
  assert.equal(floorTwinKey("Second Floor Lintel Beam"), "lintel beam");
  assert.equal(floorTwinKey("GF column casting"), "column casting");
  assert.equal(floorTwinKey("Block Work SF"), "block work");
});

test("a floor word inside another word is left alone", () => {
  // "Floor Tiling" is a work in its own right, not a floor of one.
  assert.equal(floorTwinKey("Floor Tiling"), "floor tiling");
  assert.equal(floorTwinKey("Staff quarters"), "staff quarters");
});

test("floor twins: same work on another floor, never itself, never a different work", () => {
  const works = [
    { id: "SS.4", name: "1 side plastered wall masonry" },
    { id: "SS.20", name: "1 side plastered wall masonry" },
    { id: "SS.33", name: "1 side plastered wall masonry" },
    { id: "SS.5", name: "2 sides plastered wall masonry" },
    { id: "PF.16", name: "Screed concreting - Ground Floor" },
    { id: "PF.17", name: "Screed concreting - First Floor" },
    { id: "PF.18", name: "Screed concreting and grouting - Attic" },
  ];
  assert.deepEqual(
    floorTwins(works[0], works).map((work) => work.id),
    ["SS.20", "SS.33"],
  );
  assert.deepEqual(
    floorTwins(works[4], works).map((work) => work.id),
    ["PF.17"],
  );
});
