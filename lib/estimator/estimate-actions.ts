"use server";

// Type-only import, and deliberately NOT re-exported: a bare
// `export type { ActionState }` in a "use server" file survives into the
// compiled module's runtime export list, where the type doesn't exist —
// every action in the chunk then dies at module load (the 2026-08-03
// production outage). Import it from "@/lib/action-state" instead.
import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { parseNumber, text } from "@/lib/form-data";
import { createClient } from "@/lib/supabase/server";
import {
  applyEstimateOverrides,
  applyRateOverrides,
  computeLine,
  computeWorkTakeoff,
  sheetTotal,
} from "./calc";
import { getEstimateVariations, getRecipeBook } from "./estimate-queries";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { GRANT, NAME_LIMIT, TEXT_LIMIT } from "./shared";

// ---------------------------------------------------------------------
// Estimates
// ---------------------------------------------------------------------

/**
 * Start a villa's working estimate (0098) — blank, or from another
 * estimate: another villa's (its works, as a head start — every villa is
 * different, so quantities come across only when asked), or this villa's
 * own official one (everything, to carry on from it). One database call,
 * so a half-made copy can't be left behind; the database refuses a second
 * working estimate for the same villa.
 */
export async function startVillaEstimate(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireTool(GRANT);
  const unitId = text(formData, "unit_id");
  const sourceId = text(formData, "source_estimate_id");
  const everything = formData.get("everything") === "on";
  const name = text(formData, "name");

  if (!unitId) return { error: "Which villa?" };
  if (name.length > NAME_LIMIT) return { error: `Keep the name under ${NAME_LIMIT} characters.` };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_villa_estimate", {
    p_unit: unitId,
    // Null starts it blank; the generated types can't say an argument
    // may be null.
    p_source: (sourceId || null) as string,
    p_everything: everything,
    p_name: (name || null) as string,
  });
  if (error || !data) {
    if (error?.code === "P0001") return { error: error.message };
    if (error?.code === "23505") {
      return { error: "This villa already has a working estimate — open it instead." };
    }
    console.error("startVillaEstimate failed:", error);
    return { error: "Could not start the estimate. Try again." };
  }

  revalidatePath("/estimator", "layout");
  redirect(`/estimator/estimates/${data}`);
}

export async function updateEstimate(
  id: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const name = text(formData, "name");
  const note = text(formData, "note");

  if (!name) return { error: "Give the estimate a name." };
  if (name.length > NAME_LIMIT) return { error: `Keep the name under ${NAME_LIMIT} characters.` };
  if (note.length > TEXT_LIMIT) return { error: "That note is too long." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("estimator_estimates")
    .update({ name, note: note || null, updated_by: user.id })
    .eq("id", id);
  if (error) {
    console.error("updateEstimate failed:", error);
    return { error: "Could not update the estimate. Try again." };
  }

  revalidatePath("/estimator", "layout");
  return undefined;
}

export async function deleteEstimate(id: string): Promise<ActionState> {
  await requireTool(GRANT);
  const supabase = await createClient();

  // Only drafts delete (the 0077 policy); delete_draft_estimate (0098)
  // takes the snapshot, prices, sheets, materials and lines first, in one
  // transaction — a failure leaves the draft whole, never half-stripped.
  const { error } = await supabase.rpc("delete_draft_estimate", { p_estimate: id });
  if (error) {
    if (error.code === "P0001") return { error: error.message };
    console.error("deleteEstimate failed:", error);
    return { error: "Could not delete the estimate. Try again." };
  }

  revalidatePath("/estimator", "layout");
  redirect("/estimator/estimates");
}

/**
 * Put works on an estimate — any works, set up in the rate book or not,
 * all at once. They arrive "to measure" (0097: no quantity yet), so
 * nobody types a throwaway number to get past the form; the measurement
 * sheet or the quantity box fills them in. Works already on the estimate
 * are skipped, not doubled (one line per work, 0074).
 */
export async function addEstimateLines(
  estimateId: string,
  workItemIds: string[],
): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const ids = [...new Set(Array.isArray(workItemIds) ? workItemIds : [])].filter(
    (id) => typeof id === "string" && id,
  );
  if (!estimateId) return { error: "Which estimate?" };
  if (ids.length === 0) return { error: "Tick the works to add." };

  const supabase = await createClient();
  const { data: existing, error: readError } = await supabase
    .from("estimator_estimate_lines")
    .select("work_item_id")
    .eq("estimate_id", estimateId);
  if (readError) {
    console.error("addEstimateLines (read) failed:", readError);
    return { error: "Could not add the works. Try again." };
  }
  const already = new Set((existing ?? []).map((line) => line.work_item_id));
  const fresh = ids.filter((id) => !already.has(id));
  if (fresh.length === 0) return { error: "Those works are already on this estimate." };

  const { error } = await supabase.from("estimator_estimate_lines").insert(
    fresh.map((workItemId) => ({
      estimate_id: estimateId,
      work_item_id: workItemId,
      qty: null,
      created_by: user.id,
      updated_by: user.id,
    })),
  );
  if (error) {
    if (error.code === "P0001") return { error: error.message };
    if (error.code === "23505") {
      return { error: "One of those works was just added by someone else — reload the page." };
    }
    console.error("addEstimateLines failed:", error);
    return { error: "Could not add the works. Try again." };
  }

  revalidatePath("/estimator", "layout");
  return undefined;
}

