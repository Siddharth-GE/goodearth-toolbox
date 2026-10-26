import assert from "node:assert/strict";
import { test } from "node:test";
import { filterRateBook, rateBookParams, type RateBookListRow } from "./rate-book-list";

const work = (code: string, over: Partial<RateBookListRow> = {}): RateBookListRow => ({
  code,
  name: "Brick masonry",
  groupName: "Masonry",
  category: "SS — Superstructure",
  categoryCode: "SS",
  uom: "cum",
  componentCount: 2,
  rate: 5000,
  lineCount: 0,
  componentNames: [],
  ...over,
});

const rows = [
  work("SS.01", { componentNames: ["Cement mortar 1:6", "Wire cut brick"] }),
  work("CAR.02", { name: "Shutter", categoryCode: "CAR", uom: null, rate: null }),
  work("F.01", { name: "Painting", categoryCode: "F", componentCount: 0, rate: null }),
  work("F.02", { name: "Tiling", categoryCode: "F", rate: null, lineCount: 3 }),
];

const codes = (list: RateBookListRow[]) => list.map((row) => row.code);

test("a show that is not on the list is dropped", () => {
  assert.equal(rateBookParams({ show: "constructor" }).show, undefined);
  assert.deepEqual(rateBookParams({ show: "nonsense", q: "  " }), {
    q: undefined,
    category: undefined,
    show: undefined,
  });
});

test("search finds a work by a material or mix inside it", () => {
  assert.deepEqual(codes(filterRateBook(rows, { q: "wire cut" })), ["SS.01"]);
  assert.deepEqual(codes(filterRateBook(rows, { q: "shutter" })), ["CAR.02"]);
});

test("filters by category and by state", () => {
  assert.deepEqual(codes(filterRateBook(rows, { category: "F" })), ["F.01", "F.02"]);
  assert.deepEqual(codes(filterRateBook(rows, { show: "unset" })), ["CAR.02"]);
  assert.deepEqual(codes(filterRateBook(rows, { show: "unpriced" })), ["F.01", "F.02"]);
  assert.deepEqual(codes(filterRateBook(rows, { show: "labour" })), ["F.01"]);
  assert.deepEqual(codes(filterRateBook(rows, { show: "todo" })), ["F.02"]);
  assert.deepEqual(codes(filterRateBook(rows, { show: "priced" })), ["SS.01"]);
});
