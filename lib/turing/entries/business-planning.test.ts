import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { checkProposal } from "../catalogue-fields";
import { COSTS, HOLD, MONTHS, SALE, SALE_OWN, SETUP, type PlanNumber } from "./business-planning";

const PLAN = "11111111-1111-4111-8111-111111111111";
const source = readFileSync("lib/business-planning/inputs.ts", "utf8");

const body = (name: string) => {
  const from = source.indexOf(`function ${name}(`);
  assert.ok(from >= 0, name);
  const to = source.indexOf("\nfunction ", from + 1);
  const next = source.indexOf("\nexport function ", from + 1);
  return source.slice(from, Math.min(...[to, next].filter((at) => at > 0), source.length));
};

/** The range the parser keeps a number to, read from how it parses it. */
function parsed(text: string, n: PlanNumber): Pick<PlanNumber, "min" | "max" | "whole"> {
  if (n.at !== undefined) {
    assert.ok(text.includes(`Math.max(0, num(velocity[${n.at}], 0))`), n.key);
    return { min: 0 };
  }
  const of = `(?:raw|item)\\.${n.prop}`;
  const month = text.match(new RegExp(`month\\(${of}, [^,)]+(?:, (\\d+))?\\)`));
  if (month) return { min: Number(month[1] ?? 1), max: MONTHS, whole: true };
  const clamped = text.match(
    new RegExp(`(Math\\.round\\()?clamped\\(${of}, [^,]+, ([\\d.]+), ([\\d.]+)\\)`),
  );
  if (clamped)
    return {
      min: Number(clamped[2]),
      max: Number(clamped[3]),
      ...(clamped[1] ? { whole: true as const } : {}),
    };
  assert.ok(new RegExp(`Math\\.max\\(0, num\\(${of}, [^)]+\\)\\)`).test(text), n.key);
  return { min: 0 };
}

const range = (n: PlanNumber) => ({
  min: n.min,
  ...(n.max !== undefined ? { max: n.max } : {}),
  ...(n.whole ? { whole: true } : {}),
});

test("every number is refused where the plan's parser would clamp it", () => {
  assert.match(source, new RegExp(`MAX_HORIZON_MONTHS = ${MONTHS};`));
  const lists: [string, PlanNumber[]][] = [
    ["parsePlanInputs", SETUP],
    ["parseSaleLine", [...SALE, ...SALE_OWN]],
    ["parseHoldLine", HOLD],
    ...Object.values(COSTS).map((cost): [string, PlanNumber[]] => [
      "parsePlanInputs",
      cost.numbers,
    ]),
  ];
  for (const [name, numbers] of lists) {
    const text = body(name);
    for (const n of numbers) assert.deepEqual(range(n), parsed(text, n), `${name} ${n.key}`);
  }
});

test("Turing offers every field of a line and the plan's setup", () => {
  const keys = (name: string) =>
    new Set([...body(name).matchAll(/^ {4}(\w+)(?::|,$)/gm)].map((match) => match[1]));
  const props = (numbers: PlanNumber[], others: string[]) =>
    new Set([...numbers.map((n) => n.prop), ...others]);
  assert.deepEqual(
    keys("parseSaleLine"),
    props([...SALE, ...SALE_OWN], ["id", "kind", "name", "buildMode"]),
  );
  assert.deepEqual(keys("parseHoldLine"), props(HOLD, ["id", "kind", "name"]));
  assert.deepEqual(
    keys("parsePlanInputs"),
    props(SETUP, ["landTerms", "activeScenario", "lines", ...Object.keys(COSTS)]),
  );
});

test("a new line or cost starts as the editor's own new one", () => {
  const starts = (name: string, numbers: PlanNumber[]) => {
    const text = body(name);
    for (const n of numbers) {
      const at = text.match(new RegExp(`${n.prop}: (\\[[^\\]]+\\]|[\\d.]+)`));
      assert.ok(at, `${name} ${n.key}`);
      const value = at[1].startsWith("[") ? JSON.parse(at[1])[n.at ?? 0] : Number(at[1]);
      assert.equal(n.start, value, `${name} ${n.key}`);
    }
  };
  starts("defaultPlanInputs", SETUP);
  starts("newSaleLine", SALE);
  starts("newHoldLine", HOLD);
  starts("newOverhead", COSTS.overheads.numbers);
  starts("newVariableCost", COSTS.variableCosts.numbers);
  starts("newOneTimeCost", COSTS.oneTimeCosts.numbers);
  starts("newCommonInfra", COSTS.commonInfra.numbers);
  assert.match(body("newOverhead"), /endsWithSales: false/);
});

