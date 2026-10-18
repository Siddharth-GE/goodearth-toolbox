"use server";

// Type-only import, deliberately not re-exported: a re-exported type in a "use server" file kills every action
// in the chunk at module load. Import it from "@/lib/action-state".
import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { checked, parseNumber, text } from "@/lib/form-data";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { GRANT, NAME_LIMIT, TEXT_LIMIT, UOM_LIMIT } from "./shared";

/** A foreign key refusing a delete is the house rule: reference data in use is deactivated, never removed. */
function deleteError(error: { code?: string }, what: string, instead: string): string {
  if (error.code === "23503") return `This ${what} is in use, so it can't be deleted. ${instead}`;
  return `Could not delete the ${what}. Try again.`;
}

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
    is_active: checked(formData, "is_active", "1"),
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

  // Its composition goes with it; a mix used by a work recipe is refused by the FK, which is wanted.
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
  // A mix is a combination of master ITEMS (0086); material_id is legacy.
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
