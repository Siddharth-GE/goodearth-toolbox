// These words are the contract between screen and file, and they carry no dataset-specific case.
import assert from "node:assert/strict";
import { test } from "node:test";

import { aggLabel, measureLabel, opLabel } from "./labels";

test("date fields get their own gte/lte wording", () => {
  assert.equal(opLabel("gte", "date"), "on or after");
  assert.equal(opLabel("lte", "date"), "on or before");
});

test("non-date fields keep the plain comparison wording for gte/lte", () => {
  assert.equal(opLabel("gte", "number"), "at least");
  assert.equal(opLabel("lte", "number"), "at most");
  assert.equal(opLabel("gte", "money"), "at least");
  assert.equal(opLabel("lte", "money"), "at most");
});

test("every op reads as a plain-English filter sentence", () => {
  assert.equal(opLabel("eq", "text"), "is");
  assert.equal(opLabel("neq", "text"), "is not");
  assert.equal(opLabel("gt", "number"), "more than");
  assert.equal(opLabel("lt", "number"), "less than");
  assert.equal(opLabel("contains", "text"), "contains");
});

test("aggLabel names every aggregate the report can compute", () => {
  assert.equal(aggLabel("sum"), "Total");
  assert.equal(aggLabel("avg"), "Average");
  assert.equal(aggLabel("min"), "Lowest");
  assert.equal(aggLabel("max"), "Highest");
  assert.equal(aggLabel("count"), "Count");
  assert.equal(aggLabel("count_distinct"), "Distinct count");
});

test("a measure heading lowercases the field into the sentence", () => {
  assert.equal(measureLabel("Quantity", "sum"), "Total quantity");
  assert.equal(measureLabel("Rate", "avg"), "Average rate");
  assert.equal(measureLabel("Quantity", "max"), "Highest quantity");
});

test("count skips the aggregate word — the field carries the sentence", () => {
  assert.equal(measureLabel("Item", "count"), "Item count");
});

test("count_distinct pluralises instead of repeating 'distinct count of'", () => {
  assert.equal(measureLabel("Vendor", "count_distinct"), "Distinct vendors");
  assert.equal(measureLabel("Project", "count_distinct"), "Distinct projects");
});
