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
 * A template is an estimate with no villa (the database's CHECK says the
 * same thing), so one form makes both: pick a villa for a real estimate,
 * leave it blank for a template.
 */
export async function createEstimate(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const name = text(formData, "name");
  const projectId = text(formData, "project_id");
  const unitId = text(formData, "unit_id");
  const note = text(formData, "note");

  if (!projectId) return { error: "Pick the project." };
  if (!name) return { error: "Give the estimate a name." };
  if (name.length > NAME_LIMIT) return { error: `Keep the name under ${NAME_LIMIT} characters.` };
  if (note.length > TEXT_LIMIT) return { error: "That note is too long." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("estimator_estimates")
    .insert({
      project_id: projectId,
      unit_id: unitId || null,
      is_template: !unitId,
      name,
      note: note || null,
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("createEstimate failed:", error);
    return { error: "Could not create the estimate. Try again." };
  }

  revalidatePath("/estimator", "layout");
  redirect(`/estimator/estimates/${data.id}`);
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

  // Only drafts delete (the 0077 policy and guards agree); saying it
  // here beats surfacing a trigger message. A submitted estimate is
  // superseded by a revision, never erased.
  const { data: estimate, error: readError } = await supabase
    .from("estimator_estimates")
    .select("status")
    .eq("id", id)
    .maybeSingle();
  if (readError) {
    console.error("deleteEstimate (read) failed:", readError);
    return { error: "Could not delete the estimate. Try again." };
  }
  if (estimate && estimate.status !== "draft") {
    return {
      error: "Only a draft can be deleted. A submitted estimate is superseded by a revision.",
    };
  }

  // A draft may carry snapshot rows from a submit that failed part-way;
  // they go first (takeoff has no line link, line costs die with the
  // lines but are cleared explicitly for the same reason).
  const staleTakeoff = await supabase
    .from("estimator_estimate_takeoff")
    .delete()
    .eq("estimate_id", id);
  const staleCosts = await supabase
    .from("estimator_estimate_line_costs")
    .delete()
    .eq("estimate_id", id);
  if (staleTakeoff.error || staleCosts.error) {
    console.error("deleteEstimate (snapshot) failed:", staleTakeoff.error ?? staleCosts.error);
    return { error: "Could not delete the estimate. Try again." };
  }

  // This villa's prices (0088) go with the estimate.
  const staleRates = await supabase
    .from("estimator_estimate_item_rates")
    .delete()
    .eq("estimate_id", id);
  if (staleRates.error) {
    console.error("deleteEstimate (prices) failed:", staleRates.error);
    return { error: "Could not delete the estimate. Try again." };
  }

  // Variations (0087) go before their lines — RESTRICT, not cascade.
  const { data: lineIds, error: lineIdsError } = await supabase
    .from("estimator_estimate_lines")
    .select("id")
    .eq("estimate_id", id);
  if (lineIdsError) {
    console.error("deleteEstimate (line ids) failed:", lineIdsError);
    return { error: "Could not delete the estimate. Try again." };
  }
  if (lineIds && lineIds.length > 0) {
    const { error: variationError } = await supabase
      .from("estimator_estimate_line_components")
      .delete()
      .in(
        "line_id",
        lineIds.map((line) => line.id),
      );
    if (variationError) {
      console.error("deleteEstimate (variations) failed:", variationError);
      return { error: "Could not delete the estimate. Try again." };
    }
    // Measurement sheets (0096) too — RESTRICT, not cascade.
    const { error: measurementError } = await supabase
      .from("estimator_estimate_line_measurements")
      .delete()
      .in(
        "line_id",
        lineIds.map((line) => line.id),
      );
    if (measurementError) {
      console.error("deleteEstimate (measurements) failed:", measurementError);
      return { error: "Could not delete the estimate. Try again." };
    }
  }

  const { error: lineError } = await supabase
    .from("estimator_estimate_lines")
    .delete()
    .eq("estimate_id", id);
  if (lineError) {
    console.error("deleteEstimate (lines) failed:", lineError);
    return { error: "Could not delete the estimate. Try again." };
  }

  const { error } = await supabase.from("estimator_estimates").delete().eq("id", id);
  if (error) {
    console.error("deleteEstimate failed:", error);
    return { error: "Could not delete the estimate. Try again." };
  }

  revalidatePath("/estimator", "layout");
  redirect("/estimator/estimates");
}

export async function addEstimateLine(
  estimateId: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const workItemId = text(formData, "work_item_id");
  const qty = parseNumber(formData.get("qty"));
  const note = text(formData, "note");

  if (!workItemId) return { error: "Pick the work." };
  if (qty === null || Number.isNaN(qty) || qty <= 0) {
    return { error: "Enter how much of it this villa needs." };
  }
  if (note.length > TEXT_LIMIT) return { error: "That note is too long." };

  const supabase = await createClient();
  const { error } = await supabase.from("estimator_estimate_lines").insert({
    estimate_id: estimateId,
    work_item_id: workItemId,
    qty,
    note: note || null,
    created_by: user.id,
    updated_by: user.id,
  });
  if (error) {
    if (error.code === "23505") {
      return { error: "That work is already on this estimate — edit its quantity instead." };
    }
    console.error("addEstimateLine failed:", error);
    return { error: "Could not add the work. Try again." };
  }

  revalidatePath("/estimator", "layout");
  return undefined;
}

export async function updateEstimateLineQty(id: string, qty: number): Promise<ActionState> {
  const user = await requireTool(GRANT);
  if (!Number.isFinite(qty) || qty <= 0) return { error: "The quantity must be more than zero." };

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
 * Copy every line's variation (0087) from one estimate to another, by
 * work (unique per estimate, so the mapping is honest). Returns an
 * error message or undefined — the CALLER owns the cleanup, because it
 * owns the half-created estimate.
 */
async function copyLineVariations(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sourceEstimateId: string,
  targetEstimateId: string,
  userId: string,
): Promise<string | undefined> {
  const { data: sourceLines, error: sourceError } = await supabase
    .from("estimator_estimate_lines")
    .select("id, work_item_id")
    .eq("estimate_id", sourceEstimateId);
  if (sourceError) {
    console.error("copyLineVariations (source lines) failed:", sourceError);
    return "Could not read the works' variations.";
  }
  if (!sourceLines || sourceLines.length === 0) return undefined;

  const { data: components, error: componentsError } = await supabase
    .from("estimator_estimate_line_components")
    .select("line_id, item_id, mix_id, qty_per_unit")
    .in(
      "line_id",
      sourceLines.map((line) => line.id),
    );
  if (componentsError) {
    console.error("copyLineVariations (components) failed:", componentsError);
    return "Could not read the works' variations.";
  }
  if (!components || components.length === 0) return undefined;

  const { data: targetLines, error: targetError } = await supabase
    .from("estimator_estimate_lines")
    .select("id, work_item_id")
    .eq("estimate_id", targetEstimateId);
  if (targetError) {
    console.error("copyLineVariations (target lines) failed:", targetError);
    return "Could not copy the works' variations.";
  }

  const sourceWorkByLine = new Map(sourceLines.map((line) => [line.id, line.work_item_id]));
  const targetLineByWork = new Map((targetLines ?? []).map((line) => [line.work_item_id, line.id]));

  const rows = components.flatMap((component) => {
    // A row from before 0086 names neither — it counted for nothing, so
    // it is not copied.
    if (!component.item_id && !component.mix_id) return [];
    const workItemId = sourceWorkByLine.get(component.line_id);
    const targetLineId = workItemId ? targetLineByWork.get(workItemId) : undefined;
    if (!targetLineId) return [];
    return [
      {
        line_id: targetLineId,
        item_id: component.item_id,
        mix_id: component.mix_id,
        qty_per_unit: component.qty_per_unit,
        created_by: userId,
        updated_by: userId,
      },
    ];
  });
  if (rows.length === 0) return undefined;

  const { error: insertError } = await supabase
    .from("estimator_estimate_line_components")
    .insert(rows);
  if (insertError) {
    console.error("copyLineVariations (insert) failed:", insertError);
    return "Could not copy the works' variations.";
  }
  return undefined;
}

/**
 * Copy every line's measurement sheet (0096) from one estimate to
 * another, by work — the copyLineVariations contract: a message, or
 * undefined, and the caller owns the cleanup. The copied line's qty
 * already equals its sheet's total (the source was kept in sync), so
 * nothing needs re-syncing afterwards.
 */
async function copyLineMeasurements(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sourceEstimateId: string,
  targetEstimateId: string,
  userId: string,
): Promise<string | undefined> {
  const { data: sourceLines, error: sourceError } = await supabase
    .from("estimator_estimate_lines")
    .select("id, work_item_id")
    .eq("estimate_id", sourceEstimateId);
  if (sourceError) {
    console.error("copyLineMeasurements (source lines) failed:", sourceError);
    return "Could not read the works' measurements.";
  }
  if (!sourceLines || sourceLines.length === 0) return undefined;

  const { data: rows, error: rowsError } = await supabase
    .from("estimator_estimate_line_measurements")
    .select("line_id, description, nos, length, breadth, depth, sort_order")
    .in(
      "line_id",
      sourceLines.map((line) => line.id),
    );
  if (rowsError) {
    console.error("copyLineMeasurements (rows) failed:", rowsError);
    return "Could not read the works' measurements.";
  }
  if (!rows || rows.length === 0) return undefined;

  const { data: targetLines, error: targetError } = await supabase
    .from("estimator_estimate_lines")
    .select("id, work_item_id")
    .eq("estimate_id", targetEstimateId);
  if (targetError) {
    console.error("copyLineMeasurements (target lines) failed:", targetError);
    return "Could not copy the works' measurements.";
  }

  const sourceWorkByLine = new Map(sourceLines.map((line) => [line.id, line.work_item_id]));
  const targetLineByWork = new Map((targetLines ?? []).map((line) => [line.work_item_id, line.id]));

  const inserts = rows.flatMap((row) => {
    const workItemId = sourceWorkByLine.get(row.line_id);
    const targetLineId = workItemId ? targetLineByWork.get(workItemId) : undefined;
    if (!targetLineId) return [];
    return [
      {
        line_id: targetLineId,
        description: row.description,
        nos: row.nos,
        length: row.length,
        breadth: row.breadth,
        depth: row.depth,
        sort_order: row.sort_order,
        created_by: userId,
        updated_by: userId,
      },
    ];
  });
  if (inserts.length === 0) return undefined;

  const { error: insertError } = await supabase
    .from("estimator_estimate_line_measurements")
    .insert(inserts);
  if (insertError) {
    console.error("copyLineMeasurements (insert) failed:", insertError);
    return "Could not copy the works' measurements.";
  }
  return undefined;
}

/** Undo a half-made copy, in the order the foreign keys demand. */
async function discardCopiedEstimate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  estimateId: string,
): Promise<void> {
  await supabase.from("estimator_estimate_item_rates").delete().eq("estimate_id", estimateId);
  const { data: lines } = await supabase
    .from("estimator_estimate_lines")
    .select("id")
    .eq("estimate_id", estimateId);
  if (lines && lines.length > 0) {
    const lineIds = lines.map((line) => line.id);
    await supabase.from("estimator_estimate_line_components").delete().in("line_id", lineIds);
    await supabase.from("estimator_estimate_line_measurements").delete().in("line_id", lineIds);
  }
  await supabase.from("estimator_estimate_lines").delete().eq("estimate_id", estimateId);
  await supabase.from("estimator_estimates").delete().eq("id", estimateId);
}

/** Copy this villa's material prices (0088) to another estimate. Same
 * contract as copyLineVariations: a message, or undefined. */
async function copyItemRates(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sourceEstimateId: string,
  targetEstimateId: string,
  userId: string,
): Promise<string | undefined> {
  const { data: rates, error: readError } = await supabase
    .from("estimator_estimate_item_rates")
    .select("item_id, rate, note")
    .eq("estimate_id", sourceEstimateId)
    .not("item_id", "is", null);
  if (readError) {
    console.error("copyItemRates (read) failed:", readError);
    return "Could not read this villa's material prices.";
  }
  if (!rates || rates.length === 0) return undefined;

  const { error: insertError } = await supabase.from("estimator_estimate_item_rates").insert(
    rates.map((rate) => ({
      estimate_id: targetEstimateId,
      item_id: rate.item_id,
      rate: rate.rate,
      note: rate.note,
      created_by: userId,
      updated_by: userId,
    })),
  );
  if (insertError) {
    console.error("copyItemRates (insert) failed:", insertError);
    return "Could not copy this villa's material prices.";
  }
  return undefined;
}

/**
 * Copy a template onto a villa — the way every villa estimate starts.
 *
 * Everything the template holds comes across: its works with their
 * quantities and notes, its labour rates, its own recipes (0087), its
 * measurement sheets (0096) and its material prices (0088). Costs are
 * then computed live from today's rates.
 *
 * Several writes with no transaction between them, so a failure part-way
 * would leave a half-copy behind; the copy is discarded again if any of
 * them fails — an honest failure beats a half-copy.
 */
export async function copyTemplateToUnit(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const templateId = text(formData, "template_id");
  const unitId = text(formData, "unit_id");
  const name = text(formData, "name");

  if (!templateId) return { error: "Pick the template to copy." };
  if (!unitId) return { error: "Pick the villa this estimate is for." };
  if (name.length > NAME_LIMIT) return { error: `Keep the name under ${NAME_LIMIT} characters.` };

  const supabase = await createClient();

  const { data: template, error: templateError } = await supabase
    .from("estimator_estimates")
    .select("id, name, project_id, is_template")
    .eq("id", templateId)
    .maybeSingle();
  if (templateError) {
    console.error("copyTemplateToUnit (template) failed:", templateError);
    return { error: "Could not read the template. Try again." };
  }
  if (!template) return { error: "That template no longer exists." };
  if (!template.is_template) return { error: "That is an estimate, not a template." };

  const { data: unit, error: unitError } = await supabase
    .from("units")
    .select("id, name, project_id")
    .eq("id", unitId)
    .maybeSingle();
  if (unitError) {
    console.error("copyTemplateToUnit (unit) failed:", unitError);
    return { error: "Could not read the villa. Try again." };
  }
  if (!unit) return { error: "That villa no longer exists." };
  // The composite FK would refuse this too; saying it plainly is kinder
  // than a constraint error.
  if (unit.project_id !== template.project_id) {
    return { error: "That villa belongs to a different project from the template." };
  }

  const { data: lines, error: linesError } = await supabase
    .from("estimator_estimate_lines")
    .select("work_item_id, qty, note, labour_rate")
    .eq("estimate_id", templateId);
  if (linesError) {
    console.error("copyTemplateToUnit (lines) failed:", linesError);
    return { error: "Could not read the template's works. Try again." };
  }

  const { data: created, error: createError } = await supabase
    .from("estimator_estimates")
    .insert({
      project_id: template.project_id,
      unit_id: unitId,
      is_template: false,
      name: name || `${template.name} — ${unit.name}`,
      source_estimate_id: template.id,
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id")
    .single();
  if (createError || !created) {
    console.error("copyTemplateToUnit (create) failed:", createError);
    return { error: "Could not create the estimate. Try again." };
  }

  if (lines && lines.length > 0) {
    const { error: insertError } = await supabase.from("estimator_estimate_lines").insert(
      lines.map((line) => ({
        estimate_id: created.id,
        work_item_id: line.work_item_id,
        qty: line.qty,
        note: line.note,
        labour_rate: line.labour_rate,
        created_by: user.id,
        updated_by: user.id,
      })),
    );
    if (insertError) {
      console.error("copyTemplateToUnit (copy lines) failed:", insertError);
      await supabase.from("estimator_estimates").delete().eq("id", created.id);
      return { error: "Could not copy the template's works, so nothing was created. Try again." };
    }

    const variationError =
      (await copyLineVariations(supabase, template.id, created.id, user.id)) ??
      (await copyLineMeasurements(supabase, template.id, created.id, user.id)) ??
      (await copyItemRates(supabase, template.id, created.id, user.id));
    if (variationError) {
      await discardCopiedEstimate(supabase, created.id);
      return { error: `${variationError} Nothing was created — try again.` };
    }
  }

  revalidatePath("/estimator", "layout");
  redirect(`/estimator/estimates/${created.id}`);
}

/**
 * Submit — the estimate becomes the villa's official one.
 *
 * The arithmetic lives in calc.ts and nowhere else, so the app computes
 * the snapshot and writes it FIRST, while the estimate is still a
 * draft; submit_estimate() (0077) then validates the snapshot exists,
 * supersedes the previous official estimate, mints EST/<code>/NNN and
 * flips the status — one transaction on the database side.
 *
 * The snapshot writes and the RPC are separate requests (PostgREST
 * gives us no wrapper), so a failure between them leaves a draft with a
 * stale snapshot. That is harmless: every submit deletes and rewrites
 * the snapshot, and the RPC refuses to run without one.
 */
export async function submitEstimate(estimateId: string): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const supabase = await createClient();

  const { data: estimate, error: readError } = await supabase
    .from("estimator_estimates")
    .select("id, status, is_template, unit_id")
    .eq("id", estimateId)
    .maybeSingle();
  if (readError) {
    console.error("submitEstimate (read) failed:", readError);
    return { error: "Could not read the estimate. Try again." };
  }
  if (!estimate) return { error: "That estimate no longer exists." };
  if (estimate.status !== "draft") return { error: "This estimate has already been submitted." };
  if (estimate.is_template || !estimate.unit_id) {
    return { error: "A template cannot be submitted — copy it onto a villa first." };
  }

  // The recipe book and the variations read to completion and throw on
  // a failed page (fetchAll); an action answers with ActionState instead.
  let book: Awaited<ReturnType<typeof getRecipeBook>>;
  let variations: Awaited<ReturnType<typeof getEstimateVariations>>;
  try {
    [book, variations] = await Promise.all([getRecipeBook(), getEstimateVariations(estimateId)]);
  } catch (error) {
    console.error("submitEstimate (recipes) failed:", error);
    return { error: "Could not read the recipes. Try again." };
  }
  const lines = await supabase
    .from("estimator_estimate_lines")
    .select("id, work_item_id, qty")
    .eq("estimate_id", estimateId);
  if (lines.error) {
    console.error("submitEstimate (lines) failed:", lines.error);
    return { error: "Could not read the estimate's works. Try again." };
  }
  if (!lines.data || lines.data.length === 0) {
    return { error: "Add at least one work before submitting this estimate." };
  }

  // This villa's variations replace the standard whole, per customised
  // line (0087 recipes, 0088 labour rates and material prices) — the
  // freeze then captures what THIS house means, forever.
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
  const lineCosts = lineInputs.map((line) =>
    computeLine(line, recipesByWork.get(line.workItemId), mixesById, materialsById),
  );
  const takeoff = computeWorkTakeoff(lineInputs, recipesByWork, mixesById);

  // A previous failed submit may have left snapshot rows; start clean.
  const staleCosts = await supabase
    .from("estimator_estimate_line_costs")
    .delete()
    .eq("estimate_id", estimateId);
  const staleTakeoff = await supabase
    .from("estimator_estimate_takeoff")
    .delete()
    .eq("estimate_id", estimateId);
  if (staleCosts.error || staleTakeoff.error) {
    console.error("submitEstimate (stale) failed:", staleCosts.error ?? staleTakeoff.error);
    return { error: "Could not prepare the snapshot. Try again." };
  }

  const costByWork = new Map(lineCosts.map((cost) => [cost.workItemId, cost]));
  const { error: costsError } = await supabase.from("estimator_estimate_line_costs").insert(
    lines.data.map((line) => {
      const cost = costByWork.get(line.work_item_id);
      const recipe = recipesByWork.get(line.work_item_id);
      return {
        estimate_id: estimateId,
        line_id: line.id,
        work_item_id: line.work_item_id,
        qty: line.qty,
        uom: recipe?.uom ?? null,
        labour_rate: recipe?.labourRate ?? null,
        labour_cost: cost?.labourCost ?? null,
        material_cost: cost?.materialCost ?? null,
        total_cost: cost?.totalCost ?? null,
        created_by: user.id,
        updated_by: user.id,
      };
    }),
  );
  if (costsError) {
    console.error("submitEstimate (line costs) failed:", costsError);
    return { error: "Could not write the snapshot, so nothing was submitted. Try again." };
  }

  if (takeoff.length > 0) {
    // Every material a recipe can name is a master item (0086), so the
    // snapshot anchors on item_id and leaves the retired column null.
    const { error: takeoffError } = await supabase.from("estimator_estimate_takeoff").insert(
      takeoff.map((row) => {
        const material = materialsById.get(row.materialId);
        return {
          estimate_id: estimateId,
          work_item_id: row.workItemId,
          item_id: row.materialId,
          material_name: material?.name ?? "Unknown material",
          uom: material?.uom ?? "",
          quantity: row.quantity,
          rate: material?.rate ?? null,
          created_by: user.id,
          updated_by: user.id,
        };
      }),
    );
    if (takeoffError) {
      console.error("submitEstimate (takeoff) failed:", takeoffError);
      await supabase.from("estimator_estimate_line_costs").delete().eq("estimate_id", estimateId);
      return { error: "Could not write the snapshot, so nothing was submitted. Try again." };
    }
  }

  const { error: rpcError } = await supabase.rpc("submit_estimate", {
    p_estimate_id: estimateId,
  });
  if (rpcError) {
    console.error("submitEstimate (rpc) failed:", rpcError);
    if (rpcError.message.includes("estimator_estimates_official_key")) {
      return {
        error: "Another estimate was just submitted for this villa — reload and look at it first.",
      };
    }
    if (rpcError.message.includes("short code")) {
      return {
        error: "This project has no short code yet — set one in Masters before submitting.",
      };
    }
    return { error: "Could not submit the estimate. Try again." };
  }

  revalidatePath("/estimator", "layout");
  return undefined;
}

/**
 * Revise — copy a submitted (or superseded) estimate's works into a new
 * draft for the same villa, ready to edit and resubmit. The same
 * two-writes-no-transaction shape as copyTemplateToUnit, with the same
 * honest-failure cleanup.
 */
export async function reviseEstimate(estimateId: string): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const supabase = await createClient();

  const { data: source, error: readError } = await supabase
    .from("estimator_estimates")
    .select("id, name, note, project_id, unit_id, is_template, status")
    .eq("id", estimateId)
    .maybeSingle();
  if (readError) {
    console.error("reviseEstimate (read) failed:", readError);
    return { error: "Could not read the estimate. Try again." };
  }
  if (!source) return { error: "That estimate no longer exists." };
  if (source.is_template || !source.unit_id) {
    return { error: "Templates are already editable — revising is for submitted estimates." };
  }
  if (source.status === "draft") {
    return { error: "This estimate is still a draft — edit it directly." };
  }

  const { data: lines, error: linesError } = await supabase
    .from("estimator_estimate_lines")
    .select("work_item_id, qty, note, labour_rate")
    .eq("estimate_id", estimateId);
  if (linesError) {
    console.error("reviseEstimate (lines) failed:", linesError);
    return { error: "Could not read the estimate's works. Try again." };
  }

  const { data: created, error: createError } = await supabase
    .from("estimator_estimates")
    .insert({
      project_id: source.project_id,
      unit_id: source.unit_id,
      is_template: false,
      name: source.name,
      note: source.note,
      source_estimate_id: source.id,
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id")
    .single();
  if (createError || !created) {
    console.error("reviseEstimate (create) failed:", createError);
    return { error: "Could not create the revision. Try again." };
  }

  if (lines && lines.length > 0) {
    const { error: insertError } = await supabase.from("estimator_estimate_lines").insert(
      lines.map((line) => ({
        estimate_id: created.id,
        work_item_id: line.work_item_id,
        qty: line.qty,
        note: line.note,
        labour_rate: line.labour_rate,
        created_by: user.id,
        updated_by: user.id,
      })),
    );
    if (insertError) {
      console.error("reviseEstimate (copy lines) failed:", insertError);
      await supabase.from("estimator_estimates").delete().eq("id", created.id);
      return { error: "Could not copy the works, so nothing was created. Try again." };
    }

    // The villa's variations travel into the revision — a revise that
    // silently returned every work to standard would rewrite the house.
    const variationError =
      (await copyLineVariations(supabase, source.id, created.id, user.id)) ??
      (await copyLineMeasurements(supabase, source.id, created.id, user.id)) ??
      (await copyItemRates(supabase, source.id, created.id, user.id));
    if (variationError) {
      await discardCopiedEstimate(supabase, created.id);
      return { error: `${variationError} Nothing was created — try again.` };
    }
  }

  revalidatePath("/estimator", "layout");
  redirect(`/estimator/estimates/${created.id}`);
}

// ---------------------------------------------------------------------
// Reconciliation approvals (0083)
// ---------------------------------------------------------------------

/**
 * Acknowledge material that reached the villa outside the official
 * estimate. The approval does NOT clear the flag — the founder's rule
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
