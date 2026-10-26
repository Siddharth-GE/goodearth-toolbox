import "server-only";

import {
  createPlan,
  deletePlan,
  duplicatePlan,
  renamePlan,
  savePlan,
} from "@/lib/business-planning/actions";

import { entryFor, formOf } from "../catalogue-fields";
import {
  COST_KINDS,
  COSTS,
  HOLD,
  SALE,
  SETUP,
  sameName,
  type BUSINESS_PLANNING,
  type CostList,
  type PlanFlag,
  type PlanNumber,
} from "../entries/business-planning";
import { recordNow, saving, type RunResult, type Runners, type Values } from "./kit";

type Failure = { error: string };
type Doc = Record<string, unknown>;
type Plan = { name: string; inputs: Doc; before: string };

const isDoc = (value: unknown): value is Doc =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The plan's document as saved: `savePlan` parses it on the way in, so it is the editor's own shape. */
async function planNow(planId: string): Promise<Plan | Failure> {
  const now = await recordNow(
    "business_plans",
    { column: "id", id: planId },
    ["name", "inputs"],
    "That plan is gone.",
  );
  if ("error" in now) return now;
  const inputs = isDoc(now.row.inputs) ? (structuredClone(now.row.inputs) as Doc) : {};
  return { name: String(now.row.name), inputs, before: JSON.stringify(inputs) };
}

/** One list of the document — its lines, or one kind of cost. */
function listOf(inputs: Doc, key: string): Doc[] {
  const list = Array.isArray(inputs[key]) ? (inputs[key] as unknown[]).filter(isDoc) : [];
  inputs[key] = list;
  return list;
}

function named(items: Doc[], name: string, noun: string): Doc | Failure {
  const found = items.filter((item) => sameName(String(item.name ?? ""), name));
  if (found.length === 0) return { error: `The plan has no ${noun} called "${name}".` };
  if (found.length > 1)
    return {
      error: `The plan has ${found.length} ${noun}s called "${name}"; rename one on the plan first.`,
    };
  return found[0];
}

const taken = (items: Doc[], name: string, noun: string, except?: Doc): Failure | null =>
  items.some((item) => item !== except && sameName(String(item.name ?? ""), name))
    ? { error: `The plan already has a ${noun} called "${name}".` }
    : null;

function apply(target: Doc, numbers: PlanNumber[], flags: PlanFlag[], v: Values) {
  for (const n of numbers) {
    if (!(n.key in v)) continue;
    const value = v[n.key] === "" ? null : Number(v[n.key]);
    if (n.at === undefined) target[n.prop] = value;
    else {
      const velocity = Array.isArray(target[n.prop]) ? [...(target[n.prop] as unknown[])] : [];
      velocity[n.at] = value;
      target[n.prop] = [0, 1, 2].map((at) => velocity[at] ?? 0);
    }
  }
  for (const f of flags) if (f.key in v) target[f.prop] = v[f.key] === true;
}

/** The plan's document saved whole, as the editor saves it; one that changes nothing is refused. */
function save(planId: string, plan: Plan, same: string): Promise<RunResult> | RunResult {
  if (JSON.stringify(plan.inputs) === plan.before) return { error: same };
  return savePlan(planId, plan.inputs as unknown as Parameters<typeof savePlan>[1]);
}

const planTerm = (inputs: Doc, prop: "bookingPct" | "instalments") =>
  typeof inputs[prop] === "number"
    ? inputs[prop]
    : (SETUP.find((n) => n.prop === prop)?.start ?? null);

/** A SALE line's hold-back and own terms: the editor's checkbox gives both terms, the other from the line or the plan. */
function saleOwn(line: Doc, inputs: Doc, v: Values) {
  if ("release_at_pct" in v)
    line.launchTriggerPct = v.release_at_pct === "" ? null : Number(v.release_at_pct);
  if (v.plan_terms === true) {
    line.bookingPct = null;
    line.instalments = null;
  }
  if ("booking_pct" in v || "instalments" in v) {
    line.bookingPct =
      "booking_pct" in v
        ? Number(v.booking_pct)
        : (line.bookingPct ?? planTerm(inputs, "bookingPct"));
    line.instalments =
      "instalments" in v
        ? Number(v.instalments)
        : (line.instalments ?? planTerm(inputs, "instalments"));
  }
}