/** A typed quantity — or blank, which puts the work back to "to measure". */
export async function updateEstimateLineQty(id: string, qty: number | null): Promise<ActionState> {
  const user = await requireTool(GRANT);
  if (qty !== null && (typeof qty !== "number" || !Number.isFinite(qty) || qty <= 0)) {
    return { error: "The quantity must be more than zero, or blank to measure it later." };
  }

  const supabase = await createClient();

  // A measured line's quantity IS its sheet's total (0096) — typing over
  // it would leave the rows saying one thing and the BOQ another.
  const { count, error: countError } = await supabase
    .from("estimator_estimate_line_measurements")
    .select("id", { count: "exact", head: true })
    .eq("line_id", id);
  if (countError) {
    console.error("updateEstimateLineQty (measurements) failed:", countError);
    return { error: "Could not save the quantity. Try again." };
  }
  if (count) {
    return {
      error: "This quantity comes from its measurement sheet — change the rows there instead.",
    };
  }

  const { error } = await supabase
    .from("estimator_estimate_lines")
    .update({ qty, updated_by: user.id })
    .eq("id", id);
  if (error) {
    console.error("updateEstimateLineQty failed:", error);
    return { error: "Could not save the quantity. Try again." };
  }

  revalidatePath("/estimator", "layout");
  return undefined;
}

export async function removeEstimateLine(id: string): Promise<ActionState> {
  await requireTool(GRANT);
  const supabase = await createClient();

  // The line's measurement sheet (0096) and variation (0087) go with
  // it — RESTRICT, not cascade.
  const { error: measurementError } = await supabase
    .from("estimator_estimate_line_measurements")
    .delete()
    .eq("line_id", id);
  if (measurementError) {
    if (measurementError.code === "P0001") return { error: measurementError.message };
    console.error("removeEstimateLine (measurements) failed:", measurementError);
    return { error: "Could not remove the work. Try again." };
  }

  const { error: variationError } = await supabase
    .from("estimator_estimate_line_components")
    .delete()
    .eq("line_id", id);
  if (variationError) {
    console.error("removeEstimateLine (variation) failed:", variationError);
    return { error: "Could not remove the work. Try again." };
  }

  const { error } = await supabase.from("estimator_estimate_lines").delete().eq("id", id);
  if (error) {
    console.error("removeEstimateLine failed:", error);
    return { error: "Could not remove the work. Try again." };
  }

  revalidatePath("/estimator", "layout");
  return undefined;
}

/* ------------------------------------------------------------------ *
 * The measurement sheet (0096) — the QS layer under a line
 *
 * One row per wall, slab or footing: Nos × Length × Breadth × Depth,
 * a blank box not used (founder, 2026-09-25). The line's qty stays the
 * one figure everything downstream reads; after every row change the
 * action re-sums the sheet through calc.ts and writes it there. The
 * draft-only trigger is the boundary; these actions speak plainly.
 * ------------------------------------------------------------------ */

export type MeasurementFields = {
  description: string | null;
  nos: number | null;
  length: number | null;
  breadth: number | null;
  depth: number | null;
};

