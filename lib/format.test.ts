/**
 * Formatting rules.
 *
 * Worth testing because these are the numbers people act on — a quantity
 * that reads differently on a screen and on the PDF generated from it is
 * how a client ends up querying an invoice, and a missing price that
 * renders as zero is how something gets given away.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  formatAmount,
  formatCount,
  formatDate,
  formatMoney,
  formatPercent,
  formatQuantity,
  formatTime,
} from "./format";

test("money groups in lakhs, not thousands", () => {
  // Indian grouping: 12,34,567 — not 1,234,567. Getting this wrong makes
  // every figure in the app read as a foreign document.
  assert.match(formatMoney(1234567), /12,34,567/);
  assert.match(formatMoney(1234567), /₹/);
});

test("missing money is a dash, never zero", () => {
  // The failure this exists to prevent: an unpriced line reading as free
  // on something a client sees.
  assert.equal(formatMoney(null), "—");
  assert.equal(formatMoney(undefined), "—");
  assert.equal(formatMoney(Number.NaN), "—");
  // Zero is a real price and must still show as one.
  assert.match(formatMoney(0), /0/);
});

test("print amounts carry no rupee symbol", () => {
  // Helvetica, which react-pdf embeds, has no ₹ glyph — including one
  // puts a blank box on every amount of every document we send.
  assert.equal(formatAmount(1234567), "12,34,567");
  assert.ok(!formatAmount(1234567).includes("₹"));
  assert.equal(formatAmount(null), "—");
});

test("screen and print agree on the digits", () => {
  // The same number, written two ways, must differ only by the symbol.
  const value = 4560000;
  assert.equal(formatMoney(value).replace("₹", ""), formatAmount(value));
});

test("quantities are grouped and drop trailing zeroes", () => {
  // The bug this replaces: the PDF's own formatter returned "12345"
  // ungrouped while the screen showed "12,345", and turned 2.125 into
  // 2.13.
  assert.equal(formatQuantity(12345), "12,345");
  assert.equal(formatQuantity(2.125), "2.125");
  assert.equal(formatQuantity(2.5), "2.5");
  assert.equal(formatQuantity(2), "2");
});

test("percentages keep meaningful decimals and drop empty ones", () => {
  assert.equal(formatPercent(12.5), "12.5%");
  assert.equal(formatPercent(20), "20%");
  assert.equal(formatPercent(null), "—");
});

test("dates are day-first and unambiguous", () => {
  // "01 Aug 2026" rather than 1/8/2026, which reads as January 8th to
  // half the world.
  const formatted = formatDate("2026-08-01T10:30:00Z");
  assert.match(formatted, /01/);
  assert.match(formatted, /Aug/);
  assert.match(formatted, /2026/);
  assert.equal(formatDate(null), "—");
  assert.equal(formatDate("not a date"), "—");
});

test("times show hour and minute", () => {
  assert.match(formatTime("2026-08-01T10:30:00Z"), /\d{1,2}:\d{2}/);
  assert.equal(formatTime(null), "—");
});

test("counts group without a currency symbol", () => {
  assert.equal(formatCount(2633), "2,633");
  assert.ok(!formatCount(2633).includes("₹"));
});