const SCHEDULED_ONLY = "Build starts is for a line built on a schedule.";

async function lineChange(v: Values, kind: "sale" | "hold"): Promise<RunResult> {
  const planId = String(v.plan_id);
  const plan = await planNow(planId);
  if ("error" in plan) return plan;
  const lines = listOf(plan.inputs, "lines");
  const line = named(lines, String(v.line), "line");
  if ("error" in line) return line;
  if (line.kind !== kind)
    return {
      error: `"${String(line.name)}" is a line you ${line.kind === "hold" ? "hold" : "sell"}; change it as one.`,
    };
  if ("new_name" in v) {
    const clash = taken(lines, String(v.new_name), "line", line);
    if (clash) return clash;
    line.name = String(v.new_name);
  }
  if (kind === "hold") apply(line, HOLD, [], v);
  else {
    if ("build_mode" in v) line.buildMode = v.build_mode;
    apply(line, SALE, [], v);
    if ("build_start_month" in v && line.buildMode !== "scheduled")
      return { error: SCHEDULED_ONLY };
    saleOwn(line, plan.inputs, v);
  }
  return save(planId, plan, "The line already says that.");
}

function costRunners(kind: CostList) {
  const { noun, numbers, flags } = COSTS[kind];
  return {
    added: async (v: Values): Promise<RunResult> => {
      const planId = String(v.plan_id);
      const plan = await planNow(planId);
      if ("error" in plan) return plan;
      const items = listOf(plan.inputs, kind);
      const clash = taken(items, String(v.name), noun);
      if (clash) return clash;
      const item: Doc = { id: crypto.randomUUID(), name: String(v.name) };
      apply(item, numbers, flags, v);
      items.push(item);
      return save(planId, plan, "");
    },
    changed: async (v: Values): Promise<RunResult> => {
      const planId = String(v.plan_id);
      const plan = await planNow(planId);
      if ("error" in plan) return plan;
      const items = listOf(plan.inputs, kind);
      const item = named(items, String(v.item), noun);
      if ("error" in item) return item;
      if ("new_name" in v) {
        const clash = taken(items, String(v.new_name), noun, item);
        if (clash) return clash;
        item.name = String(v.new_name);
      }
      apply(item, numbers, flags, v);
      return save(planId, plan, `The ${noun} already says that.`);
    },
  };
}

const overheads = costRunners("overheads");
const sellingCosts = costRunners("variableCosts");
const oneTimeCosts = costRunners("oneTimeCosts");
const sharedItems = costRunners("commonInfra");

const PLAN_FIELDS = ["name", "location", "project_id"] as const;