/** The same rules for a new row and an edited one: blank is "not used",
 * anything typed must be a number above zero, and a row must measure
 * something. Returns the message, or undefined when the row is fine. */
function checkMeasurement(fields: MeasurementFields): string | undefined {
  const boxes = [
    ["Nos", fields.nos],
    ["Length", fields.length],
    ["Breadth", fields.breadth],
    ["Depth", fields.depth],
  ] as const;
  for (const [label, value] of boxes) {
    if (value !== null && (!Number.isFinite(value) || value <= 0)) {
      return `${label} must be a number more than zero, or left blank.`;
    }
  }
  if (boxes.every(([, value]) => value === null)) {
    return "Enter at least one of number, length, breadth or depth.";
  }
  if (fields.description && fields.description.length > TEXT_LIMIT) {
    return "That description is too long.";
  }
  return undefined;
}

/** Re-sum a line's sheet and write the total onto the line. With no rows
 * left the line keeps its last quantity, typed from then on. */
async function syncLineQty(
  supabase: Awaited<ReturnType<typeof createClient>>,
  lineId: string,
  userId: string,
): Promise<string | undefined> {
  const { data: rows, error: readError } = await supabase
    .from("estimator_estimate_line_measurements")
    .select("nos, length, breadth, depth")
    .eq("line_id", lineId);
  if (readError) {
    console.error("syncLineQty (read) failed:", readError);
    return "The row was saved, but the work's quantity could not be updated. Change any row to retry.";
  }
  if (!rows || rows.length === 0) return undefined;

  const total = sheetTotal(rows);
  if (!(total > 0)) {
    return "The measurements add up to nothing — check the rows.";
  }

  const { error } = await supabase
    .from("estimator_estimate_lines")
    .update({ qty: total, updated_by: userId })
    .eq("id", lineId);
  if (error) {
    if (error.code === "P0001") return error.message;
    console.error("syncLineQty (write) failed:", error);
    return "The row was saved, but the work's quantity could not be updated. Change any row to retry.";
  }
  return undefined;
}

export async function addLineMeasurement(
  lineId: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireTool(GRANT);
  if (!lineId) return { error: "Which work?" };

  const fields: MeasurementFields = {
    description: text(formData, "description") || null,
    nos: parseNumber(formData.get("nos")),
    length: parseNumber(formData.get("length")),
    breadth: parseNumber(formData.get("breadth")),
    depth: parseNumber(formData.get("depth")),
  };
  const problem = checkMeasurement(fields);
  if (problem) return { error: problem };

  const supabase = await createClient();

  // New rows go to the bottom of the sheet.
  const { data: last, error: lastError } = await supabase
    .from("estimator_estimate_line_measurements")
    .select("sort_order")
    .eq("line_id", lineId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastError) {
    console.error("addLineMeasurement (order) failed:", lastError);
    return { error: "Could not add the row. Try again." };
  }

  const { error } = await supabase.from("estimator_estimate_line_measurements").insert({
    line_id: lineId,
    ...fields,
    sort_order: (last?.sort_order ?? 0) + 1,
    created_by: user.id,
    updated_by: user.id,
  });
  if (error) {
    if (error.code === "P0001") return { error: error.message };
    console.error("addLineMeasurement failed:", error);
    return { error: "Could not add the row. Try again." };
  }

  const syncError = await syncLineQty(supabase, lineId, user.id);
  revalidatePath("/estimator", "layout");
  return syncError ? { error: syncError } : undefined;
}

