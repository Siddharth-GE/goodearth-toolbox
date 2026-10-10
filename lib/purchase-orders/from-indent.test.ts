/**
 * A PO from an indent: what is left to buy (cancelled POs give their
 * quantity back), which vendor and rate to suggest (only real purchases,
 * newest first), and the split into one PO per vendor.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  leftToBuy,
  orderedByIndentLine,
  picksProblem,
  priceKey,
  purchaseHistory,
  splitByVendor,
  type IndentPick,
} from "./from-indent";

test("ordered so far skips cancelled POs and direct lines", () => {
  const ordered = orderedByIndentLine([
    { indent_line_id: "a", quantity: 10, status: "issued" },
    { indent_line_id: "a", quantity: 5, status: "draft" },
    { indent_line_id: "a", quantity: 40, status: "cancelled" },
    { indent_line_id: null, quantity: 99, status: "issued" },
    { indent_line_id: "b", quantity: 2, status: "completed" },
  ]);
  assert.equal(ordered.get("a"), 15);
  assert.equal(ordered.get("b"), 2);
  assert.equal(ordered.size, 2);
});

test("left to buy never goes below zero and drops float dust", () => {
  assert.equal(leftToBuy(100, 30), 70);
  assert.equal(leftToBuy(10, 12), 0);
  assert.equal(leftToBuy(0.3, 0.1), 0.2);
});

test("the suggested vendor is the last one actually bought from, with their rate", () => {
  const { lastVendor, lastPrice } = purchaseHistory([
    {
      item_id: "cem",
      vendor_id: "malabar",
      rate: 380,
      gst_pct: 18,
      at: "2026-09-01",
      status: "issued",
    },
    {
      item_id: "cem",
      vendor_id: "kk",
      rate: 395,
      gst_pct: 18,
      at: "2026-10-01",
      status: "completed",
    },
    // A newer draft and a newer cancelled PO are not purchases.
    {
      item_id: "cem",
      vendor_id: "draftco",
      rate: 300,
      gst_pct: 18,
      at: "2026-10-05",
      status: "draft",
    },
    {
      item_id: "cem",
      vendor_id: "gone",
      rate: 200,
      gst_pct: 18,
      at: "2026-10-06",
      status: "cancelled",
    },
    // Nor is a line that never carried a rate.
    {
      item_id: "cem",
      vendor_id: "norate",
      rate: null,
      gst_pct: null,
      at: "2026-10-07",
      status: "issued",
    },
    {
      item_id: "cem",
      vendor_id: "malabar",
      rate: 360,
      gst_pct: 18,
      at: "2026-08-01",
      status: "issued",
    },
  ]);
  assert.deepEqual(lastVendor.get("cem"), { vendorId: "kk", rate: 395, gstPct: 18 });
  assert.deepEqual(lastPrice.get(priceKey("cem", "malabar")), { rate: 380, gstPct: 18 });
  assert.equal(lastPrice.has(priceKey("cem", "draftco")), false);
  assert.equal(lastVendor.has("sand"), false);
});

const pick = (over: Partial<IndentPick> = {}): IndentPick => ({
  indentLineId: "a",
  quantity: 10,
  vendorId: "v1",
  rate: 100,
  gstPct: 18,
  ...over,
});

test("what stops Create is said in words", () => {
  const left = new Map([
    ["a", 10],
    ["b", 5],
  ]);
  assert.equal(picksProblem([pick(), pick({ indentLineId: "b", quantity: 5 })], left), undefined);
  assert.match(picksProblem([], left) ?? "", /at least one/);
  assert.match(picksProblem([pick(), pick()], left) ?? "", /twice/);
  assert.match(picksProblem([pick({ indentLineId: "z" })], left) ?? "", /no longer/);
  assert.match(picksProblem([pick({ vendorId: "" })], left) ?? "", /needs a vendor/);
  assert.match(picksProblem([pick({ quantity: 0 })], left) ?? "", /more than 0/);
  assert.match(picksProblem([pick({ quantity: 10.5 })], left) ?? "", /more than is left/);
  assert.match(picksProblem([pick({ rate: -1 })], left) ?? "", /negative/);
  // An unpriced line is fine: it is priced on the draft PO.
  assert.equal(picksProblem([pick({ rate: null, gstPct: null })], left), undefined);
});

test("one PO per vendor, vendors in the order they first appear", () => {
  const groups = splitByVendor([
    pick({ indentLineId: "a", vendorId: "kk" }),
    pick({ indentLineId: "b", vendorId: "malabar" }),
    pick({ indentLineId: "c", vendorId: "kk" }),
  ]);
  assert.deepEqual(
    groups.map((group) => [group.vendorId, group.lines.map((line) => line.indentLineId)]),
    [
      ["kk", ["a", "c"]],
      ["malabar", ["b"]],
    ],
  );
});
