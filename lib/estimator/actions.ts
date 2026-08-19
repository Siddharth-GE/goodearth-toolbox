"use server";

// Type-only import, and deliberately NOT re-exported: a bare
// `export type { ActionState }` in a "use server" file survives into the
// compiled module's runtime export list, where the type doesn't exist —
// every action in the chunk then dies at module load (the 2026-08-03
// production outage). Import it from "@/lib/action-state" instead.
import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
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

// ---------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------

type MaterialFields = { name: string; uom: string; rate: number | null; is_active: boolean };

function readMaterialFields(formData: FormData): MaterialFields | { error: string } {
  const name = text(formData, "name");
  const uom = text(formData, "uom");
  const rate = parseNumber(formData.get("rate"));

  if (!name) return { error: "Give the material a name." };
  if (name.length > NAME_LIMIT) return { error: `Keep the name under ${NAME_LIMIT} characters.` };
  if (!uom) return { error: "Say what it is measured in, like bag, cum or kg." };
  if (uom.length > UOM_LIMIT) return { error: `Keep the unit under ${UOM_LIMIT} characters.` };
  if (rate !== null && (Number.isNaN(rate) || rate < 0)) {
    return { error: "The rate must be a number, or left blank if it isn't priced yet." };
  }

  return { name, uom, rate, is_active: formData.get("is_active") === "1" };
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
    if (error.code === "23505") return { error: "A material with that name already exists." };
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
    if (error.code === "23505") return { error: "Another material already has that name." };
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
