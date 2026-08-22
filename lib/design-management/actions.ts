"use server";

// Type-only import, never re-exported from a "use server" file — the
// 2026-08-03 outage rule, enforced by npm run check:actions.
import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

const GRANT = "/design-management";
const NAME_LIMIT = 120;
const CODE_LIMIT = 30;
const DESCRIPTION_LIMIT = 500;

/**
 * Writes for the Design Management app's own masters: drawing sets,
 * their default work links, and design stages. Every action opens with
 * requireTool and ends by revalidating the layout — an exact-path call
 * would leave the welcome counts stale while the moved list refreshes
 * (the exact-path trap in CLAUDE.md). Nothing here writes another
 * tool's table.
 */

function text(formData: FormData, field: string): string {
  return String(formData.get(field) ?? "").trim();
}

// ---------------------------------------------------------------------
// Drawing sets
// ---------------------------------------------------------------------

function readDrawingSetForm(
  formData: FormData,
): { name: string; code: string | null; description: string | null } | { error: string } {
  const name = text(formData, "name");
  const code = text(formData, "code");
  const description = text(formData, "description");

  if (!name) return { error: "Give the drawing set a name." };
  if (name.length > NAME_LIMIT) return { error: `Keep the name under ${NAME_LIMIT} characters.` };
  if (code.length > CODE_LIMIT) return { error: `Keep the code under ${CODE_LIMIT} characters.` };
  if (description.length > DESCRIPTION_LIMIT) {
    return { error: `Keep the description under ${DESCRIPTION_LIMIT} characters.` };
  }

  return { name, code: code || null, description: description || null };
}

export async function createDrawingSet(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const fields = readDrawingSetForm(formData);
  if ("error" in fields) return fields;

  const supabase = await createClient();
  const { data: last } = await supabase
    .from("drawing_sets")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  // New sets land at the end of the sequence; steps of 10 leave room to
  // slot one between two later by editing sort_order in the database.
  const { error } = await supabase.from("drawing_sets").insert({
    ...fields,
    sort_order: (last?.sort_order ?? 0) + 10,
    created_by: user.id,
    updated_by: user.id,
  });
  if (error) {
    if (error.code === "23505") return { error: "That code is already used by another set." };
    console.error("createDrawingSet failed:", error);
    return { error: "Could not add the drawing set. Try again." };
  }

  revalidatePath("/design-management", "layout");
  return undefined;
}

export async function updateDrawingSet(
  id: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const fields = readDrawingSetForm(formData);
  if ("error" in fields) return fields;

  const supabase = await createClient();
  const { error } = await supabase
    .from("drawing_sets")
    .update({ ...fields, updated_by: user.id })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") return { error: "That code is already used by another set." };
    console.error("updateDrawingSet failed:", error);
    return { error: "Could not update the drawing set. Try again." };
  }

  revalidatePath("/design-management", "layout");
  return undefined;
}

export async function setDrawingSetActive(id: string, isActive: boolean): Promise<ActionState> {
  const user = await requireTool(GRANT);

  const supabase = await createClient();
  const { error } = await supabase
    .from("drawing_sets")
    .update({ is_active: isActive, updated_by: user.id })
    .eq("id", id);
  if (error) {
    console.error("setDrawingSetActive failed:", error);
    return { error: "Could not update the drawing set. Try again." };
  }

  revalidatePath("/design-management", "layout");
  return undefined;
}

/**
 * Only succeeds when nothing references the set. A villa's revision
 * history is exactly that kind of reference and is meant to be
 * permanent, so the FK refuses rather than cascades (CLAUDE.md's line
 * chain rule) — surfaced here as a friendly nudge toward deactivating
 * instead, never a thrown error.
 */
export async function deleteDrawingSet(id: string): Promise<ActionState> {
  await requireTool(GRANT);

  const supabase = await createClient();
  const { error } = await supabase.from("drawing_sets").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") {
      return {
        error:
          "This drawing set has revisions against a villa and can't be deleted — deactivate it instead.",
      };
    }
    console.error("deleteDrawingSet failed:", error);
    return { error: "Could not delete the drawing set. Try again." };
  }

  revalidatePath("/design-management", "layout");
  return undefined;
}

/**
 * The set's default work links, written as one whole-list diff — insert
 * what's newly checked, delete what's newly unchecked — so a toggle
 * can't half-save. There is no update; a link either exists or it
 * doesn't (the Relay `setTrailSetActivities` shape).
 */
