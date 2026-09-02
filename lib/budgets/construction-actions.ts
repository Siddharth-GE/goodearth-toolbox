"use server";

import { requireTool } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// Type-only import, and deliberately NOT re-exported — see the note in
// lib/budgets/actions.ts: a bare `export type { X };` in a "use server"
// file crashes every action in its compiled chunk at load time.
import type { ActionState } from "@/lib/action-state";

/**
 * Writes for the Construction tree. No status machine here — a plan is
 * QS-owned and editable any time (the deliberate opposite of interiors
 * budgets), so these are plain gated writes with friendly validation.
 */

/**
 * Opens a plan for a unit, or lands on the existing one — a unit has at
 * most one living plan (unique unit_id), and the loser of a race should
 * arrive at it rather than see an error (the startPricing pattern).
 */
export async function startConstructionPlan(unitId: string): Promise<ActionState> {
  const user = await requireTool("/budgets");
  const supabase = await createClient();

  const { data: unit, error: unitError } = await supabase
    .from("units")
    .select("id, project_id")
    .eq("id", unitId)
    .maybeSingle();
  if (unitError || !unit) {
    console.error("startConstructionPlan lookup failed:", unitError);
    return { error: "Could not find that unit." };
  }

  const { data, error } = await supabase
    .from("construction_budgets")
    .insert({ unit_id: unitId, project_id: unit.project_id, created_by: user.id })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      const { data: existing } = await supabase
        .from("construction_budgets")
        .select("id")
        .eq("unit_id", unitId)
        .single();
      if (existing) redirect(`/budgets/construction/${existing.id}`);
    }
    console.error("startConstructionPlan failed:", error);
    return { error: "Could not start this plan. Try again." };
  }

  revalidatePath("/budgets", "layout");
  redirect(`/budgets/construction/${data.id}`);
}

export type ConstructionLineInput = {
  itemId: string;
  quantity: number;
};

/**
 * Commits a picker basket into one stage. An item already in that stage
 * has its quantity raised rather than gaining a second row — the same
 * behaviour the interiors picker promises.
 *
 * uom comes from the item master server-side, never from the client.
 */
export async function addConstructionLines(
  planId: string,
  stage: string,
  lines: ConstructionLineInput[],
): Promise<ActionState> {
  const user = await requireTool("/budgets");

  const stageName = stage.trim();
  if (!stageName) return { error: "Name the stage first." };
  if (lines.length === 0) return { error: "Pick at least one item." };
  if (lines.some((line) => !Number.isFinite(line.quantity) || line.quantity <= 0)) {
    return { error: "Quantities must be more than 0." };
  }

  const supabase = await createClient();
  const itemIds = lines.map((line) => line.itemId);

  const [{ data: items, error: itemsError }, { data: existing, error: existingError }] =
    await Promise.all([
      supabase.from("items").select("id, default_uom").in("id", itemIds),
      supabase
        .from("construction_budget_lines")
        .select("id, item_id, quantity")
        .eq("budget_id", planId)
        .eq("stage", stageName)
        .in("item_id", itemIds),
    ]);
  if (itemsError || existingError) {
    console.error("addConstructionLines lookup failed:", itemsError ?? existingError);
    return { error: "Could not add those items. Try again." };
  }

  const uoms = new Map((items ?? []).map((item) => [item.id, item.default_uom]));
  const already = new Map((existing ?? []).map((line) => [line.item_id, line]));

  const inserts = [];
  for (const line of lines) {
    const current = already.get(line.itemId);
    if (current) {
      const { error } = await supabase
        .from("construction_budget_lines")
        .update({ quantity: current.quantity + line.quantity })
        .eq("id", current.id);
      if (error) {
        console.error("addConstructionLines merge failed:", error);
        return { error: "Could not add those items. Try again." };
      }
    } else {
      inserts.push({
        budget_id: planId,
        stage: stageName,
        item_id: line.itemId,
        quantity: line.quantity,
        uom: uoms.get(line.itemId) ?? "each",
        created_by: user.id,
      });
    }
  }

  if (inserts.length > 0) {
    const { error } = await supabase.from("construction_budget_lines").insert(inserts);
    if (error) {
      console.error("addConstructionLines insert failed:", error);
      return { error: "Could not add those items. Try again." };
    }
  }

  revalidatePath("/budgets", "layout");
  return undefined;
}

