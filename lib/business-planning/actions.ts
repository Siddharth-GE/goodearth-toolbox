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
import {
  cloneInputs,
  defaultPlanInputs,
  parsePlanInputs,
  PLAN_SCHEMA_VERSION,
  type PlanInputs,
} from "./inputs";

const NAME_LIMIT = 120;

/**
 * Create a plan, then open it. A new plan starts from
 * `defaultPlanInputs()` — assumptions only, no lines and no invented
 * figures; the fast path to a populated plan is Duplicate.
 */
export async function createPlan(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireTool("/business-planning");

  const name = String(formData.get("name") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  if (!name) return { error: "Give the plan a name." };
  if (name.length > NAME_LIMIT) return { error: `Keep the name under ${NAME_LIMIT} characters.` };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("business_plans")
    .insert({
      name,
      location: location || null,
      schema_version: PLAN_SCHEMA_VERSION,
      inputs: defaultPlanInputs(),
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("createPlan failed:", error);
    return { error: "Could not create the plan. Try again." };
  }

  revalidatePath("/business-planning");
  // redirect() throws its own control-flow signal, so it must be outside
  // any try/catch and after every write has been checked.
  redirect(`/business-planning/${data.id}`);
}

/**
 * Rename a plan, or move it. Separate from `savePlan` because the name
 * lives in its own column, not in the document, and because renaming is
 * a deliberate act rather than something a debounce should fire.
 */
export async function renamePlan(
  planId: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireTool("/business-planning");

  const name = String(formData.get("name") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  if (!name) return { error: "Give the plan a name." };
  if (name.length > NAME_LIMIT) return { error: `Keep the name under ${NAME_LIMIT} characters.` };

  const supabase = await createClient();
  const { error } = await supabase
    .from("business_plans")
    .update({ name, location: location || null, updated_by: user.id })
    .eq("id", planId);

  if (error) {
    console.error("renamePlan failed:", error);
    return { error: "Could not rename the plan. Try again." };
  }

  revalidatePath("/business-planning");
  revalidatePath(`/business-planning/${planId}`);
  return undefined;
}

/**
 * Write the whole document.
 *
 * The whole document, every time, because that is what the editor holds
 * and what the engine reads — a partial write would let the saved plan
 * and the plan on screen disagree, which for a model is the one failure
 * that matters. It is a few kilobytes.
 *
 * `parsePlanInputs` runs on the way in as well as on the way out. The
 * client is the one sending this object and the database cannot check a
 * jsonb column, so this is the only place a malformed document can be
 * stopped.
 */
export async function savePlan(planId: string, inputs: PlanInputs): Promise<ActionState> {
  const user = await requireTool("/business-planning");

  const supabase = await createClient();
  const { error } = await supabase
    .from("business_plans")
    .update({
      inputs: parsePlanInputs(inputs),
      schema_version: PLAN_SCHEMA_VERSION,
      updated_by: user.id,
    })
    .eq("id", planId);

  if (error) {
    console.error("savePlan failed:", error);
    return { error: "Could not save. Your changes are still on screen — try again." };
  }

  // Only the list page: revalidating this plan's own route mid-edit
  // would re-render the editor underneath the person typing into it.
  revalidatePath("/business-planning");
  return undefined;
}

/**
 * Copy a plan. This is the real "quick plan" path — the founder's
 * workbook was reused by cloning the file, and this is that, without
 * the drift.
 */
export async function duplicatePlan(planId: string): Promise<ActionState> {
  const user = await requireTool("/business-planning");
  const supabase = await createClient();

  const { data: source, error: readError } = await supabase
    .from("business_plans")
    .select("name, location, inputs")
    .eq("id", planId)
    .maybeSingle();

  if (readError || !source) {
    console.error("duplicatePlan read failed:", readError);
    return { error: "Could not find that plan." };
  }

  const copyName = `${source.name} (copy)`.slice(0, NAME_LIMIT);
  const { data, error } = await supabase
    .from("business_plans")
    .insert({
      name: copyName,
      location: source.location,
      schema_version: PLAN_SCHEMA_VERSION,
      // Fresh ids on every line and cost row — two plans sharing a line
      // id only misbehaves once both are open, which is exactly when
      // someone is comparing them.
      inputs: cloneInputs(parsePlanInputs(source.inputs)),
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("duplicatePlan failed:", error);
    return { error: "Could not duplicate the plan. Try again." };
  }

  revalidatePath("/business-planning");
  redirect(`/business-planning/${data.id}`);
}

/**
 * Throw a plan away. Deletable, unlike a budget: a plan is a sketch, and
 * a sketch you cannot throw away stops being a sketch. The audit trigger
 * keeps the before-image if anyone ever needs it back.
 */
export async function deletePlan(planId: string): Promise<ActionState> {
  await requireTool("/business-planning");
  const supabase = await createClient();

  const { error } = await supabase.from("business_plans").delete().eq("id", planId);
  if (error) {
    console.error("deletePlan failed:", error);
    return { error: "Could not delete the plan. Try again." };
  }

  revalidatePath("/business-planning");
  return undefined;
}
