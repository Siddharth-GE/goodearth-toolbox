import "server-only";

import { decideIndentLine } from "@/lib/estimator/indent-actions";
import {
  addMixComponent,
  createMix,
  deleteMix,
  removeMixComponent,
  updateMix,
  updateMixComponentQty,
} from "@/lib/estimator/mixes-actions";
import {
  addWorkComponent,
  copyWorkSetup,
  removeWorkComponent,
  saveWorkInfo,
  setWorkModelMeasure,
  updateWorkComponentQty,
} from "@/lib/estimator/works-actions";
import { isActiveUom } from "@/lib/masters/uoms";

import { entryFor, formOf, type Entry } from "../catalogue-fields";
import type { ESTIMATOR_RATES } from "../entries/estimator-rates";
import { recordNow, retired, saving, type Runners, type Values } from "./kit";

type Key = (typeof ESTIMATOR_RATES)[number]["key"];
type Refusal = { error: string } | null;

const entry = (key: Key) => entryFor(key) as Entry;
const text = (values: Values, key: string) =>
  typeof values[key] === "string" && values[key] ? String(values[key]).trim() : null;

/** Every unit picker offers Masters' active units, and keeps the one already there. */
async function uomRefused(uom: string | null, current: unknown): Promise<Refusal> {
  if (!uom || uom === current) return null;
  return (await isActiveUom(uom))
    ? null
    : { error: `"${uom}" is not an active unit in Masters → Units.` };
}

/** The recipe and mix pickers offer active materials: items of kind material. */
async function materialRefused(itemId: string): Promise<Refusal> {
  const now = await recordNow(
    "items",
    { column: "id", id: itemId },
    ["kind", "is_active"],
    "That material is gone.",
  );
  if ("error" in now) return now;
  if (now.row.kind !== "material") return { error: "That item is not a material." };
  return now.row.is_active === false ? { error: "That material is retired in Masters." } : null;
}

async function mixRefused(mixId: string): Promise<Refusal> {
  const now = await recordNow(
    "estimator_mixes",
    { column: "id", id: mixId },
    ["is_active"],
    "That mix is gone.",
  );
  if ("error" in now) return now;
  return now.row.is_active === false ? { error: "That mix is switched off." } : null;
}

/** A change or removal of a row that is gone would match nothing and still say done. */
async function gone(table: string, id: string, what: string): Promise<Refusal> {
  const now = await recordNow(table, { column: "id", id }, ["id"], `That ${what} is gone.`);
  return "error" in now ? now : null;
}

export const ESTIMATOR_RATES_RUNNERS: Runners<Key> = {
  est_work_setup: async (v) => {
    const workId = String(v.work_item_id);
    // The rate book lists active works.
    const refused = await retired("work_items", workId);
    if (refused) return refused;
    const now = await recordNow(
      "estimator_work_info",
      { column: "work_item_id", id: workId },
      ["uom", "labour_rate"],
      null,
    );
    if ("error" in now) return now;
    if (!now.row.uom && !("uom" in v))
      return { error: "Say what the work is measured in, like cum or sqm." };
    const badUnit = await uomRefused(text(v, "uom"), now.row.uom);
    if (badUnit) return badUnit;
    return saveWorkInfo(workId, undefined, formOf(entry("est_work_setup"), v, now.row));
  },
  est_work_model: async (v) => {
    const workId = String(v.work_item_id);
    const refused = await retired("work_items", workId);
    if (refused) return refused;
    return setWorkModelMeasure(workId, text(v, "measure"));
  },
  est_work_material: async (v) => {
    const workId = String(v.work_item_id);
    const itemId = text(v, "item_id");
    const mixId = text(v, "mix_id");
    const refused =
      (await retired("work_items", workId)) ??
      (itemId ? await materialRefused(itemId) : null) ??
      (mixId ? await mixRefused(mixId) : null);
    if (refused) return refused;
    const form = new FormData();
    form.set("component", itemId ? `material:${itemId}` : `mix:${mixId}`);
    form.set("qty_per_unit", String(v.qty_per_unit));
    return addWorkComponent(workId, undefined, form);
  },
  est_work_material_change: async (v) => {
    const refused = await gone("estimator_work_components", String(v.component_id), "recipe line");
    if (refused) return refused;
    return updateWorkComponentQty(String(v.component_id), Number(v.qty_per_unit));
  },
  est_work_material_remove: async (v) => {
    const refused = await gone("estimator_work_components", String(v.component_id), "recipe line");
    if (refused) return refused;
    return removeWorkComponent(String(v.component_id));
  },
  est_work_copy: {
    lines: async (header, lines) => {
      const fromId = String(header.from_work_item_id);
      const targets = lines.map((one) => String(one.to_work_item_id));
      if (new Set(targets).size < targets.length)
        return { error: "One work is named twice; give it one row." };
      if (targets.includes(fromId)) return { error: "A work cannot be copied onto itself." };
      // The copy picker offers active works only.
      for (const id of [fromId, ...targets]) {
        const refused = await retired("work_items", id);
        if (refused) return refused;
      }
      return copyWorkSetup(fromId, targets);
    },
  },
  est_mix_new: async (v) => {
    const refused = await uomRefused(text(v, "uom"), null);
    if (refused) return refused;
    return createMix(undefined, formOf(entry("est_mix_new"), v));
  },
  est_mix_change: async (v) => {
    const now = await recordNow(
      "estimator_mixes",
      { column: "id", id: String(v.mix_id) },
      ["name", "uom", "description", "is_active"],
      "That mix is gone.",
    );
    if ("error" in now) return now;
    const refused = await uomRefused(text(v, "uom"), now.row.uom);
    if (refused) return refused;
    return updateMix(String(v.mix_id), undefined, formOf(entry("est_mix_change"), v, now.row));
  },
  est_mix_delete: async (v) => {
    const refused = await gone("estimator_mixes", String(v.mix_id), "mix");
    if (refused) return refused;
    const done = await saving(() => deleteMix(String(v.mix_id)), "/estimator/mixes");
    return "error" in done ? done : undefined;
  },
  est_mix_material: async (v) => {
    const refused =
      (await gone("estimator_mixes", String(v.mix_id), "mix")) ??
      (await materialRefused(String(v.item_id)));
    if (refused) return refused;
    return addMixComponent(String(v.mix_id), undefined, formOf(entry("est_mix_material"), v));
  },
  est_mix_material_change: async (v) => {
    const refused = await gone("estimator_mix_components", String(v.component_id), "mix line");
    if (refused) return refused;
    return updateMixComponentQty(String(v.component_id), Number(v.qty_per_unit));
  },
  est_mix_material_remove: async (v) => {
    const refused = await gone("estimator_mix_components", String(v.component_id), "mix line");
    if (refused) return refused;
    return removeMixComponent(String(v.component_id));
  },
  est_indent_answer: (v) =>
    decideIndentLine({
      lineId: String(v.line_id),
      decision: v.decision === "refused" ? "refused" : "approved",
      note: text(v, "note") ?? "",
    }),
};
