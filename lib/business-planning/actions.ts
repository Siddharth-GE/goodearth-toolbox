"use server";

// Not re-exported: `export type { ActionState }` in a "use server" file survives into the runtime
// exports and every action dies at load (BUGCATCHER). Import it from "@/lib/action-state".
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
 * Publish (or withdraw) a plan's headline numbers as targets (0057). The engine runs here so
 * Reporter reads plain numbers from business_plan_target_facts and never imports the model.
 * No project link means no targets row. Failures are logged, not surfaced: the plan saved fine
 * and the next save republishes.
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

/** Create a plan from `defaultPlanInputs()`, then open it. */
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
  // redirect() throws, so it sits outside any try/catch, after every write is checked.
  redirect(`/business-planning/${data.id}`);
}

/** Rename a plan or move it to a project. The name lives in its own column, not the document. */
export async function renamePlan(
  planId: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireTool("/business-planning");

  const name = String(formData.get("name") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  // "" = no project = targets withdrawn; the FK refuses anything but a projects.id.
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

  await syncPlanTargets(planId, user.id);

  revalidatePath("/business-planning", "layout");
  revalidatePath(`/business-planning/${planId}`);
  return undefined;
}

/**
 * Write the whole document every time: a partial write could leave the saved plan and the one
 * on screen disagreeing. `parsePlanInputs` runs on the way in too; it is the only place a
 * malformed jsonb document can be stopped.
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

  // A linked plan's save republishes its targets.
  await syncPlanTargets(planId, user.id);

  // Only the list page: revalidating this plan's route mid-edit would re-render the editor under the typist.
  revalidatePath("/business-planning", "layout");
  return undefined;
}

/** Copy a plan: the quick-plan path. */
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
      // Fresh ids on every line and cost row so the two copies never share keys.
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

/** Throw a plan away. Deletable, unlike a budget; the audit trigger keeps the before-image. */
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