export async function updateLineMeasurement(
  id: string,
  fields: MeasurementFields,
): Promise<ActionState> {
  const user = await requireTool(GRANT);
  if (!id) return { error: "Which row?" };

  // A server action's argument is whatever the caller sent, not what the
  // type says. Build the update from exactly these five fields — never a
  // spread — so extra keys (line_id, created_by, …) can't ride along
  // and move a row onto another work. A box that isn't a number or null
  // becomes NaN, which checkMeasurement refuses.
  const box = (value: unknown): number | null =>
    value === null ? null : typeof value === "number" ? value : Number.NaN;
  const cleaned: MeasurementFields = {
    description: typeof fields?.description === "string" ? fields.description.trim() || null : null,
    nos: box(fields?.nos),
    length: box(fields?.length),
    breadth: box(fields?.breadth),
    depth: box(fields?.depth),
  };
  const problem = checkMeasurement(cleaned);
  if (problem) return { error: problem };

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("estimator_estimate_line_measurements")
    .update({ ...cleaned, updated_by: user.id })
    .eq("id", id)
    .select("line_id")
    .maybeSingle();
  if (error) {
    if (error.code === "P0001") return { error: error.message };
    console.error("updateLineMeasurement failed:", error);
    return { error: "Could not save the row. Try again." };
  }
  if (!row) return { error: "That row is no longer on the sheet — reload the page." };

  const syncError = await syncLineQty(supabase, row.line_id, user.id);
  revalidatePath("/estimator", "layout");
  return syncError ? { error: syncError } : undefined;
}

export async function removeLineMeasurement(id: string): Promise<ActionState> {
  const user = await requireTool(GRANT);
  if (!id) return { error: "Which row?" };
  const supabase = await createClient();

  const { data: row, error } = await supabase
    .from("estimator_estimate_line_measurements")
    .delete()
    .eq("id", id)
    .select("line_id")
    .maybeSingle();
  if (error) {
    if (error.code === "P0001") return { error: error.message };
    console.error("removeLineMeasurement failed:", error);
    return { error: "Could not remove the row. Try again." };
  }

  const syncError = row ? await syncLineQty(supabase, row.line_id, user.id) : undefined;
  revalidatePath("/estimator", "layout");
  return syncError ? { error: syncError } : undefined;
}

/**
 * Copy one work's measurement rows onto another work of the same
 * estimate — a wall measured once for brickwork is the same wall for its
 * plaster and its paint. The rows land at the bottom of the other sheet
 * as they are; the person then adjusts what differs (plaster has no
 * thickness), because the app never converts units.
 */
