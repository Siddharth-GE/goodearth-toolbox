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
} from "./calc";
import { getEstimateVariations, getRecipeBook } from "./queries";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const GRANT = "/estimator";
const NAME_LIMIT = 120;
const UOM_LIMIT = 20;
const TEXT_LIMIT = 2000;

/**
 * A foreign key refusing a delete is not a bug — it is the house rule
 * that reference data in use is deactivated, never removed. Say so.
 */
function deleteError(error: { code?: string }, what: string, instead: string): string {
  if (error.code === "23503") return `This ${what} is in use, so it can't be deleted. ${instead}`;
  return `Could not delete the ${what}. Try again.`;
}

// Units of measure moved to Masters on 2026-08-20 (0082): one list for
// the whole toolbox, managed at /masters/uoms. The 0075 private master
// (estimator_uoms) is retired in place — the table stays, nothing
// reads it, and this tool's pickers read the shared list.

// ---------------------------------------------------------------------
// Mixes
// ---------------------------------------------------------------------

type MixFields = { name: string; uom: string; description: string | null; is_active: boolean };

function readMixFields(formData: FormData): MixFields | { error: string } {
  const name = text(formData, "name");
  const uom = text(formData, "uom");
  const description = text(formData, "description");

  if (!name) return { error: "Give the mix a name, like M20 concrete." };
  if (name.length > NAME_LIMIT) return { error: `Keep the name under ${NAME_LIMIT} characters.` };
  if (!uom) return { error: "Say what one unit of the mix is, like cum." };
  if (uom.length > UOM_LIMIT) return { error: `Keep the unit under ${UOM_LIMIT} characters.` };
  if (description.length > TEXT_LIMIT) return { error: "That description is too long." };

  return {
    name,
    uom,
    description: description || null,
    is_active: formData.get("is_active") === "1",
  };
}

export async function createMix(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const fields = readMixFields(formData);
  if ("error" in fields) return fields;

  const supabase = await createClient();
  const { error } = await supabase
    .from("estimator_mixes")
    .insert({ ...fields, created_by: user.id, updated_by: user.id });
  if (error) {
    if (error.code === "23505") return { error: "A mix with that name already exists." };
    console.error("createMix failed:", error);
    return { error: "Could not add the mix. Try again." };
  }

  revalidatePath("/estimator", "layout");
  return undefined;
}

export async function updateMix(
  id: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const fields = readMixFields(formData);
  if ("error" in fields) return fields;

  const supabase = await createClient();
  const { error } = await supabase
    .from("estimator_mixes")
    .update({ ...fields, updated_by: user.id })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") return { error: "Another mix already has that name." };
    console.error("updateMix failed:", error);
    return { error: "Could not update the mix. Try again." };
  }

  revalidatePath("/estimator", "layout");
  return undefined;
}

export async function deleteMix(id: string): Promise<ActionState> {
  await requireTool(GRANT);
  const supabase = await createClient();

  // Its own composition goes with it; a mix used by a work recipe is
  // refused by the FK, which is the answer we want.
  const { error: componentError } = await supabase
    .from("estimator_mix_components")
    .delete()
    .eq("mix_id", id);
  if (componentError) {
    console.error("deleteMix (components) failed:", componentError);
    return { error: "Could not delete the mix. Try again." };
  }

  const { error } = await supabase.from("estimator_mixes").delete().eq("id", id);
  if (error) {
    console.error("deleteMix failed:", error);
    return { error: deleteError(error, "mix", "Switch it off instead.") };
  }

  revalidatePath("/estimator", "layout");
  redirect("/estimator/mixes");
}

