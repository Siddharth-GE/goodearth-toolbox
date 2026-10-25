import "server-only";

import {
  addEstimateLines,
  addLineMeasurement,
  changeLineRecipe,
  copyMeasurementRows,
  deleteEstimate,
  duplicateLineMeasurement,
  makeOfficial,
  removeEstimateLine,
  removeLineMeasurement,
  resetEstimateLine,
  setEstimateItemRate,
  startVillaEstimate,
  updateEstimate,
  updateEstimateLineLabourRate,
  updateEstimateLineQty,
  updateLineMeasurement,
  withdrawEstimate,
} from "@/lib/estimator/estimate-actions";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";

import { entryFor, formOf, type Entry } from "../catalogue-fields";
import type { ESTIMATOR_ESTIMATES } from "../entries/estimator-estimates";
import { failed, given, recordNow, retired, saving, type Runners, type Values } from "./kit";
import { materialRefused, mixRefused } from "./estimator-rates";

type Key = (typeof ESTIMATOR_ESTIMATES)[number]["key"];
type Failure = { error: string };
type Refusal = Failure | null;

const entry = (key: Key) => entryFor(key) as Entry;
const text = (values: Values, key: string) =>
  typeof values[key] === "string" && values[key] ? String(values[key]).trim() : null;
const numberOf = (values: Values, key: string) => {
  const value = text(values, key);
  return value === null ? null : Number(value);
};

type Estimate = {
  status: string;
  isWorking: boolean;
  unitId: string | null;
  name: string;
  note: string | null;
};

async function estimateOf(id: string): Promise<Estimate | Failure> {
  const now = await recordNow(
    "estimator_estimates",
    { column: "id", id },
    ["status", "is_working", "unit_id", "name", "note"],
    "That estimate is gone.",
  );
  if ("error" in now) return now;
  return {
    status: String(now.row.status),
    isWorking: now.row.is_working === true,
    unitId: (now.row.unit_id as string | null) ?? null,
    name: String(now.row.name),
    note: (now.row.note as string | null) ?? null,
  };
}

const STATE: Record<string, string> = {
  submitted: "official",
  superseded: "superseded",
  cancelled: "withdrawn",
};

/** The estimate page offers every change on a draft only; an official one is frozen. */
async function draftOf(id: string): Promise<Estimate | Failure> {
  const found = await estimateOf(id);
  if ("error" in found) return found;
  return found.status === "draft"
    ? found
    : {
        error: `That estimate is ${STATE[found.status] ?? found.status}; changes happen in the villa's working estimate.`,
      };
}

type Line = { estimateId: string; workItemId: string };

async function draftLine(lineId: string): Promise<Line | Failure> {
  const now = await recordNow(
    "estimator_estimate_lines",
    { column: "id", id: lineId },
    ["estimate_id", "work_item_id"],
    "That work is no longer on the estimate.",
  );
  if ("error" in now) return now;
  const draft = await draftOf(String(now.row.estimate_id));
  if ("error" in draft) return draft;
  return { estimateId: String(now.row.estimate_id), workItemId: String(now.row.work_item_id) };
}

type Part = { item_id: string | null; mix_id: string | null };
const refOf = (part: Part) =>
  part.item_id ? `material:${part.item_id}` : part.mix_id ? `mix:${part.mix_id}` : null;

/** What a work uses for this villa: its own list once it has one, else the rate book's. */
async function listOf(
  line: Line,
  lineId: string,
): Promise<{ own: boolean; refs: Set<string> } | Failure> {
  const supabase = await createClient();
  const own = await supabase
    .from("estimator_estimate_line_components")
    .select("item_id, mix_id")
    .eq("line_id", lineId);
  if (own.error) return failed("estimator_estimate_line_components", own.error);
  if ((own.data ?? []).length > 0) {
    return { own: true, refs: new Set(own.data.map(refOf).filter((ref): ref is string => !!ref)) };
  }
  const book = await supabase
    .from("estimator_work_components")
    .select("item_id, mix_id")
    .eq("work_item_id", line.workItemId);
  if (book.error) return failed("estimator_work_components", book.error);
  return {
    own: false,
    refs: new Set((book.data ?? []).map(refOf).filter((ref): ref is string => !!ref)),
  };
}