export async function copyMeasurementRows(
  fromLineId: string,
  toLineId: string,
): Promise<ActionState> {
  const user = await requireTool(GRANT);
  if (!fromLineId || !toLineId || fromLineId === toLineId) {
    return { error: "Pick the other work to copy the rows to." };
  }
  const supabase = await createClient();

  const { data: lines, error: linesError } = await supabase
    .from("estimator_estimate_lines")
    .select("id, estimate_id")
    .in("id", [fromLineId, toLineId]);
  if (linesError) {
    console.error("copyMeasurementRows (lines) failed:", linesError);
    return { error: "Could not copy the rows. Try again." };
  }
  if (!lines || lines.length !== 2 || lines[0].estimate_id !== lines[1].estimate_id) {
    return { error: "Both works must be on this estimate — reload the page." };
  }

  const [source, last] = await Promise.all([
    supabase
      .from("estimator_estimate_line_measurements")
      .select("description, nos, length, breadth, depth")
      .eq("line_id", fromLineId)
      .order("sort_order")
      .order("id"),
    supabase
      .from("estimator_estimate_line_measurements")
      .select("sort_order")
      .eq("line_id", toLineId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (source.error || last.error) {
    console.error("copyMeasurementRows (rows) failed:", source.error ?? last.error);
    return { error: "Could not copy the rows. Try again." };
  }
  if (!source.data || source.data.length === 0) return { error: "There are no rows to copy." };

  const start = last.data?.sort_order ?? 0;
  const { error } = await supabase.from("estimator_estimate_line_measurements").insert(
    source.data.map((row, index) => ({
      line_id: toLineId,
      description: row.description,
      nos: row.nos,
      length: row.length,
      breadth: row.breadth,
      depth: row.depth,
      sort_order: start + index + 1,
      created_by: user.id,
      updated_by: user.id,
    })),
  );
  if (error) {
    if (error.code === "P0001") return { error: error.message };
    console.error("copyMeasurementRows failed:", error);
    return { error: "Could not copy the rows. Try again." };
  }

  const syncError = await syncLineQty(supabase, toLineId, user.id);
  revalidatePath("/estimator", "layout");
  return syncError ? { error: syncError } : undefined;
}

/* ------------------------------------------------------------------ *
 * This villa's materials for a work (0087) — "every house is different"
 *
 * The rate book (the Works tab) is the standard. A villa line follows it
 * until something about its materials is changed: the FIRST change
 * copies the rate book's list onto the line (copy-on-write — there is no
 * separate "Customise" step any more), and from then on that list —
 * whole, not a delta — is what the line means. Back to the rate book
 * deletes it. Removing the last material does the same: an empty own
 * list is not something the database can tell from "follow the rate
 * book". The draft-only trigger is the boundary; these actions just
 * speak plainly.
 * ------------------------------------------------------------------ */

/** What can change in a villa's list, addressed by what a row names —
 * "material:<item id>" or "mix:<mix id>" — because a row that still
 * follows the rate book has no id of its own on this line. */
export type RecipeChange =
  | { op: "add"; ref: string; qty: number }
  | { op: "qty"; ref: string; qty: number }
  | { op: "swap"; ref: string; to: string }
  | { op: "remove"; ref: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseRef(ref: unknown): { item_id: string | null; mix_id: string | null } | null {
  if (typeof ref !== "string") return null;
  const [kind, id] = ref.split(":");
  if (!id || !UUID.test(id)) return null;
  if (kind === "material") return { item_id: id, mix_id: null };
  if (kind === "mix") return { item_id: null, mix_id: id };
  return null;
}

/** Copy the rate book's list onto the line if it has none of its own
 * yet. A message on failure, undefined when the line now owns its list. */
async function ensureOwnRecipe(
  supabase: Awaited<ReturnType<typeof createClient>>,
  lineId: string,
  userId: string,
): Promise<string | undefined> {
  const { data: line, error: lineError } = await supabase
    .from("estimator_estimate_lines")
    .select("id, work_item_id")
    .eq("id", lineId)
    .maybeSingle();
  if (lineError) {
    console.error("ensureOwnRecipe (line) failed:", lineError);
    return "Could not read this work. Try again.";
  }
  if (!line) return "That work is no longer on the estimate — reload the page.";

  const { count, error: countError } = await supabase
    .from("estimator_estimate_line_components")
    .select("id", { count: "exact", head: true })
    .eq("line_id", lineId);
  if (countError) {
    console.error("ensureOwnRecipe (count) failed:", countError);
    return "Could not read this villa's materials. Try again.";
  }
  if (count) return undefined;

  const { data: standard, error: standardError } = await supabase
    .from("estimator_work_components")
    .select("item_id, mix_id, qty_per_unit")
    .eq("work_item_id", line.work_item_id);
  if (standardError) {
    console.error("ensureOwnRecipe (rate book) failed:", standardError);
    return "Could not read the rate book. Try again.";
  }
  // A row from before 0086 names neither an item nor a mix; it counts for
  // nothing in the rate book, so it is not carried into the villa's copy.
  const rows = (standard ?? []).filter((row) => row.item_id || row.mix_id);
  if (rows.length === 0) return undefined; // labour only: the first add starts the list

  const { error } = await supabase.from("estimator_estimate_line_components").insert(
    rows.map((row) => ({
      line_id: lineId,
      item_id: row.item_id,
      mix_id: row.mix_id,
      qty_per_unit: row.qty_per_unit,
      created_by: userId,
      updated_by: userId,
    })),
  );
  if (error) {
    if (error.code === "P0001") return error.message;
    console.error("ensureOwnRecipe (copy) failed:", error);
    return "Could not start this villa's own list. Try again.";
  }
  return undefined;
}

export async function changeLineRecipe(lineId: string, change: RecipeChange): Promise<ActionState> {
  const user = await requireTool(GRANT);
  if (!lineId) return { error: "Which work?" };

  // The argument is whatever the caller sent, not what the type says.
  const op = change?.op;
  const target = parseRef(change?.ref);
  if (!target) return { error: "Pick a material or a mix." };
  const replacement = op === "swap" ? parseRef((change as { to?: unknown }).to) : null;
  if (op === "swap" && !replacement) return { error: "Pick what to use instead." };
  const qty = op === "add" || op === "qty" ? (change as { qty?: unknown }).qty : null;
  if (
    (op === "add" || op === "qty") &&
    (typeof qty !== "number" || !Number.isFinite(qty) || qty <= 0)
  ) {
    return { error: "Enter how much of it one unit of the work needs." };
  }
  if (op !== "add" && op !== "qty" && op !== "swap" && op !== "remove") {
    return { error: "That change isn't one this screen makes." };
  }

  const supabase = await createClient();
  const ownError = await ensureOwnRecipe(supabase, lineId, user.id);
  if (ownError) return { error: ownError };

  const column = target.item_id ? "item_id" : "mix_id";
  const value = (target.item_id ?? target.mix_id) as string;
  const table = () => supabase.from("estimator_estimate_line_components");

  let error: { code?: string; message: string } | null = null;
  let touched = 1;
  if (op === "add") {
    ({ error } = await table().insert({
      line_id: lineId,
      ...target,
      qty_per_unit: qty as number,
      created_by: user.id,
      updated_by: user.id,
    }));
  } else if (op === "qty") {
    const result = await table()
      .update({ qty_per_unit: qty as number, updated_by: user.id }, { count: "exact" })
      .eq("line_id", lineId)
      .eq(column, value);
    error = result.error;
    touched = result.count ?? 0;
  } else if (op === "swap") {
    const result = await table()
      .update({ ...replacement, updated_by: user.id }, { count: "exact" })
      .eq("line_id", lineId)
      .eq(column, value);
    error = result.error;
    touched = result.count ?? 0;
  } else {
    const result = await table().delete({ count: "exact" }).eq("line_id", lineId).eq(column, value);
    error = result.error;
    touched = result.count ?? 0;
  }

  if (error) {
    if (error.code === "23505") {
      return { error: "That is already in this villa's list — change its quantity instead." };
    }
    if (error.code === "P0001") return { error: error.message };
    console.error(`changeLineRecipe (${op}) failed:`, error);
    return { error: "Could not save that change. Try again." };
  }
  if (touched === 0) return { error: "That is no longer in the list — reload the page." };

  revalidatePath("/estimator", "layout");
  return undefined;
}

/**
 * This villa's labour rate for one work (0088) — null clears it and the
 * work's standard rate shows through again. Zero is a real rate (labour
 * inside a contract), not "unpriced", so it is saved as 0 and only an
 * empty box clears. The 0077 draft-only line guard is the boundary.
 */
export async function updateEstimateLineLabourRate(
  lineId: string,
  rate: number | null,
): Promise<ActionState> {
  const user = await requireTool(GRANT);
  if (!lineId) return { error: "Which work?" };
  if (rate !== null && (!Number.isFinite(rate) || rate < 0)) {
    return { error: "The labour rate must be a number, or left blank to use the standard." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("estimator_estimate_lines")
    .update({ labour_rate: rate, updated_by: user.id })
    .eq("id", lineId);
  if (error) {
    if (error.code === "P0001") return { error: error.message };
    console.error("updateEstimateLineLabourRate failed:", error);
    return { error: "Could not save the labour rate. Try again." };
  }

  revalidatePath("/estimator", "layout");
  return undefined;
}

/**
 * This villa's price for one material (0088). Per ESTIMATE, not per
 * line: cement costing more at a far plot costs more for every work
 * that uses it, and one row per material makes two works disagreeing
 * impossible.
 */
export async function setEstimateItemRate(
  estimateId: string,
  itemId: string,
  rate: number | null,
): Promise<ActionState> {
  const user = await requireTool(GRANT);
  if (!estimateId) return { error: "Which estimate?" };
  if (!itemId) return { error: "Pick one material." };

  const supabase = await createClient();

  // Blank clears the override — back to the price in Masters.
  if (rate === null) {
    const { error } = await supabase
      .from("estimator_estimate_item_rates")
      .delete()
      .eq("estimate_id", estimateId)
      .eq("item_id", itemId);
    if (error) {
      if (error.code === "P0001") return { error: error.message };
      console.error("setEstimateItemRate (clear) failed:", error);
      return { error: "Could not clear the price. Try again." };
    }
    revalidatePath("/estimator", "layout");
    return undefined;
  }

  if (!Number.isFinite(rate) || rate < 0) {
    return { error: "The price must be a number, or left blank to use the price in Masters." };
  }

  // Update-then-insert, not upsert: the uniqueness is a PARTIAL index
  // (one per source column, because a table-level UNIQUE over nullable
  // columns allows duplicates), and PostgREST cannot infer a conflict
  // target from a partial index. This order also never leaves the
  // material momentarily unpriced, which delete-then-insert would.
  const { error: updateError, count } = await supabase
    .from("estimator_estimate_item_rates")
    .update({ rate, updated_by: user.id }, { count: "exact" })
    .eq("estimate_id", estimateId)
    .eq("item_id", itemId);
  if (updateError) {
    if (updateError.code === "P0001") return { error: updateError.message };
    console.error("setEstimateItemRate (update) failed:", updateError);
    return { error: "Could not save the price. Try again." };
  }

  if (!count) {
    const { error } = await supabase.from("estimator_estimate_item_rates").insert({
      estimate_id: estimateId,
      item_id: itemId,
      rate,
      created_by: user.id,
      updated_by: user.id,
    });
    if (error) {
      if (error.code === "P0001") return { error: error.message };
      console.error("setEstimateItemRate (insert) failed:", error);
      return { error: "Could not save the price. Try again." };
    }
  }

  revalidatePath("/estimator", "layout");
  return undefined;
}

export async function resetEstimateLine(lineId: string): Promise<ActionState> {
  await requireTool(GRANT);
  if (!lineId) return { error: "Which work?" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("estimator_estimate_line_components")
    .delete()
    .eq("line_id", lineId);
  if (error) {
    if (error.code === "P0001") return { error: error.message };
    console.error("resetEstimateLine failed:", error);
    return { error: "Could not reset this work. Try again." };
  }

  revalidatePath("/estimator", "layout");
  return undefined;
}

/**
 * Make official (0098) — the villa's working estimate becomes a numbered,
 * frozen estimate, the one the stores and site check against, and the
 * working estimate stays open for the next change.
 *
 * The arithmetic lives in calc.ts and nowhere else, so the app computes
 * the snapshot here — per-work costs and the per-(work, item) takeoff —
 * and make_estimate_official() does the rest in one transaction: copies
 * the working estimate into a new header with its sheets, materials and
 * prices, writes the snapshot, refuses if the snapshot no longer matches
 * what it copied (an edit made in between), then mints the number and
 * supersedes the villa's previous official through 0077's
 * submit_estimate().
 */
export async function makeOfficial(workingId: string): Promise<ActionState> {
  await requireTool(GRANT);
  const supabase = await createClient();

  const { data: working, error: readError } = await supabase
    .from("estimator_estimates")
    .select("id, is_working")
    .eq("id", workingId)
    .maybeSingle();
  if (readError) {
    console.error("makeOfficial (read) failed:", readError);
    return { error: "Could not read the estimate. Try again." };
  }
  if (!working) return { error: "That estimate no longer exists." };
  if (!working.is_working) {
    return { error: "Only a villa's working estimate can be made official." };
  }

  // The recipe book and the variations read to completion and throw on
  // a failed page (fetchAll); an action answers with ActionState instead.
  let book: Awaited<ReturnType<typeof getRecipeBook>>;
  let variations: Awaited<ReturnType<typeof getEstimateVariations>>;
  try {
    [book, variations] = await Promise.all([getRecipeBook(), getEstimateVariations(workingId)]);
  } catch (error) {
    console.error("makeOfficial (recipes) failed:", error);
    return { error: "Could not read the recipes. Try again." };
  }
  const lines = await supabase
    .from("estimator_estimate_lines")
    .select("id, work_item_id, qty")
    .eq("estimate_id", workingId);
  if (lines.error) {
    console.error("makeOfficial (lines) failed:", lines.error);
    return { error: "Could not read the estimate's works. Try again." };
  }
  if (!lines.data || lines.data.length === 0) {
    return { error: "Add at least one work before making this estimate official." };
  }
  if (lines.data.some((line) => line.qty === null)) {
    const count = lines.data.filter((line) => line.qty === null).length;
    return {
      error: `${count} ${count === 1 ? "work is" : "works are"} still to measure — measure them, or take them off, first.`,
    };
  }

  // This villa's own figures replace the rate book's before any
  // arithmetic runs — the freeze captures what THIS house means.
  const materialsById = new Map(
    applyRateOverrides(
      [...book.materials, ...variations.extraMaterials],
      variations.rateByMaterialId,
    ).map((m) => [m.id, m]),
  );
  const mixesById = new Map(book.mixes.map((m) => [m.id, m]));
  const recipesByWork = new Map(
    applyEstimateOverrides(book.recipes, variations.byWork, variations.labourRateByWork).map(
      (r) => [r.workItemId, r],
    ),
  );

  const lineInputs = lines.data.map((line) => ({ workItemId: line.work_item_id, qty: line.qty }));
  const costs = lines.data.map((line) => {
    const recipe = recipesByWork.get(line.work_item_id);
    const cost = computeLine(
      { workItemId: line.work_item_id, qty: line.qty },
      recipe,
      mixesById,
      materialsById,
    );
    return {
      work_item_id: line.work_item_id,
      qty: line.qty,
      uom: recipe?.uom ?? null,
      labour_rate: recipe?.labourRate ?? null,
      labour_cost: cost.labourCost,
      material_cost: cost.materialCost,
      total_cost: cost.totalCost,
    };
  });
  // Every material a recipe can name is a master item (0086), so the
  // snapshot anchors on item_id and leaves the retired column null.
  const takeoff = computeWorkTakeoff(lineInputs, recipesByWork, mixesById).map((row) => {
    const material = materialsById.get(row.materialId);
    return {
      work_item_id: row.workItemId,
      item_id: row.materialId,
      material_name: material?.name ?? "Unknown material",
      uom: material?.uom ?? "",
      quantity: row.quantity,
      rate: material?.rate ?? null,
    };
  });

  const { error: rpcError } = await supabase.rpc("make_estimate_official", {
    p_working: workingId,
    p_costs: costs,
    p_takeoff: takeoff,
  });
  if (rpcError) {
    if (rpcError.message.includes("estimator_estimates_official_key")) {
      return {
        error:
          "Another estimate was just made official for this villa — reload and look at it first.",
      };
    }
    if (rpcError.code === "P0001") return { error: rpcError.message };
    console.error("makeOfficial (rpc) failed:", rpcError);
    return { error: "Could not make the estimate official. Try again." };
  }

  revalidatePath("/estimator", "layout");
  return undefined;
}

// ---------------------------------------------------------------------
// Reconciliation approvals (0083)
// ---------------------------------------------------------------------

/**
 * Acknowledge material that reached the villa outside the official
 * estimate. It counts for the villa's later official estimates too
 * (founder, 2026-09-26). The approval does NOT clear the flag — the founder's rule
 * is that an unplanned arrival sits in the estimate forever with its
 * badge; approving records that an estimator has seen it and stands by
 * it, with an optional note saying why it was needed.
 */
export async function approveReconciliation(input: {
  estimateId: string;
  itemId: string;
  workItemId: string | null;
  note: string;
}): Promise<ActionState> {
  const user = await requireTool(GRANT);

  const estimateId = input.estimateId;
  const itemId = input.itemId;
  const workItemId = input.workItemId || null;
  const note = input.note.trim().slice(0, TEXT_LIMIT) || null;
  if (!estimateId || !itemId) return { error: "This entry is missing its ids — reload the page." };

  const supabase = await createClient();

  // Only the villa's OFFICIAL estimate carries the comparison, so only
  // it can be reconciled against — a draft has nothing frozen to be
  // outside of, and a superseded estimate has been replaced.
  const { data: estimate, error: readError } = await supabase
    .from("estimator_estimates")
    .select("status")
    .eq("id", estimateId)
    .maybeSingle();
  if (readError) {
    console.error("approveReconciliation read failed:", readError);
    return { error: "Could not check the estimate. Try again." };
  }
  if (!estimate) return { error: "That estimate no longer exists." };
  if (estimate.status !== "submitted") {
    return { error: "Only the villa's official estimate can be reconciled." };
  }

  const { error } = await supabase.from("estimator_reconciliation_approvals").insert({
    estimate_id: estimateId,
    work_item_id: workItemId,
    item_id: itemId,
    note,
    created_by: user.id,
    updated_by: user.id,
  });
  if (error) {
    if (error.code === "23505") {
      // Two estimators looked at once; the first approval stands.
      revalidatePath("/estimator", "layout");
      return undefined;
    }
    console.error("approveReconciliation failed:", error);
    return { error: "Could not record the approval. Try again." };
  }

  revalidatePath("/estimator", "layout");
  return undefined;
}