/** Save-on-blur target for a row's quantity and note. No revalidate —
 * the values are already on screen (the saveLine pattern). */
export async function updateConstructionLine(
  lineId: string,
  input: { quantity: number; note: string | null },
): Promise<ActionState> {
  await requireTool("/budgets");

  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    return { error: "Quantity must be more than 0" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("construction_budget_lines")
    .update({ quantity: input.quantity, note: input.note?.trim() || null })
    .eq("id", lineId);
  if (error) {
    console.error("updateConstructionLine failed:", error);
    return { error: "Could not save. Try again." };
  }
  return undefined;
}

/**
 * Removes a line from the plan — unless the site team has already
 * requested it.
 *
 * indent_lines.construction_line_id is ON DELETE SET NULL, so deleting a
 * plan line makes Postgres UPDATE every indent line pulled from it, which
 * fires indent_lines_draft_only and raises once any of those indents has
 * left draft. The delete then comes back as an opaque 400 and the screen
 * said "Try again" — advice that could never work, which is exactly what
 * the founder hit (twice, seconds apart) on 16 Aug 2026.
 *
 * So the refusal is looked up and stated properly. Note the check names
 * the indent: "already requested on IND/SAA/016" is actionable, "could
 * not remove that line" is not.
 */
export async function removeConstructionLine(planId: string, lineId: string): Promise<ActionState> {
  await requireTool("/budgets");

  const supabase = await createClient();

  const { data: raised, error: raisedError } = await supabase
    .from("indent_lines")
    .select("id, indents(reference, status)")
    .eq("construction_line_id", lineId);
  if (raisedError) {
    console.error("removeConstructionLine indent check failed:", raisedError);
    return { error: "Could not check whether this item has been requested. Try again." };
  }

  const blocking = (raised ?? [])
    .map((row) => row.indents as { reference: string; status: string } | null)
    .filter((indent): indent is { reference: string; status: string } => {
      return indent != null && indent.status !== "draft";
    });
  if (blocking.length > 0) {
    const names = [...new Set(blocking.map((indent) => indent.reference))];
    const list =
      names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
    return {
      error: `This item has already been requested on ${list}, so it can't be removed from the plan. It stays here as the record of what was planned.`,
    };
  }

  const { error } = await supabase.from("construction_budget_lines").delete().eq("id", lineId);
  if (error) {
    console.error("removeConstructionLine failed:", error);
    // The check above races with an indent being submitted; the database
    // is the backstop, and its refusal is worth repeating plainly.
    if (error.message.includes("lines can only be changed while it is a draft")) {
      return {
        error:
          "This item has just been requested on an indent, so it can't be removed from the plan any more.",
      };
    }
    return { error: "Could not remove that line. Try again." };
  }

  revalidatePath("/budgets", "layout");
  return undefined;
}

/**
 * Renames a stage — one UPDATE across its lines, which is all a
 * free-form stage is. Renaming onto an existing stage's name merges the
 * two, which is exactly what fixing a typo ("Silll" → "Sill") wants.
 */
export async function renameStage(planId: string, from: string, to: string): Promise<ActionState> {
  await requireTool("/budgets");

  const next = to.trim();
  if (!next) return { error: "A stage needs a name." };
  if (next === from) return undefined;

  const supabase = await createClient();
  const { error } = await supabase
    .from("construction_budget_lines")
    .update({ stage: next })
    .eq("budget_id", planId)
    .eq("stage", from);
  if (error) {
    console.error("renameStage failed:", error);
    return { error: "Could not rename the stage. Try again." };
  }

  revalidatePath("/budgets", "layout");
  return undefined;
}
