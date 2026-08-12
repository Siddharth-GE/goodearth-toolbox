import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ACCENT_TOKEN,
  CHART_SLOT_COUNT,
  EMPHASIS_REST_TOKEN,
  OTHER_SERIES,
  assignSlots,
  chartToken,
  measureColors,
} from "./palette";

test("slots follow entity order, never rank", () => {
  const universe = ["Cement", "Sand", "Steel"];
  const all = assignSlots(universe, universe);
  assert.deepEqual(
    all.series.map((s) => [s.id, s.slot]),
    [
      ["Cement", 1],
      ["Sand", 2],
      ["Steel", 3],
    ],
  );

  // A filter drops Sand: the survivors keep their colours.
  const filtered = assignSlots(["Cement", "Steel"], universe);
  assert.deepEqual(
    filtered.series.map((s) => [s.id, s.slot]),
    [
      ["Cement", 1],
      ["Steel", 3],
    ],
  );
});

test("the ninth entity folds into Other — a ninth hue is never generated", () => {
  const ids = Array.from({ length: 11 }, (_, i) => `S${i + 1}`);
  const plan = assignSlots(ids);
  const direct = plan.series.filter((s) => s.id !== OTHER_SERIES);
  assert.equal(direct.length, CHART_SLOT_COUNT - 1);
  assert.deepEqual(plan.folded, ["S8", "S9", "S10", "S11"]);
  const other = plan.series.find((s) => s.id === OTHER_SERIES);
  assert.equal(other?.slot, CHART_SLOT_COUNT);
  for (const s of plan.series) {
    assert.ok(s.slot >= 1 && s.slot <= CHART_SLOT_COUNT);
    assert.match(s.token, /^var\(--chart-[1-8]\)$/);
  }
});

test("exactly eight entities all get their own slot — no needless Other", () => {
  const ids = Array.from({ length: 8 }, (_, i) => `S${i + 1}`);
  const plan = assignSlots(ids);
  assert.equal(plan.series.length, 8);
  assert.deepEqual(plan.folded, []);
  assert.ok(!plan.series.some((s) => s.id === OTHER_SERIES));
});

test("status colours are never issued as series colours", () => {
  const plan = assignSlots(["a", "b", "c", "d", "e", "f", "g", "h", "i"]);
  for (const s of plan.series) {
    assert.ok(!/success|warning|danger|info/.test(s.token), s.token);
  }
});

test("a single measure wears the accent; emphasis greys the rest", () => {
  assert.deepEqual(measureColors(["m1"]), { m1: ACCENT_TOKEN });

  const emphasised = measureColors(["m1", "m2", "m3"], "m2");
  assert.equal(emphasised.m2, ACCENT_TOKEN);
  assert.equal(emphasised.m1, EMPHASIS_REST_TOKEN);
  assert.equal(emphasised.m3, EMPHASIS_REST_TOKEN);

  const plain = measureColors(["m1", "m2"]);
  assert.equal(plain.m1, chartToken(1));
  assert.equal(plain.m2, chartToken(2));
});