const check = (action: string, row: object) =>
  checkProposal({ action, title: "x", rows: [{ label: "a", plan_id: PLAN, ...row }] });
const ok = (action: string, row: object) => check(action, row).ok;

test("a number out of range is refused before the admin sees it", () => {
  assert.equal(ok("bp_plan_setup", { horizon_months: "144" }), true);
  assert.equal(ok("bp_plan_setup", { horizon_months: "145" }), false);
  assert.equal(ok("bp_plan_setup", { instalments: "0" }), false);
  assert.equal(ok("bp_hold_line_change", { line: "Senior living", efficiency_pct: "0" }), false);
  assert.equal(
    ok("bp_hold_line_change", { line: "Senior living", exit_cap_rate_pct: "0.1" }),
    true,
  );
  assert.equal(ok("bp_selling_cost_change", { item: "Brokerage", of_bookings_pct: "101" }), false);
  const refused = check("bp_sale_line_change", { line: "Villas", first_sale_month: "200" });
  assert.equal(refused.ok, false);
  assert.match(refused.ok ? "" : refused.error, /First sale month is 1 to 144, a whole number/);
});

test("a change says what changes", () => {
  assert.equal(ok("bp_plan_setup", {}), false);
  assert.equal(ok("bp_sale_line_change", { line: "Villas" }), false);
  assert.equal(ok("bp_overhead_change", { item: "Marketing" }), false);
  assert.equal(ok("bp_overhead_change", { item: "Marketing", ends_with_sales: true }), true);
  assert.equal(ok("bp_plan_change", {}), false);
  assert.equal(ok("bp_plan_change", { project_id: "" }), true);
  assert.equal(ok("bp_plan_change", { name: "" }), false);
});

test("a JV's premium and settlement are refused with land paid in cash", () => {
  assert.equal(ok("bp_plan_setup", { land_terms: "cash", land_premium_pct: "20" }), false);
  assert.equal(ok("bp_plan_setup", { land_terms: "jv", land_premium_pct: "20" }), true);
  assert.equal(ok("bp_plan_setup", { land_premium_pct: "1000" }), true);
});

test("a SALE line's terms: the plan's, or its own, never both", () => {
  assert.equal(ok("bp_sale_line_change", { line: "Villas", plan_terms: true }), true);
  assert.equal(ok("bp_sale_line_change", { line: "Villas", plan_terms: false }), false);
  assert.equal(
    ok("bp_sale_line_change", { line: "Villas", plan_terms: true, booking_pct: "20" }),
    false,
  );
  assert.equal(ok("bp_sale_line_change", { line: "Villas", release_at_pct: "" }), true);
  assert.equal(ok("bp_sale_line_change", { line: "Villas", units: "" }), false);
});

test("a new SALE line starts as the editor's, and only a scheduled one has a build start", () => {
  const added = check("bp_sale_line_new", { name: "Villas", units: "42" });
  assert.ok(added.ok);
  const values = added.value.rows[0].values;
  assert.equal(values.build_mode, "on-sale");
  assert.equal(values.velocity_moderate, "1.5");
  assert.equal("booking_pct" in values, false);
  assert.equal("release_at_pct" in values, false);
  assert.equal(ok("bp_sale_line_new", { name: "Villas", build_start_month: "6" }), false);
  assert.equal(
    ok("bp_sale_line_new", { name: "Tower", build_mode: "scheduled", build_start_month: "6" }),
    true,
  );
});

test("a cost is removed by its kind and name", () => {
  assert.equal(ok("bp_cost_remove", { kind: "overhead", item: "Marketing" }), true);
  assert.equal(ok("bp_cost_remove", { kind: "overheads", item: "Marketing" }), false);
});
