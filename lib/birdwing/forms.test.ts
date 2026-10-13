/**
 * What Birdwing's forms accept and the sentence they refuse with.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isRealDate,
  parseCount,
  parseGstPct,
  parseMonth,
  parseQty,
  parseRoomNights,
  parseRupees,
  parseStayDates,
  parseUse,
} from "./forms";

test("dates: real ones only, departure not before arrival", () => {
  assert.equal(isRealDate("2026-02-31"), false);
  assert.equal(isRealDate("2026-11-06"), true);
  assert.deepEqual(parseStayDates("2026-11-06", "2026-11-08"), {
    ok: true,
    value: { arrival: "2026-11-06", departure: "2026-11-08" },
  });
  assert.equal(parseStayDates("2026-11-06", "2026-11-06").ok, true); // a day visit
  assert.equal(parseStayDates("2026-11-08", "2026-11-06").ok, false);
  assert.equal(parseStayDates("2026-11-06", "2027-11-06").ok, false);
});

test("a room's nights sit inside the stay and number at least one", () => {
  const stay = { arrival: "2026-11-06", departure: "2026-11-09" };
  assert.equal(parseRoomNights("2026-11-06", "2026-11-09", stay).ok, true);
  assert.equal(parseRoomNights("2026-11-08", "2026-11-09", stay).ok, true);
  assert.equal(parseRoomNights("2026-11-06", "2026-11-06", stay).ok, false);
  assert.equal(parseRoomNights("2026-11-05", "2026-11-07", stay).ok, false);
  assert.equal(parseRoomNights("2026-11-07", "2026-11-10", stay).ok, false);
});

test("counts: blank is nought, junk is refused", () => {
  assert.deepEqual(parseCount("", "Adults"), { ok: true, value: 0 });
  assert.deepEqual(parseCount(" 3 ", "Adults"), { ok: true, value: 3 });
  assert.equal(parseCount("2.5", "Adults").ok, false);
  assert.equal(parseCount("-1", "Adults").ok, false);
});

test("rupees the way people type them", () => {
  assert.deepEqual(parseRupees("₹ 1,20,000", "Amount", { blank: null }), {
    ok: true,
    value: 120000,
  });
  assert.deepEqual(parseRupees("", "Discount", { blank: 0 }), { ok: true, value: 0 });
  assert.deepEqual(parseRupees("4500.50", "Amount", { blank: null }), { ok: true, value: 4500.5 });
  assert.equal(parseRupees("4500.505", "Amount", { blank: null }).ok, false);
  assert.equal(parseRupees("-5", "Amount", { blank: null }).ok, false);
  assert.equal(parseRupees("0", "Amount", { blank: null, positive: true }).ok, false);
  assert.equal(parseRupees("abc", "Amount", { blank: null }).ok, false);
});

test("quantity, GST, use and month", () => {
  assert.deepEqual(parseQty("1.5"), { ok: true, value: 1.5 });
  assert.equal(parseQty("0").ok, false);
  assert.deepEqual(parseGstPct("18%"), { ok: true, value: 18 });
  assert.equal(parseGstPct("40").ok, false);
  assert.equal(parseUse("guest").ok, true);
  assert.equal(parseUse("friend").ok, false);
  assert.deepEqual(parseMonth("2026-11"), { ok: true, value: "2026-11-01" });
  assert.equal(parseMonth("2026-13").ok, false);
});