/** Each Business planning entry, run through Business planning's own action, as the admin. */
export const BUSINESS_PLANNING_RUNNERS: Runners<(typeof BUSINESS_PLANNING)[number]["key"]> = {
  bp_plan_new: async (v) => {
    const entry = entryFor("bp_plan_new");
    if (!entry) return { error: "Turing does not know that change." };
    const done = await saving(() => createPlan(undefined, formOf(entry, v)), "/business-planning/");
    return "error" in done ? done : { saved: String(v.name) };
  },
  bp_plan_change: async (v) => {
    const planId = String(v.plan_id);
    const now = await recordNow(
      "business_plans",
      { column: "id", id: planId },
      [...PLAN_FIELDS],
      "That plan is gone.",
    );
    if ("error" in now) return now;
    if (PLAN_FIELDS.every((key) => !(key in v) || v[key] === String(now.row[key] ?? "")))
      return { error: "The plan already says that." };
    const entry = entryFor("bp_plan_change");
    if (!entry) return { error: "Turing does not know that change." };
    return renamePlan(planId, undefined, formOf(entry, v, now.row));
  },
  bp_plan_copy: async (v) => {
    const plan = await planNow(String(v.plan_id));
    if ("error" in plan) return plan;
    const done = await saving(() => duplicatePlan(String(v.plan_id)), "/business-planning/");
    return "error" in done ? done : { saved: `${plan.name} (copy)` };
  },
  bp_plan_delete: async (v) => {
    const plan = await planNow(String(v.plan_id));
    if ("error" in plan) return plan;
    return deletePlan(String(v.plan_id));
  },
  bp_plan_setup: async (v) => {
    const planId = String(v.plan_id);
    const plan = await planNow(planId);
    if ("error" in plan) return plan;
    apply(plan.inputs, SETUP, [], v);
    if ("land_terms" in v) plan.inputs.landTerms = v.land_terms;
    if (("land_premium_pct" in v || "land_settlement_month" in v) && plan.inputs.landTerms !== "jv")
      return {
        error: "A premium and settlement month are a JV's; this plan pays for land in cash.",
      };
    if ("scenario" in v)
      plan.inputs.activeScenario = ["Base", "Moderate", "High"].indexOf(String(v.scenario));
    return save(planId, plan, "The setup already says that.");
  },
  bp_sale_line_new: async (v) => {
    const planId = String(v.plan_id);
    const plan = await planNow(planId);
    if ("error" in plan) return plan;
    const lines = listOf(plan.inputs, "lines");
    const clash = taken(lines, String(v.name), "line");
    if (clash) return clash;
    const line: Doc = {
      id: crypto.randomUUID(),
      kind: "sale",
      name: String(v.name),
      buildMode: v.build_mode,
      launchTriggerPct: null,
      bookingPct: null,
      instalments: null,
    };
    apply(line, SALE, [], v);
    saleOwn(line, plan.inputs, v);
    lines.push(line);
    return save(planId, plan, "");
  },
  bp_sale_line_change: (v) => lineChange(v, "sale"),
  bp_hold_line_new: async (v) => {
    const planId = String(v.plan_id);
    const plan = await planNow(planId);
    if ("error" in plan) return plan;
    const lines = listOf(plan.inputs, "lines");
    const clash = taken(lines, String(v.name), "line");
    if (clash) return clash;
    const line: Doc = { id: crypto.randomUUID(), kind: "hold", name: String(v.name) };
    apply(line, HOLD, [], v);
    lines.push(line);
    return save(planId, plan, "");
  },
  bp_hold_line_change: (v) => lineChange(v, "hold"),
  bp_line_remove: async (v) => {
    const planId = String(v.plan_id);
    const plan = await planNow(planId);
    if ("error" in plan) return plan;
    const lines = listOf(plan.inputs, "lines");
    const line = named(lines, String(v.line), "line");
    if ("error" in line) return line;
    plan.inputs.lines = lines.filter((one) => one !== line);
    return save(planId, plan, "");
  },
  bp_overhead_new: overheads.added,
  bp_overhead_change: overheads.changed,
  bp_selling_cost_new: sellingCosts.added,
  bp_selling_cost_change: sellingCosts.changed,
  bp_one_time_cost_new: oneTimeCosts.added,
  bp_one_time_cost_change: oneTimeCosts.changed,
  bp_shared_item_new: sharedItems.added,
  bp_shared_item_change: sharedItems.changed,
  bp_cost_remove: async (v) => {
    const planId = String(v.plan_id);
    const kind = COST_KINDS[String(v.kind)];
    const plan = await planNow(planId);
    if ("error" in plan) return plan;
    const items = listOf(plan.inputs, kind);
    const item = named(items, String(v.item), COSTS[kind].noun);
    if ("error" in item) return item;
    plan.inputs[kind] = items.filter((one) => one !== item);
    return save(planId, plan, "");
  },
};
