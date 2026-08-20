"use server";

// Type-only import, and deliberately NOT re-exported: a bare
// `export type { ActionState }` in a "use server" file survives into the
// compiled module's runtime export list, where the type doesn't exist —
// every action in the chunk then dies at module load (the 2026-08-03
// production outage). Import it from "@/lib/action-state" instead.
import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { computeLine, computeWorkTakeoff } from "./calc";
import { getRecipeBook } from "./queries";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const GRANT = "/estimator";
const NAME_LIMIT = 120;
const UOM_LIMIT = 20;
const TEXT_LIMIT = 2000;

/**
 * "1,200.50" → 1200.5. Null for blank — which for a rate means "not
 * priced yet" and is a legitimate saved value, not an error. NaN for
 * nonsense; the caller decides.
 */
function parseNumber(raw: FormDataEntryValue | null): number | null {
  const cleaned = String(raw ?? "").replace(/[,\s₹]/g, "");
  if (!cleaned) return null;
  return Number(cleaned);
}

function text(formData: FormData, field: string): string {
  return String(formData.get(field) ?? "").trim();
}

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
// Materials
// ---------------------------------------------------------------------

type MaterialFields = {
  name: string;
  uom: string;
  rate: number | null;
  is_active: boolean;
  item_id: string | null;
  item_uom_factor: number | null;
};

function readMaterialFields(formData: FormData): MaterialFields | { error: string } {
  const name = text(formData, "name");
  const uom = text(formData, "uom");
  const rate = parseNumber(formData.get("rate"));
  const itemId = text(formData, "item_id") || null;
  const factor = parseNumber(formData.get("item_uom_factor"));

  if (!name) return { error: "Give the material a name." };
  if (name.length > NAME_LIMIT) return { error: `Keep the name under ${NAME_LIMIT} characters.` };
  if (!uom) return { error: "Say what it is measured in, like bag, cum or kg." };
  if (uom.length > UOM_LIMIT) return { error: `Keep the unit under ${UOM_LIMIT} characters.` };
  if (rate !== null && (Number.isNaN(rate) || rate < 0)) {
    return { error: "The rate must be a number, or left blank if it isn't priced yet." };
  }
  if (factor !== null && (Number.isNaN(factor) || factor <= 0)) {
    return { error: "The conversion must be a number above zero, or left blank." };
  }
  if (factor !== null && !itemId) {
    return { error: "A conversion only means something with a catalogue item picked." };
  }

  return {
    name,
    uom,
    rate,
    is_active: formData.get("is_active") === "1",
    item_id: itemId,
    item_uom_factor: factor,
  };
}

/** Two unique rules can answer 23505 here: one name per material, and
 * one material per catalogue item (0076 — a shared item would
 * double-count every issued-vs-estimated comparison). */
function duplicateMaterialMessage(message: string): string {
  return message.includes("estimator_materials_item_key")
    ? "That catalogue item is already linked to another material."
    : "A material with that name already exists.";
}

export async function createMaterial(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const fields = readMaterialFields(formData);
  if ("error" in fields) return fields;

  const supabase = await createClient();
  const { error } = await supabase
    .from("estimator_materials")
    .insert({ ...fields, created_by: user.id, updated_by: user.id });
  if (error) {
    if (error.code === "23505") return { error: duplicateMaterialMessage(error.message) };
    console.error("createMaterial failed:", error);
    return { error: "Could not add the material. Try again." };
  }

  revalidatePath("/estimator", "layout");
  return undefined;
}

export async function updateMaterial(
  id: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const fields = readMaterialFields(formData);
  if ("error" in fields) return fields;

  const supabase = await createClient();
  const { error } = await supabase
    .from("estimator_materials")
    .update({ ...fields, updated_by: user.id })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") return { error: duplicateMaterialMessage(error.message) };
    console.error("updateMaterial failed:", error);
    return { error: "Could not update the material. Try again." };
  }

  revalidatePath("/estimator", "layout");
  return undefined;
}

export async function deleteMaterial(id: string): Promise<ActionState> {
  await requireTool(GRANT);
  const supabase = await createClient();
  const { error } = await supabase.from("estimator_materials").delete().eq("id", id);
  if (error) {
    console.error("deleteMaterial failed:", error);
    return { error: deleteError(error, "material", "Switch it off instead.") };
  }

  revalidatePath("/estimator", "layout");
  return undefined;
}

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
  const materialId = text(formData, "material_id");
  const qty = parseNumber(formData.get("qty_per_unit"));

  if (!materialId) return { error: "Pick a material." };
  if (qty === null || Number.isNaN(qty) || qty <= 0) {
    return { error: "Enter how much of it one unit of the mix needs." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("estimator_mix_components").insert({
    mix_id: mixId,
    material_id: materialId,
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
  const { error } = await supabase.from("estimator_work_components").insert({
    work_item_id: workItemId,
    material_id: kind === "material" ? refId : null,
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
  const { error } = await supabase.from("estimator_estimate_lines").delete().eq("id", id);
  if (error) {
    console.error("removeEstimateLine failed:", error);
    return { error: "Could not remove the work. Try again." };
  }

  revalidatePath("/estimator", "layout");
  return undefined;
}

/**
 * Copy a template onto a villa — the way every villa estimate starts.
 *
 * Only the lines come across: quantities and their notes. Costs are
 * computed live from today's rates, so there is nothing else to copy.
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
    .select("work_item_id, qty, note")
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
        created_by: user.id,
        updated_by: user.id,
      })),
    );
    if (insertError) {
      console.error("copyTemplateToUnit (copy lines) failed:", insertError);
      await supabase.from("estimator_estimates").delete().eq("id", created.id);
      return { error: "Could not copy the template's works, so nothing was created. Try again." };
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

  const [book, lines] = await Promise.all([
    getRecipeBook(),
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

  const materialsById = new Map(book.materials.map((m) => [m.id, m]));
  const mixesById = new Map(book.mixes.map((m) => [m.id, m]));
  const recipesByWork = new Map(book.recipes.map((r) => [r.workItemId, r]));

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
    const { error: takeoffError } = await supabase.from("estimator_estimate_takeoff").insert(
      takeoff.map((row) => {
        const material = materialsById.get(row.materialId);
        return {
          estimate_id: estimateId,
          work_item_id: row.workItemId,
          material_id: row.materialId,
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
    .select("work_item_id, qty, note")
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
        created_by: user.id,
        updated_by: user.id,
      })),
    );
    if (insertError) {
      console.error("reviseEstimate (copy lines) failed:", insertError);
      await supabase.from("estimator_estimates").delete().eq("id", created.id);
      return { error: "Could not copy the works, so nothing was created. Try again." };
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
