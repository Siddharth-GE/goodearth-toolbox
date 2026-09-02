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
import { revalidatePath } from "next/cache";
import { GRANT, UOM_LIMIT } from "./shared";

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