const refFrom = (values: Values, item: string, mix: string) =>
  text(values, item) ? `material:${text(values, item)}` : `mix:${text(values, mix)}`;

async function partRefused(values: Values, item: string, mix: string): Promise<Refusal> {
  const itemId = text(values, item);
  const mixId = text(values, mix);
  return itemId ? materialRefused(itemId) : mixId ? mixRefused(mixId) : null;
}

/** The materials an estimate's works use, through their own lists or the rate book's, and through their mixes: what its Materials list shows a price for. */
async function materialsUsed(estimateId: string): Promise<Set<string> | Failure> {
  const supabase = await createClient();
  try {
    const lines = await fetchAll<{ id: string; work_item_id: string }>((from, to) =>
      supabase
        .from("estimator_estimate_lines")
        .select("id, work_item_id")
        .eq("estimate_id", estimateId)
        .order("id")
        .range(from, to),
    );
    if (lines.length === 0) return new Set();
    const own = await fetchAll<Part & { line_id: string }>((from, to) =>
      supabase
        .from("estimator_estimate_line_components")
        .select("line_id, item_id, mix_id")
        .in(
          "line_id",
          lines.map((one) => one.id),
        )
        .order("id")
        .range(from, to),
    );
    const owning = new Set(own.map((part) => part.line_id));
    const following = [
      ...new Set(lines.filter((one) => !owning.has(one.id)).map((one) => one.work_item_id)),
    ];
    const book =
      following.length > 0
        ? await fetchAll<Part>((from, to) =>
            supabase
              .from("estimator_work_components")
              .select("item_id, mix_id")
              .in("work_item_id", following)
              .order("id")
              .range(from, to),
          )
        : [];
    const parts = [...own, ...book];
    const mixes = [...new Set(parts.map((part) => part.mix_id).filter((id): id is string => !!id))];
    const inMixes =
      mixes.length > 0
        ? await fetchAll<{ item_id: string | null }>((from, to) =>
            supabase
              .from("estimator_mix_components")
              .select("item_id")
              .in("mix_id", mixes)
              .order("id")
              .range(from, to),
          )
        : [];
    return new Set(
      [...parts, ...inMixes].map((part) => part.item_id).filter((id): id is string => !!id),
    );
  } catch (error) {
    return failed("the estimate's materials", error);
  }
}

type Row = {
  lineId: string;
  fromModel: boolean;
  description: string | null;
  nos: number | null;
  length: number | null;
  breadth: number | null;
  depth: number | null;
  deduct: boolean;
};

async function rowOf(rowId: string): Promise<Row | Failure> {
  const now = await recordNow(
    "estimator_estimate_line_measurements",
    { column: "id", id: rowId },
    ["line_id", "from_model", "description", "nos", "length", "breadth", "depth", "is_deduction"],
    "That row is no longer on the sheet.",
  );
  if ("error" in now) return now;
  const line = await draftLine(String(now.row.line_id));
  if ("error" in line) return line;
  const num = (key: string) => (now.row[key] === null ? null : Number(now.row[key]));
  return {
    lineId: String(now.row.line_id),
    fromModel: now.row.from_model === true,
    description: (now.row.description as string | null) ?? null,
    nos: num("nos"),
    length: num("length"),
    breadth: num("breadth"),
    depth: num("depth"),
    deduct: now.row.is_deduction === true,
  };
}

const MODEL_ROW =
  "This row came from the SketchUp model — change it in the model and send it to the toolbox again.";

