/**
 * The parser is the only validation a plan document gets.
 *
 * It is stored as one jsonb column, which Postgres cannot check
 * (0048 §1), and it is written by the browser. So everything that would
 * normally be a column constraint is a test here instead.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  cloneInputs,
  defaultPlanInputs,
  MAX_HORIZON_MONTHS,
  newSaleLine,
  parsePlanInputs,
  PLAN_SCHEMA_VERSION,
} from "./inputs";
import { viharaPlan } from "./vihara-fixture";

test("nothing at all still opens as a plan", () => {
  for (const nothing of [null, undefined, 0, "", [], "a string"]) {
    const parsed = parsePlanInputs(nothing);
    assert.equal(parsed.horizonMonths, 72);
    assert.equal(parsed.lines.length, 0);
  }
});

test("a document written before a field existed gains the default", () => {
  // The whole reason inputs live behind a parser: version 1 of this
  // model has no idea what version 3 will add, and an old plan must
  // still open rather than erroring or rendering NaN.
  const old = { horizonMonths: 48, lines: [{ kind: "sale", name: "Villas", units: 12 }] };
  const parsed = parsePlanInputs(old);
  assert.equal(parsed.horizonMonths, 48);
  assert.equal(parsed.financingRatePct, 15);
  assert.equal(parsed.instalments, 10);
  assert.equal(parsed.lines[0].name, "Villas");
  assert.equal(parsed.lines[0].kind, "sale");
});

test("NaN and Infinity never make it into a plan", () => {
  // One NaN poisons every total downstream and shows up as a blank cell
  // that nobody can explain.
  const parsed = parsePlanInputs({
    financingRatePct: Number.NaN,
    openingEquity: Number.POSITIVE_INFINITY,
    lines: [
      { kind: "sale", units: Number.NaN, velocity: [Number.NaN, 2, Number.NEGATIVE_INFINITY] },
    ],
  });
  assert.equal(parsed.financingRatePct, 15);
  assert.equal(parsed.openingEquity, 0);
  const line = parsed.lines[0];
  assert.ok(line.kind === "sale");
  assert.equal(line.units, 0);
  assert.deepEqual(line.velocity, [0, 2, 0]);
});

test("negative money and areas are clamped to zero", () => {
  const parsed = parsePlanInputs({
    openingEquity: -5,
    lines: [{ kind: "sale", units: -3, landAreaSqft: -1000, housePricePsf: -50 }],
  });
  assert.equal(parsed.openingEquity, 0);
  const line = parsed.lines[0];
  assert.ok(line.kind === "sale");
  assert.equal(line.units, 0);
  assert.equal(line.landAreaSqft, 0);
  assert.equal(line.housePricePsf, 0);
});

test("the horizon cannot be talked into allocating a huge array", () => {
  assert.equal(parsePlanInputs({ horizonMonths: 999_999 }).horizonMonths, MAX_HORIZON_MONTHS);
  assert.equal(parsePlanInputs({ horizonMonths: 0 }).horizonMonths, 1);
  assert.equal(parsePlanInputs({ horizonMonths: -12 }).horizonMonths, 1);
});

test("a build cycle of zero becomes one month, not a division by zero", () => {
  const parsed = parsePlanInputs({ lines: [{ kind: "sale", buildMonths: 0 }] });
  const line = parsed.lines[0];
  assert.ok(line.kind === "sale");
  assert.equal(line.buildMonths, 1);
  assert.equal(parsePlanInputs({ instalments: 0 }).instalments, 1);
});

test("an unrecognised line kind is dropped, not guessed at", () => {
  // Guessing would silently turn a line written by a newer version of
  // the app into a SALE line worth nothing, which reads as a real
  // number rather than as missing.
  const parsed = parsePlanInputs({
    lines: [{ kind: "sale", name: "Keep" }, { kind: "lease", name: "Drop" }, { name: "No kind" }],
  });
  assert.equal(parsed.lines.length, 1);
  assert.equal(parsed.lines[0].name, "Keep");
});

test("a line with no id gets one", () => {
  const parsed = parsePlanInputs({ lines: [{ kind: "sale" }, { kind: "sale" }] });
  assert.ok(parsed.lines[0].id);
  assert.notEqual(parsed.lines[0].id, parsed.lines[1].id);
});

test("percentages are percents, and round-trip unchanged", () => {
  // Rule 2 at the top of inputs.ts. 15 means 15%, and a save/reload must
  // not turn it into 0.15 or 1500.
  const plan = viharaPlan();
  const round = parsePlanInputs(JSON.parse(JSON.stringify(plan)));
  assert.equal(round.financingRatePct, 15);
  assert.equal(round.landPremiumPct, 30);
  assert.equal(round.bookingPct, 30);
  const rowHouses = round.lines[1];
  assert.ok(rowHouses.kind === "sale");
  assert.equal(rowHouses.launchTriggerPct, 70);
  assert.deepEqual(round, plan);
});

test("an explicit null override stays null rather than becoming a number", () => {
  // A line's bookingPct of null means "use the plan's", which is not the
  // same as 0% down.
  const parsed = parsePlanInputs({
    lines: [{ kind: "sale", bookingPct: null, instalments: null }],
  });
  const line = parsed.lines[0];
  assert.ok(line.kind === "sale");
  assert.equal(line.bookingPct, null);
  assert.equal(line.instalments, null);
});

test("duplicating a plan gives every row a fresh id and changes nothing else", () => {
  const original = viharaPlan();
  const copy = cloneInputs(original);

  assert.notEqual(copy.lines[0].id, original.lines[0].id);
  assert.notEqual(copy.overheads[0].id, original.overheads[0].id);
  assert.notEqual(copy.commonInfra[0].id, original.commonInfra[0].id);

  // Everything except the ids is identical.
  const stripIds = (plan: ReturnType<typeof viharaPlan>) =>
    JSON.stringify(plan, (key, value) => (key === "id" ? undefined : value));
  assert.equal(stripIds(copy), stripIds(original));

  // And the copy's velocity array is its own, not shared with the source.
  const copied = copy.lines[0];
  const source = original.lines[0];
  assert.ok(copied.kind === "sale" && source.kind === "sale");
  assert.notEqual(copied.velocity, source.velocity);
});

test("a new plan starts empty rather than full of someone else's numbers", () => {
  const plan = defaultPlanInputs();
  assert.equal(plan.lines.length, 0);
  assert.equal(plan.overheads.length, 0);
  assert.equal(plan.commonInfra.length, 0);
  assert.equal(plan.activeScenario, 1);
  assert.equal(PLAN_SCHEMA_VERSION, 1);
});

test("a new line is inert until it is filled in", () => {
  const line = newSaleLine("Row houses");
  assert.equal(line.name, "Row houses");
  assert.equal(line.units, 0);
  assert.equal(line.launchTriggerPct, null);
});
