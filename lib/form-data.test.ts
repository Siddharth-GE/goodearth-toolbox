/**
 * Form reading rules.
 *
 * Worth pinning because these helpers replace three identical private
 * copies and two near-identical parsers — the point of one home is that
 * every screen reads a blank, a space and a rupee sign the same way.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { optionalText, parseNumber, text } from "./form-data";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

test("text trims and treats a missing field as empty", () => {
  assert.equal(text(form({ name: "  Villa 12  " }), "name"), "Villa 12");
  assert.equal(text(form({}), "name"), "");
  assert.equal(text(form({ name: "   " }), "name"), "");
});

test("optionalText turns a blank into null for optional columns", () => {
  assert.equal(optionalText(form({ note: "  " }), "note"), null);
  assert.equal(optionalText(form({}), "note"), null);
  assert.equal(optionalText(form({ note: " kept " }), "note"), "kept");
});

test("parseNumber reads numbers the way people type them", () => {
  assert.equal(parseNumber("1,20,000"), 120000);
  assert.equal(parseNumber("₹ 450"), 450);
  assert.equal(parseNumber(" 12.5 "), 12.5);
  assert.equal(parseNumber("0"), 0);
});

test("parseNumber separates blank from zero and flags junk", () => {
  assert.equal(parseNumber(""), null);
  assert.equal(parseNumber("   "), null);
  assert.equal(parseNumber(null), null);
  assert.ok(Number.isNaN(parseNumber("twelve")));
});