export const ESTIMATOR_ESTIMATES_RUNNERS: Runners<Key> = {
  est_estimate_start: async (v) => {
    const unitId = String(v.unit_id);
    const sourceId = text(v, "source_estimate_id");
    let ownOfficial = false;
    if (sourceId) {
      // Offered: this villa's official estimate, or another villa's working or official one.
      const source = await estimateOf(sourceId);
      if ("error" in source) return source;
      ownOfficial = source.unitId === unitId && source.status === "submitted";
      const otherVilla =
        source.unitId !== null &&
        source.unitId !== unitId &&
        (source.isWorking || source.status === "submitted");
      if (!ownOfficial && !otherVilla) {
        return {
          error:
            "Start from this villa's official estimate, or another villa's working or official one.",
        };
      }
    }
    const values = { ...v, everything: "everything" in v ? v.everything : ownOfficial };
    const done = await saving(
      () => startVillaEstimate(undefined, formOf(entry("est_estimate_start"), values)),
      "/estimator/estimates/",
    );
    return "error" in done ? done : { saved: "a working estimate" };
  },
  est_estimate_change: async (v) => {
    const now = await draftOf(String(v.estimate_id));
    if ("error" in now) return now;
    return updateEstimate(
      String(v.estimate_id),
      undefined,
      formOf(entry("est_estimate_change"), v, { name: now.name, note: now.note }),
    );
  },
  est_estimate_delete: async (v) => {
    const now = await draftOf(String(v.estimate_id));
    if ("error" in now) return now;
    const done = await saving(() => deleteEstimate(String(v.estimate_id)), "/estimator/estimates");
    return "error" in done ? done : undefined;
  },
  est_estimate_withdraw: async (v) => {
    const now = await estimateOf(String(v.estimate_id));
    if ("error" in now) return now;
    if (now.status !== "submitted")
      return { error: "Only a villa's official estimate is withdrawn." };
    return withdrawEstimate(String(v.estimate_id), String(v.reason));
  },
  est_estimate_official: async (v) => {
    const now = await estimateOf(String(v.estimate_id));
    if ("error" in now) return now;
    if (!now.isWorking || now.status !== "draft" || !now.unitId)
      return { error: "Only a villa's working estimate is made official." };
    const result = await makeOfficial(String(v.estimate_id));
    if (result?.error) return result;
    // The new official is the villa's one estimate with that status; its number is what Turing says.
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("estimator_estimates")
      .select("reference")
      .eq("unit_id", now.unitId)
      .eq("status", "submitted")
      .maybeSingle();
    if (error) console.error("turing: the new official's number was not read:", error);
    return data?.reference ? { saved: data.reference } : undefined;
  },
  est_works_add: {
    lines: async (header, lines) => {
      const estimateId = String(header.estimate_id);
      const draft = await draftOf(estimateId);
      if ("error" in draft) return draft;
      const works = lines.map((one) => String(one.work_item_id));
      if (new Set(works).size < works.length)
        return { error: "One work is named twice; give it one row." };
      // The picker lists active works not already on the estimate; the add skips those silently.
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("estimator_estimate_lines")
        .select("work_item_id")
        .eq("estimate_id", estimateId)
        .in("work_item_id", works);
      if (error) return failed("estimator_estimate_lines", error);
      if ((data ?? []).length > 0)
        return { error: "One of those works is already on the estimate." };
      for (const work of works) {
        const refused = await retired("work_items", work);
        if (refused) return refused;
      }
      return addEstimateLines(estimateId, works);
    },
  },
  est_line_qty: async (v) => {
    const line = await draftLine(String(v.line_id));
    if ("error" in line) return line;
    return updateEstimateLineQty(String(v.line_id), numberOf(v, "qty"));
  },
  est_line_remove: async (v) => {
    const line = await draftLine(String(v.line_id));
    if ("error" in line) return line;
    return removeEstimateLine(String(v.line_id));
  },
  est_line_labour: async (v) => {
    const line = await draftLine(String(v.line_id));
    if ("error" in line) return line;
    return updateEstimateLineLabourRate(String(v.line_id), numberOf(v, "labour_rate"));
  },
  est_line_material: async (v) => {
    const lineId = String(v.line_id);
    const line = await draftLine(lineId);
    if ("error" in line) return line;
    const refused = await partRefused(v, "item_id", "mix_id");
    if (refused) return refused;
    const list = await listOf(line, lineId);
    if ("error" in list) return list;
    const ref = refFrom(v, "item_id", "mix_id");
    return changeLineRecipe(lineId, {
      op: list.refs.has(ref) ? "qty" : "add",
      ref,
      qty: Number(v.qty_per_unit),
    });
  },
  est_line_material_swap: async (v) => {
    const lineId = String(v.line_id);
    const line = await draftLine(lineId);
    if ("error" in line) return line;
    const list = await listOf(line, lineId);
    if ("error" in list) return list;
    const ref = refFrom(v, "item_id", "mix_id");
    const to = refFrom(v, "to_item_id", "to_mix_id");
    // Checked before the save, which copies the rate book's list onto the work before it looks.
    if (!list.refs.has(ref)) return { error: "That is not in this work's list." };
    if (list.refs.has(to)) return { error: "What it swaps to is already in this work's list." };
    const refused = await partRefused(v, "to_item_id", "to_mix_id");
    if (refused) return refused;
    return changeLineRecipe(lineId, { op: "swap", ref, to });
  },
  est_line_material_remove: async (v) => {
    const lineId = String(v.line_id);
    const line = await draftLine(lineId);
    if ("error" in line) return line;
    const list = await listOf(line, lineId);
    if ("error" in list) return list;
    const ref = refFrom(v, "item_id", "mix_id");
    if (!list.refs.has(ref)) return { error: "That is not in this work's list." };
    return changeLineRecipe(lineId, { op: "remove", ref });
  },
  est_line_reset: async (v) => {
    const lineId = String(v.line_id);
    const line = await draftLine(lineId);
    if ("error" in line) return line;
    const list = await listOf(line, lineId);
    if ("error" in list) return list;
    if (!list.own) return { error: "That work already follows the rate book's materials." };
    return resetEstimateLine(lineId);
  },
  est_item_price: async (v) => {
    const estimateId = String(v.estimate_id);
    const itemId = String(v.item_id);
    const draft = await draftOf(estimateId);
    if ("error" in draft) return draft;
    const used = await materialsUsed(estimateId);
    if ("error" in used) return used;
    if (!used.has(itemId)) return { error: "That material is not on this estimate." };
    const rate = numberOf(v, "rate");
    if (rate === null) {
      // Clearing deletes the villa's price, so with none it would change nothing and say done.
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("estimator_estimate_item_rates")
        .select("id")
        .eq("estimate_id", estimateId)
        .eq("item_id", itemId)
        .maybeSingle();
      if (error) return failed("estimator_estimate_item_rates", error);
      if (!data) return { error: "That material already takes the Masters price." };
    }
    return setEstimateItemRate(estimateId, itemId, rate);
  },
  est_measure_add: async (v) => {
    const lineId = String(v.line_id);
    const line = await draftLine(lineId);
    if ("error" in line) return line;
    const form = new FormData();
    for (const key of ["description", "nos", "length", "breadth", "depth"])
      form.set(key, text(v, key) ?? "");
    if (v.deduct === true) form.set("deduct", "1");
    return addLineMeasurement(lineId, undefined, form);
  },
  est_measure_change: async (v) => {
    const now = await rowOf(String(v.row_id));
    if ("error" in now) return now;
    if (now.fromModel) return { error: MODEL_ROW };
    const boxOf = (key: "nos" | "length" | "breadth" | "depth") => {
      const value = given(v, key, now[key]);
      return value === "" ? null : Number(value);
    };
    return updateLineMeasurement(String(v.row_id), {
      description: given(v, "description", now.description) || null,
      nos: boxOf("nos"),
      length: boxOf("length"),
      breadth: boxOf("breadth"),
      depth: boxOf("depth"),
      deduct: "deduct" in v ? v.deduct === true : now.deduct,
    });
  },
  est_measure_remove: async (v) => {
    const now = await rowOf(String(v.row_id));
    if ("error" in now) return now;
    if (now.fromModel) return { error: MODEL_ROW };
    return removeLineMeasurement(String(v.row_id));
  },
  est_measure_duplicate: async (v) => {
    const now = await rowOf(String(v.row_id));
    if ("error" in now) return now;
    if (now.fromModel) return { error: MODEL_ROW };
    return duplicateLineMeasurement(String(v.row_id));
  },
  est_measure_copy: async (v) => {
    const from = await draftLine(String(v.from_line_id));
    if ("error" in from) return from;
    const to = await draftLine(String(v.to_line_id));
    if ("error" in to) return to;
    if (from.estimateId !== to.estimateId) return { error: "Both works must be on one estimate." };
    return copyMeasurementRows(String(v.from_line_id), String(v.to_line_id));
  },
};