export async function setDrawingSetWorks(
  setId: string,
  workItemIds: string[],
): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const supabase = await createClient();

  const { data: existingRows, error: readError } = await supabase
    .from("drawing_set_works")
    .select("work_item_id")
    .eq("drawing_set_id", setId);
  if (readError) {
    console.error("setDrawingSetWorks read failed:", readError);
    return { error: "Could not load the current work links. Try again." };
  }

  const existing = new Set((existingRows ?? []).map((row) => row.work_item_id));
  const next = new Set(workItemIds);
  const toAdd = [...next].filter((workItemId) => !existing.has(workItemId));
  const toRemove = [...existing].filter((workItemId) => !next.has(workItemId));

  if (toAdd.length > 0) {
    const { error } = await supabase.from("drawing_set_works").insert(
      toAdd.map((workItemId) => ({
        drawing_set_id: setId,
        work_item_id: workItemId,
        created_by: user.id,
      })),
    );
    if (error) {
      console.error("setDrawingSetWorks insert failed:", error);
      return { error: "Could not save the work links. Try again." };
    }
  }

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("drawing_set_works")
      .delete()
      .eq("drawing_set_id", setId)
      .in("work_item_id", toRemove);
    if (error) {
      console.error("setDrawingSetWorks delete failed:", error);
      return { error: "Could not save the work links. Try again." };
    }
  }

  revalidatePath("/design-management", "layout");
  return undefined;
}

// ---------------------------------------------------------------------
// Design stages
// ---------------------------------------------------------------------

export async function addDesignStage(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const name = text(formData, "name");
  if (!name) return { error: "Give the stage a name." };
  if (name.length > NAME_LIMIT) return { error: `Keep the name under ${NAME_LIMIT} characters.` };

  const supabase = await createClient();
  const { data: last } = await supabase
    .from("design_stages")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Steps of 10, the construction_stages/work_items convention — room
  // to slot one between two later without renumbering everything.
  const { error } = await supabase.from("design_stages").insert({
    name,
    sort_order: (last?.sort_order ?? 0) + 10,
    created_by: user.id,
    updated_by: user.id,
  });
  if (error) {
    if (error.code === "23505") return { error: "That stage is already on the list." };
    console.error("addDesignStage failed:", error);
    return { error: "Could not add the stage. Try again." };
  }

  revalidatePath("/design-management", "layout");
  return undefined;
}

/** A rename follows through to every transmittal carrying the stage. */
export async function renameDesignStage(id: string, name: string): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const trimmed = name.trim();
  if (!trimmed) return { error: "Give the stage a name." };
  if (trimmed.length > NAME_LIMIT) {
    return { error: `Keep the name under ${NAME_LIMIT} characters.` };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("design_stages")
    .update({ name: trimmed, updated_by: user.id })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") return { error: "Another stage already has that name." };
    console.error("renameDesignStage failed:", error);
    return { error: "Could not rename the stage. Try again." };
  }

  revalidatePath("/design-management", "layout");
  return undefined;
}

export async function setDesignStageActive(id: string, isActive: boolean): Promise<ActionState> {
  const user = await requireTool(GRANT);

  const supabase = await createClient();
  const { error } = await supabase
    .from("design_stages")
    .update({ is_active: isActive, updated_by: user.id })
    .eq("id", id);
  if (error) {
    console.error("setDesignStageActive failed:", error);
    return { error: "Could not update the stage. Try again." };
  }

  revalidatePath("/design-management", "layout");
  return undefined;
}

/**
 * Swaps sort_order with the neighbour in the given direction — two
 * updates, not a rewrite of the whole ordered list, so a reorder costs
 * the same regardless of how many stages exist.
 */
export async function moveDesignStage(id: string, direction: "up" | "down"): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const supabase = await createClient();

  const { data: stages, error: readError } = await supabase
    .from("design_stages")
    .select("id, sort_order")
    .order("sort_order")
    .order("id");
  if (readError) {
    console.error("moveDesignStage read failed:", readError);
    return { error: "Could not reorder the stages. Try again." };
  }

  const list = stages ?? [];
  const index = list.findIndex((stage) => stage.id === id);
  if (index === -1) return { error: "That stage no longer exists." };
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= list.length) return undefined;

  const current = list[index];
  const neighbour = list[swapIndex];

  const [firstUpdate, secondUpdate] = await Promise.all([
    supabase
      .from("design_stages")
      .update({ sort_order: neighbour.sort_order, updated_by: user.id })
      .eq("id", current.id),
    supabase
      .from("design_stages")
      .update({ sort_order: current.sort_order, updated_by: user.id })
      .eq("id", neighbour.id),
  ]);
  if (firstUpdate.error || secondUpdate.error) {
    console.error("moveDesignStage write failed:", firstUpdate.error ?? secondUpdate.error);
    return { error: "Could not reorder the stages. Try again." };
  }

  revalidatePath("/design-management", "layout");
  return undefined;
}