export async function addMixComponent(
  mixId: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireTool(GRANT);
  // Since 0086 a mix is a combination of master ITEMS (founder: the
  // items master is the one material list) — material_id is legacy.
  const itemId = text(formData, "item_id");
  const qty = parseNumber(formData.get("qty_per_unit"));

  if (!itemId) return { error: "Pick a material from Masters." };
  if (qty === null || Number.isNaN(qty) || qty <= 0) {
    return { error: "Enter how much of it one unit of the mix needs." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("estimator_mix_components").insert({
    mix_id: mixId,
    item_id: itemId,
    qty_per_unit: qty,
    created_by: user.id,
    updated_by: user.id,
  });
  if (error) {
    if (error.code === "23505") {
      return { error: "That material is already in this mix — edit its quantity instead." };
    }
    console.error("addMixComponent failed:", error);
    return { error: "Could not add the material. Try again." };
  }

  revalidatePath("/estimator", "layout");
  return undefined;
}

export async function updateMixComponentQty(id: string, qty: number): Promise<ActionState> {
  const user = await requireTool(GRANT);
  if (!Number.isFinite(qty) || qty <= 0) return { error: "The quantity must be more than zero." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("estimator_mix_components")
    .update({ qty_per_unit: qty, updated_by: user.id })
    .eq("id", id);
  if (error) {
    console.error("updateMixComponentQty failed:", error);
    return { error: "Could not save the quantity. Try again." };
  }

  revalidatePath("/estimator", "layout");
  return undefined;
}

export async function removeMixComponent(id: string): Promise<ActionState> {
  await requireTool(GRANT);
  const supabase = await createClient();
  const { error } = await supabase.from("estimator_mix_components").delete().eq("id", id);
  if (error) {
    console.error("removeMixComponent failed:", error);
    return { error: "Could not remove the material. Try again." };
  }

  revalidatePath("/estimator", "layout");
  return undefined;
}

// ---------------------------------------------------------------------
// Work setup and recipes
// ---------------------------------------------------------------------

/**
 * The work's unit and labour rate. One row per work; saving again
 * updates it, so the form is the same either way.
 *
 * Changing the unit after estimate lines exist silently changes what
 * every one of those quantities MEANS — the screen warns before letting
 * it through, and the count comes from getWorkSetup.
 */
export async function saveWorkInfo(
  workItemId: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const uom = text(formData, "uom");
  const labourRate = parseNumber(formData.get("labour_rate"));

  if (!uom) return { error: "Say what the work is measured in, like cum or sqm." };
  if (uom.length > UOM_LIMIT) return { error: `Keep the unit under ${UOM_LIMIT} characters.` };
  if (labourRate !== null && (Number.isNaN(labourRate) || labourRate < 0)) {
    return { error: "The labour rate must be a number, or left blank if it isn't priced yet." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("estimator_work_info").upsert(
    {
      work_item_id: workItemId,
      uom,
      labour_rate: labourRate,
      created_by: user.id,
      updated_by: user.id,
    },
    { onConflict: "work_item_id" },
  );
  if (error) {
    console.error("saveWorkInfo failed:", error);
    return { error: "Could not save the work setup. Try again." };
  }

  revalidatePath("/estimator", "layout");
  return undefined;
}

/** One recipe line: a material OR a mix, never both — the database agrees. */
export async function addWorkComponent(
  workItemId: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const choice = text(formData, "component");
  const qty = parseNumber(formData.get("qty_per_unit"));

  const [kind, refId] = choice.split(":");
  if (!refId || (kind !== "material" && kind !== "mix")) {
    return { error: "Pick a material or a mix." };
  }
  if (qty === null || Number.isNaN(qty) || qty <= 0) {
    return { error: "Enter how much of it one unit of the work needs." };
  }

  const supabase = await createClient();
  // "material" in the form means a master ITEM since 0086.
  const { error } = await supabase.from("estimator_work_components").insert({
    work_item_id: workItemId,
    item_id: kind === "material" ? refId : null,
    mix_id: kind === "mix" ? refId : null,
    qty_per_unit: qty,
    created_by: user.id,
    updated_by: user.id,
  });
  if (error) {
    if (error.code === "23505") {
      return { error: "That is already in this recipe — edit its quantity instead." };
    }
    console.error("addWorkComponent failed:", error);
    return { error: "Could not add it to the recipe. Try again." };
  }

  revalidatePath("/estimator", "layout");
  return undefined;
}

export async function updateWorkComponentQty(id: string, qty: number): Promise<ActionState> {
  const user = await requireTool(GRANT);
  if (!Number.isFinite(qty) || qty <= 0) return { error: "The quantity must be more than zero." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("estimator_work_components")
    .update({ qty_per_unit: qty, updated_by: user.id })
    .eq("id", id);
  if (error) {
    console.error("updateWorkComponentQty failed:", error);
    return { error: "Could not save the quantity. Try again." };
  }

  revalidatePath("/estimator", "layout");
  return undefined;
}

export async function removeWorkComponent(id: string): Promise<ActionState> {
  await requireTool(GRANT);
  const supabase = await createClient();
  const { error } = await supabase.from("estimator_work_components").delete().eq("id", id);
  if (error) {
    console.error("removeWorkComponent failed:", error);
    return { error: "Could not remove it from the recipe. Try again." };
  }

  revalidatePath("/estimator", "layout");
  return undefined;
}

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

  // The line's variation (0087) goes with it — RESTRICT, not cascade.
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
 * Per-villa variations (0087) — "every house is different"
 *
 * The Works tab stays the standard. Customise copies the standard's
 * components onto the line; from then on that list — whole, not a
 * delta — is what the line means, and it no longer follows the
 * standard. Reset deletes it. The draft-only trigger is the boundary;
 * these actions just speak plainly.
 * ------------------------------------------------------------------ */

export async function customiseEstimateLine(lineId: string): Promise<ActionState> {
  const user = await requireTool(GRANT);
  if (!lineId) return { error: "Which work?" };
  const supabase = await createClient();

  const { data: line, error: lineError } = await supabase
    .from("estimator_estimate_lines")
    .select("id, work_item_id")
    .eq("id", lineId)
    .maybeSingle();
  if (lineError || !line) {
    console.error("customiseEstimateLine (line) failed:", lineError);
    return { error: "That work is no longer on the estimate." };
  }

  const { count } = await supabase
    .from("estimator_estimate_line_components")
    .select("id", { count: "exact", head: true })
    .eq("line_id", lineId);
  if (count) return undefined; // already customised — nothing to copy

  const { data: standard, error: standardError } = await supabase
    .from("estimator_work_components")
    .select("item_id, mix_id, material_id, qty_per_unit")
    .eq("work_item_id", line.work_item_id);
  if (standardError) {
    console.error("customiseEstimateLine (standard) failed:", standardError);
    return { error: "Could not read the standard recipe. Try again." };
  }
  if (!standard || standard.length === 0) {
    // A labour-only work has nothing to copy. Saying so beats writing
    // nothing and letting the button look broken — the screen offers
    // the add form directly in this case, and the first material added
    // becomes this villa's version.
    return {
      error:
        "This work is labour only — there is no standard recipe to copy. Add the material you need and it applies to this villa alone.",
    };
  }

  const { error } = await supabase.from("estimator_estimate_line_components").insert(
    standard.map((component) => ({
      line_id: lineId,
      item_id: component.item_id,
      mix_id: component.mix_id,
      material_id: component.material_id,
      qty_per_unit: component.qty_per_unit,
      created_by: user.id,
      updated_by: user.id,
    })),
  );
  if (error) {
    if (error.code === "P0001") return { error: error.message };
    console.error("customiseEstimateLine failed:", error);
    return { error: "Could not customise this work. Try again." };
  }

  revalidatePath("/estimator", "layout");
  return undefined;
}

export async function addLineComponent(
  lineId: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const choice = text(formData, "component");
  const qty = parseNumber(formData.get("qty_per_unit"));

  const [kind, refId] = choice.split(":");
  if (!refId || (kind !== "material" && kind !== "mix")) {
    return { error: "Pick a material or a mix." };
  }
  if (qty === null || Number.isNaN(qty) || qty <= 0) {
    return { error: "Enter how much of it one unit of the work needs." };
  }

  const supabase = await createClient();
  // "material" means a master ITEM (0086).
  const { error } = await supabase.from("estimator_estimate_line_components").insert({
    line_id: lineId,
    item_id: kind === "material" ? refId : null,
    mix_id: kind === "mix" ? refId : null,
    qty_per_unit: qty,
    created_by: user.id,
    updated_by: user.id,
  });
  if (error) {
    if (error.code === "23505") {
      return { error: "That is already in this villa's version — edit its quantity instead." };
    }
    if (error.code === "P0001") return { error: error.message };
    console.error("addLineComponent failed:", error);
    return { error: "Could not add it. Try again." };
  }

  revalidatePath("/estimator", "layout");
  return undefined;
}

export async function updateLineComponentQty(id: string, qty: number): Promise<ActionState> {
  const user = await requireTool(GRANT);
  if (!Number.isFinite(qty) || qty <= 0) return { error: "The quantity must be more than zero." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("estimator_estimate_line_components")
    .update({ qty_per_unit: qty, updated_by: user.id })
    .eq("id", id);
  if (error) {
    if (error.code === "P0001") return { error: error.message };
    console.error("updateLineComponentQty failed:", error);
    return { error: "Could not save the quantity. Try again." };
  }

  revalidatePath("/estimator", "layout");
  return undefined;
}

export async function removeLineComponent(id: string): Promise<ActionState> {
  await requireTool(GRANT);
  const supabase = await createClient();
  const { error } = await supabase.from("estimator_estimate_line_components").delete().eq("id", id);
  if (error) {
    if (error.code === "P0001") return { error: error.message };
    console.error("removeLineComponent failed:", error);
    return { error: "Could not remove it. Try again." };
  }

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
  source: { itemId: string | null; materialId: string | null },
  rate: number | null,
): Promise<ActionState> {
  const user = await requireTool(GRANT);
  if (!estimateId) return { error: "Which estimate?" };
  if ((source.itemId === null) === (source.materialId === null)) {
    return { error: "Pick one material." };
  }

  const supabase = await createClient();

  // Blank clears the override — back to the price in Masters.
  if (rate === null) {
    let query = supabase
      .from("estimator_estimate_item_rates")
      .delete()
      .eq("estimate_id", estimateId);
    query = source.itemId
      ? query.eq("item_id", source.itemId)
      : query.eq("material_id", source.materialId as string);
    const { error } = await query;
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
  let updateQuery = supabase
    .from("estimator_estimate_item_rates")
    .update({ rate, updated_by: user.id }, { count: "exact" })
    .eq("estimate_id", estimateId);
  updateQuery = source.itemId
    ? updateQuery.eq("item_id", source.itemId)
    : updateQuery.eq("material_id", source.materialId as string);
  const { error: updateError, count } = await updateQuery;
  if (updateError) {
    if (updateError.code === "P0001") return { error: updateError.message };
    console.error("setEstimateItemRate (update) failed:", updateError);
    return { error: "Could not save the price. Try again." };
  }

  if (!count) {
    const { error } = await supabase.from("estimator_estimate_item_rates").insert({
      estimate_id: estimateId,
      item_id: source.itemId,
      material_id: source.materialId,
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
    .select("line_id, item_id, mix_id, material_id, qty_per_unit")
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
    const workItemId = sourceWorkByLine.get(component.line_id);
    const targetLineId = workItemId ? targetLineByWork.get(workItemId) : undefined;
    if (!targetLineId) return [];
    return [
      {
        line_id: targetLineId,
        item_id: component.item_id,
        mix_id: component.mix_id,
        material_id: component.material_id,
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
    await supabase
      .from("estimator_estimate_line_components")
      .delete()
      .in(
        "line_id",
        lines.map((line) => line.id),
      );
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
    .select("item_id, material_id, rate, note")
    .eq("estimate_id", sourceEstimateId);
  if (readError) {
    console.error("copyItemRates (read) failed:", readError);
    return "Could not read this villa's material prices.";
  }
  if (!rates || rates.length === 0) return undefined;

  const { error: insertError } = await supabase.from("estimator_estimate_item_rates").insert(
    rates.map((rate) => ({
      estimate_id: targetEstimateId,
      item_id: rate.item_id,
      material_id: rate.material_id,
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
 * The lines come across — quantities, notes, and any per-villa
 * variations (0087) the template's works carry. Costs are computed
 * live from today's rates, so there is nothing else to copy.
 *
 * Two writes with no transaction between them (PostgREST gives us no
 * way to wrap them), so a failure part-way would leave an empty
 * estimate behind pretending to be a copy. The header is deleted again
 * if the lines don't land — an honest failure beats a half-copy.
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

  const [book, variations, lines] = await Promise.all([
    getRecipeBook(),
    getEstimateVariations(estimateId),
    supabase
      .from("estimator_estimate_lines")
      .select("id, work_item_id, qty")
      .eq("estimate_id", estimateId),
  ]);
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
    // A takeoff id is a master item since 0086, a legacy material
    // before — the snapshot anchors on whichever column it really is.
    const itemIds = new Set([...book.itemIds, ...variations.extraItemIds]);
    const { error: takeoffError } = await supabase.from("estimator_estimate_takeoff").insert(
      takeoff.map((row) => {
        const material = materialsById.get(row.materialId);
        const isItem = itemIds.has(row.materialId);
        return {
          estimate_id: estimateId,
          work_item_id: row.workItemId,
          material_id: isItem ? null : row.materialId,
          item_id: isItem ? row.materialId : null,
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
