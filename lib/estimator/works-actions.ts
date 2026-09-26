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
 * Changing the unit after estimate lines exist would silently change
 * what every one of those quantities MEANS, so it is refused while any
 * line uses the work (2026-09-26 — it used to be a warning).
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

  // A work's unit is what every quantity on it means: 40 cum becoming
  // 40 sqm is the same number describing a different building. While any
  // estimate line uses the work, the unit stays as it is.
  const [current, used] = await Promise.all([
    supabase.from("estimator_work_info").select("uom").eq("work_item_id", workItemId).maybeSingle(),
    supabase
      .from("estimator_estimate_lines")
      .select("id", { count: "exact", head: true })
      .eq("work_item_id", workItemId),
  ]);
  if (current.error || used.error) {
    console.error("saveWorkInfo (read) failed:", current.error ?? used.error);
    return { error: "Could not save the work setup. Try again." };
  }
  if (current.data && current.data.uom !== uom && (used.count ?? 0) > 0) {
    return {
      error: `This work is on ${used.count} estimate ${used.count === 1 ? "line" : "lines"} measured in ${current.data.uom}, so its unit can't change — that would change what those quantities mean.`,
    };
  }

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

/**
 * Copy one work's rate — its unit, labour rate and materials — onto
 * other works: the same plastering priced for the ground floor is priced
 * the same way on the first and the attic. Each target's own materials
 * are REPLACED by the source's (a copy, not a merge), and its unit set to
 * the source's.
 *
 * A target already on an estimate in a DIFFERENT unit is refused by name:
 * changing its unit would silently change what those quantities mean.
 * Several writes per target and no transaction — a failure part-way says
 * which works were done, and running it again finishes the rest.
 */
export async function copyWorkSetup(
  fromWorkItemId: string,
  toWorkItemIds: string[],
): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const targets = [...new Set(Array.isArray(toWorkItemIds) ? toWorkItemIds : [])].filter(
    (id) => typeof id === "string" && id && id !== fromWorkItemId,
  );
  if (!fromWorkItemId || targets.length === 0) return { error: "Tick the works to copy it to." };

  const supabase = await createClient();
  const [info, components, targetInfo, targetLines] = await Promise.all([
    supabase
      .from("estimator_work_info")
      .select("uom, labour_rate")
      .eq("work_item_id", fromWorkItemId)
      .maybeSingle(),
    supabase
      .from("estimator_work_components")
      .select("item_id, mix_id, qty_per_unit")
      .eq("work_item_id", fromWorkItemId),
    supabase.from("estimator_work_info").select("work_item_id, uom").in("work_item_id", targets),
    supabase.from("estimator_estimate_lines").select("work_item_id").in("work_item_id", targets),
  ]);
  const readError = info.error ?? components.error ?? targetInfo.error ?? targetLines.error;
  if (readError) {
    console.error("copyWorkSetup (read) failed:", readError);
    return { error: "Could not read the rate book. Try again." };
  }
  if (!info.data) return { error: "Set this work up first — there is nothing to copy yet." };
  const source = info.data;

  const used = new Set((targetLines.data ?? []).map((line) => line.work_item_id));
  const unitClash = (targetInfo.data ?? []).filter(
    (row) => row.uom !== source.uom && used.has(row.work_item_id),
  );
  if (unitClash.length > 0) {
    return {
      error: `${unitClash.length === 1 ? "One of those works is" : `${unitClash.length} of those works are`} already on an estimate measured in a different unit — changing it would change what those quantities mean. Untick it, or change it on its own page.`,
    };
  }

  // Rows from before 0086 name neither an item nor a mix; not copied.
  const recipe = (components.data ?? []).filter((row) => row.item_id || row.mix_id);
  let done = 0;
  for (const target of targets) {
    const { error: infoError } = await supabase.from("estimator_work_info").upsert(
      {
        work_item_id: target,
        uom: source.uom,
        labour_rate: source.labour_rate,
        created_by: user.id,
        updated_by: user.id,
      },
      { onConflict: "work_item_id" },
    );
    const { error: clearError } = infoError
      ? { error: infoError }
      : await supabase.from("estimator_work_components").delete().eq("work_item_id", target);
    const { error: insertError } =
      clearError || recipe.length === 0
        ? { error: clearError }
        : await supabase.from("estimator_work_components").insert(
            recipe.map((row) => ({
              work_item_id: target,
              item_id: row.item_id,
              mix_id: row.mix_id,
              qty_per_unit: row.qty_per_unit,
              created_by: user.id,
              updated_by: user.id,
            })),
          );
    if (insertError) {
      console.error("copyWorkSetup (write) failed:", insertError);
      revalidatePath("/estimator", "layout");
      return {
        error: `Copied to ${done} of ${targets.length} works, then something failed. Try again to finish the rest.`,
      };
    }
    done++;
  }

  revalidatePath("/estimator", "layout");
  return undefined;
}
