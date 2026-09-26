/**
 * The catalogue sheet matcher decides, for 2,793 rows, "this is an item we
 * already have" or "this is new" — and a wrong answer either duplicates a
 * product or puts one product's picture on another. Every case here is a
 * real one from the sheet of 2026-09-26.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  type CatalogueRow,
  type SheetRow,
  cleanLink,
  linkKey,
  matchSheet,
  nextCode,
  sheetPlacement,
  sheetUnit,
} from "./catalogue-sheet";

let nextRow = 3;
function row(fields: Partial<SheetRow>): SheetRow {
  return {
    row: nextRow++,
    code: null,
    placement: "Loose",
    type: "Seating",
    name: "Sofa",
    description: null,
    link: null,
    brand: null,
    remark: null,
    articleNo: null,
    unit: "No",
    price: null,
    pictures: [],
    ...fields,
  };
}
function item(fields: Partial<CatalogueRow> & { id: string }): CatalogueRow {
  return {
    code: null,
    name: "Sofa",
    description: null,
    brand: null,
    source_url: null,
    indicative_price: null,
    ...fields,
  };
}

test("a renumbered code does not decide the match — the content does", () => {
  // The sheet's SOFS018 is the toolbox's SOFS017: a row was inserted above.
  const items = [
    item({
      id: "a",
      code: "SOFS017",
      description: "2-seater, Ashwood sofa (2100L)",
      brand: "HOMEWORK",
    }),
    item({ id: "b", code: "SOFS018", description: "3-seater, Ashwood sofa", brand: "HOMEWORK" }),
  ];
  const rows = [
    row({ code: "SOFS017", description: "Teak wood 2 sofa", brand: "Noku" }),
    row({ code: "SOFS018", description: "2-seater, Ashwood sofa (2100L)", brand: "HOMEWORK " }),
  ];
  const result = matchSheet(rows, items);
  assert.equal(result.matched.length, 1);
  assert.equal(result.matched[0].row.code, "SOFS018");
  assert.equal(result.matched[0].item.id, "a");
  assert.deepEqual(
    result.fresh.map((r) => r.description),
    ["Teak wood 2 sofa"],
  );
});

test("look-alikes pair by price before order", () => {
  const items = [
    item({
      id: "small",
      description: "Ashwood bench.",
      brand: "HOMEWORK",
      indicative_price: 38527,
    }),
    item({
      id: "large",
      description: "Ashwood bench.",
      brand: "HOMEWORK",
      indicative_price: 65551,
    }),
  ];
  const rows = [
    row({ description: "Ashwood bench.", brand: "HOMEWORK", price: 65551.36 }),
    row({ description: "Ashwood bench.", brand: "HOMEWORK", price: 38527 }),
  ];
  const result = matchSheet(rows, items);
  assert.deepEqual(
    result.matched.map((m) => [m.row.price, m.item.id]),
    [
      [65551.36, "large"],
      [38527, "small"],
    ],
  );
});

test("a block pasted twice: the exact copy is skipped, not added", () => {
  const items = [
    item({
      id: "edita",
      code: "CONT001",
      description: "Ash veneer console table (1570L x 410W x 750H).",
      brand: "HOMEWORK",
      source_url: "https://homeworkliving.in/products/edita-console",
      indicative_price: 79920,
    }),
  ];
  const original = row({
    code: "CONT001",
    name: "Console",
    description: "Ash veneer console table (1570L x 410W x 750H).",
    brand: "HOMEWORK",
    link: "https://homeworkliving.in/products/edita-console",
    price: 79920.22,
  });
  const copy = { ...original, row: nextRow++, code: null, name: "console" };
  const result = matchSheet([original, copy], items);
  assert.equal(result.matched.length, 1);
  assert.equal(result.matched[0].row.row, original.row);
  assert.deepEqual(result.copies, [{ row: copy, of: original.row }]);
  assert.equal(result.fresh.length, 0);
});

test("pasted again with a corrected description, it is still the same console", () => {
  const link = "https://homeworkliving.in/products/eva-console";
  const items = [
    item({
      id: "eva",
      description: "console table (1200L × 300D × 750H).",
      brand: "HOMEWORK",
      source_url: link,
      indicative_price: 31792,
    }),
  ];
  const first = row({
    description: "console table (1200L × 300D × 750H).",
    brand: "HOMEWORK",
    link,
    price: 31792.4,
  });
  const again = row({
    description: "Ashwood console table (1200L × 300D × 750H).",
    brand: "HOMEWORK",
    link,
    price: 31792.4,
  });
  const result = matchSheet([first, again], items);
  assert.equal(result.matched.length, 1);
  assert.deepEqual(result.copies, [{ row: again, of: first.row }]);
  assert.equal(result.fresh.length, 0);
});

test("the same lamp at another price is a new item, not a duplicate", () => {
  const link =
    "https://in.shop.lighting.philips.com/products/philips-surface-deco-led-cob-light-copy?variant=45762394685630";
  const items = [
    item({
      id: "decl",
      description: "Ceiling lamp.",
      brand: "Philips",
      source_url: link,
      indicative_price: 2590,
    }),
  ];
  const rows = [
    row({ description: "Ceiling lamp.", brand: "Philips", link, price: 2590 }),
    row({ description: "Ceiling lamp.", brand: "Philips", link, price: 2090 }),
  ];
  const result = matchSheet(rows, items);
  assert.deepEqual(
    result.matched.map((m) => m.row.price),
    [2590],
  );
  assert.deepEqual(
    result.fresh.map((r) => r.price),
    [2090],
  );
});

test("a small change to the description makes a new item", () => {
  const items = [
    item({
      id: "old",
      description: "Teak wood sofa with upholstery.",
      brand: "Noku",
      indicative_price: 75520,
    }),
  ];
  const result = matchSheet(
    [row({ description: "Teak wood 3 sofa with upholstery.", brand: "Noku", price: 75520 })],
    items,
  );
  assert.equal(result.matched.length, 0);
  assert.equal(result.fresh.length, 1);
});

test("the same product page, brand and price is the same item even when rewritten", () => {
  const items = [
    item({
      id: "lunar",
      description: "21 X 20 X 22 CM, Metal, 6W",
      brand: "Whispering Homes",
      source_url: "https://www.whisperinghomes.com/product/lunar-crystal-wall-light",
      indicative_price: 3699,
    }),
  ];
  const rows = [
    row({
      description: "Lunar Crystal Wall Light – Elegant crystal-inspired wall light",
      brand: "Whispering Homes",
      link: "https://www.whisperinghomes.com/products/lunar-crystal-wall-light?_pos=1&_sid=abc",
      price: 3699,
    }),
  ];
  const result = matchSheet(rows, items);
  assert.equal(result.matched[0]?.item.id, "lunar");
  assert.equal(result.matched[0]?.rule, "same link, brand and price");
});

test("a row with no description is still found again on a second run", () => {
  // Wardrobe sensor light, Kaadal, ₹1,500 — a name and nothing else.
  const lone = row({ name: "Wardrobe sensor light", brand: "Kaadal", price: 1500 });
  const once = matchSheet([lone], []);
  assert.equal(once.fresh.length, 1);
  const twice = matchSheet(
    [lone],
    [item({ id: "new", name: "Wardrobe sensor light", brand: "Kaadal", indicative_price: 1500 })],
  );
  assert.equal(twice.matched[0]?.item.id, "new");
});

test("an item is never matched twice", () => {
  const items = [item({ id: "one", description: "Rug.", brand: "Troost" })];
  const rows = [
    row({ description: "Rug.", brand: "Troost", price: 100 }),
    row({ description: "Rug.", brand: "Troost", price: 200 }),
  ];
  const result = matchSheet(rows, items);
  assert.equal(result.matched.length, 1);
  assert.equal(result.fresh.length, 1);
});

test("links compare by page, not by tracking or www", () => {
  assert.equal(
    linkKey("https://www.whisperinghomes.com/product/kinzu-metal-wall-light-black?_gl=1*x&gclid=y"),
    linkKey("https://whisperinghomes.com/products/kinzu-metal-wall-light-black/"),
  );
  assert.equal(linkKey(null), "");
});

test("a stored link loses its tracking and keeps its variant", () => {
  assert.equal(
    cleanLink("https://www.whisperinghomes.com/products/x?_pos=56&_fid=63632f67e&_ss=c"),
    "https://www.whisperinghomes.com/products/x",
  );
  assert.equal(
    cleanLink("https://shop.example/products/lamp?variant=45762394685630&utm_source=g"),
    "https://shop.example/products/lamp?variant=45762394685630",
  );
  assert.equal(cleanLink("  "), null);
});

test("a new code follows the sheet's prefix and the toolbox's next number", () => {
  const taken = new Set(["CHAS001", "CHAS014", "CHAS2732", "FLOL009"]);
  assert.equal(nextCode("Chair", "Seating", taken), "CHAS015");
  assert.equal(nextCode("Floor Lamp", "Lighting & Electrical Fixtures", taken), "FLOL010");
  assert.equal(nextCode("Floor Lamp", "Lighting & Electrical Fixtures", taken), "FLOL011");
  assert.equal(nextCode(" console", "Tables", taken), "CONT001");
});

test("units and placements map, and an unknown unit is refused", () => {
  assert.equal(sheetUnit("No"), "each");
  assert.equal(sheetUnit(null), "each");
  assert.equal(sheetUnit("S.ft"), "sqft");
  assert.equal(sheetUnit("R.ft"), "rft");
  assert.equal(sheetUnit("bundle"), undefined);
  assert.equal(sheetPlacement("SOFT FURNISHING"), "soft_furnishing");
  assert.equal(sheetPlacement("Fixed"), "fixed");
  assert.equal(sheetPlacement(""), null);
});
