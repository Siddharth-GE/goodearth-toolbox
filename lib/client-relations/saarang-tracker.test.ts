/**
 * Reading the Saarang Tracker's export: which Masters plot a label means,
 * and when two spellings are the same buyer.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { configuration, sameName, trackerBuyer, trackerPlot } from "./saarang-tracker";

test("a tracker label names a Masters plot", () => {
  assert.deepEqual(trackerPlot("Plot 01"), {
    project: "Saarang - Villas",
    code: "P1",
    name: "Plot 1",
    numbers: [1],
  });
  assert.deepEqual(trackerPlot("Plot 22-23"), {
    project: "Saarang - Villas",
    code: "P22-23",
    name: "Plot 22 & 23",
    numbers: [22, 23],
  });
  assert.deepEqual(trackerPlot("P3 05"), {
    project: "Saarang West - Villas",
    code: "W5",
    name: "Plot 5",
    numbers: [5],
  });
  assert.equal(trackerPlot("P3 21-22")?.code, "W21-22");
  assert.equal(trackerPlot("P3 21-22")?.name, "Plot 21 & 22");
  assert.equal(trackerPlot(" Plot 9 ")?.code, "P9");
  assert.equal(trackerPlot("Villa 9"), null);
  assert.equal(trackerPlot("Plot 00"), null);
  assert.equal(trackerPlot("All"), null);
});

test("the same buyer, spelled two ways", () => {
  assert.ok(sameName("Manoj and sheela", "Manoj and Sheela"));
  assert.ok(sameName("Hari & Vidhya", "Hari and Vidhya"));
  assert.ok(sameName("Mr. Thyagarajan", "Thyagarajan"));
  assert.ok(sameName("Mrs. Aruna  Gopakumar", "Aruna Gopakumar"));
  assert.ok(!sameName("Aravind", "Aravind Reddy"));
  assert.ok(!sameName("Sangeeta & Coumarane", "Sangeeta Mathrani & Rajesh Mathrani"));
  // A name that is all title keeps it, rather than matching every other.
  assert.ok(!sameName("Mr", "Ms"));
});

test("available is no buyer", () => {
  assert.equal(trackerBuyer("Available"), null);
  assert.equal(trackerBuyer(" "), null);
  assert.equal(trackerBuyer(undefined), null);
  assert.equal(trackerBuyer("Nithya"), "Nithya");
});

test("one configuration, one spelling", () => {
  assert.equal(configuration("2 BHK G+1"), "2BHK G+1");
  assert.equal(configuration("1BHK  Study"), "1BHK Study");
  assert.equal(configuration(""), null);
});
