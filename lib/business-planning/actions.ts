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
  SCENARIOS,
  type PlanInputs,
} from "./inputs";
import { runScenario } from "./model";

const NAME_LIMIT = 120;

/**
 * Publish (or withdraw) a plan's headline numbers as targets (0057).
 *
 * Called after every write that could change them — save, rename, a
 * project link set or cleared. The engine runs HERE, in Business
 * Planning's own action: Reporter reads the resulting plain numbers
 * from business_plan_target_facts and never imports the model. A plan
 * without a project has no targets row; clearing the link withdraws.
 *
 * Failures are logged, not surfaced: the plan itself saved fine, and
 * "your plan is saved but the reporting copy lagged" is not worth
 * blocking the editor over — the next save republishes.
 */
async function syncPlanTargets(planId: string, userId: string): Promise<void> {
  const supabase = await createClient();
  const { data: plan, error } = await supabase
    .from("business_plans")
    .select("id, name, project_id, inputs")
    .eq("id", planId)
    .maybeSingle();
  if (error || !plan) {
    console.error("syncPlanTargets read failed:", error);
    return;
  }

  if (!plan.project_id) {
    const { error: deleteError } = await supabase
      .from("business_plan_targets")
      .delete()
      .eq("plan_id", planId);
    if (deleteError) console.error("syncPlanTargets withdraw failed:", deleteError);
    return;
  }

  const inputs = parsePlanInputs(plan.inputs);
  const active = runScenario(inputs, inputs.activeScenario);

  const { error: upsertError } = await supabase.from("business_plan_targets").upsert(
    {
      plan_id: planId,
      project_id: plan.project_id,
      plan_name: plan.name,
      scenario_name: SCENARIOS[inputs.activeScenario],
      revenue: active.revenue,
      total_cost: active.totalCost,
      pbt: active.pbt,
      margin_pct: active.marginPct,
      peak_funding: active.peakFunding,
      updated_by: userId,
    },
    { onConflict: "plan_id" },
  );
  if (upsertError) console.error("syncPlanTargets publish failed:", upsertError);
}

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

  revalidatePath("/business-planning", "layout");
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
  // "" = no project = targets withdrawn. The value is a projects.id from
  // a bounded picker; the FK refuses anything else.
  const projectId = String(formData.get("project_id") ?? "").trim();
  if (!name) return { error: "Give the plan a name." };
  if (name.length > NAME_LIMIT) return { error: `Keep the name under ${NAME_LIMIT} characters.` };

  const supabase = await createClient();
  const { error } = await supabase
    .from("business_plans")
    .update({
      name,
      location: location || null,
      project_id: projectId || null,
      updated_by: user.id,
    })
    .eq("id", planId);

  if (error) {
    console.error("renamePlan failed:", error);
    return { error: "Could not rename the plan. Try again." };
  }

  // The name and the link both live on the published targets row.
  await syncPlanTargets(planId, user.id);

  revalidatePath("/business-planning", "layout");
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

  // A linked plan's save republishes its targets, so Reporter's
  // plan-vs-actual is never staler than the plan's last save.
  await syncPlanTargets(planId, user.id);

  // Only the list page: revalidating this plan's own route mid-edit
  // would re-render the editor underneath the person typing into it.
  revalidatePath("/business-planning", "layout");
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

  revalidatePath("/business-planning", "layout");
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

  revalidatePath("/business-planning", "layout");
  return undefined;
}
