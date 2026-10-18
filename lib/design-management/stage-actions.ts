"use server";

// Type-only and never re-exported from a "use server" file (check:actions).
import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { NAME_LIMIT } from "@/lib/design-management/action-helpers";
import { GRANT } from "@/lib/design-management/shared";
import { normaliseStageCode } from "@/lib/drawings/sheet-name";
import { text } from "@/lib/form-data";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

/** Every action opens with requireTool and ends by revalidating the layout: an exact path would leave the welcome counts stale. Nothing here writes another tool's table. */

export async function addDesignStage(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const name = text(formData, "name");
  if (!name) return { error: "Give the stage a name." };
  if (name.length > NAME_LIMIT) return { error: `Keep the name under ${NAME_LIMIT} characters.` };

  const supabase = await createClient();
  const { data: last, error: lastError } = await supabase
    .from("design_stages")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastError) {
    console.error("design_stages next sort_order read failed:", lastError);
    return { error: "Could not work out where to add it. Try again." };
  }

  // Steps of 10, so one can slot between two without renumbering.
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

/** The short code in every sheet's file name (WD, STR). Names are built at download, never stored, so changing it renames them (lib/drawings/sheet-name.ts). */
export async function setDesignStageCode(id: string, input: string): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const code = normaliseStageCode(input);
  if (!code) return { error: "Give the stage a short code — letters or digits, up to six." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("design_stages")
    .update({ code, updated_by: user.id })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") return { error: `Another stage already uses ${code}.` };
    console.error("setDesignStageCode failed:", error);
    return { error: "Could not save the code. Try again." };
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

/** Whether a stage is a board column (0126). Off hides the column but leaves every step and its history. */
export async function setDesignStageOnBoard(id: string, onBoard: boolean): Promise<ActionState> {
  const user = await requireTool(GRANT);

  const supabase = await createClient();
  const { error } = await supabase
    .from("design_stages")
    .update({ on_board: onBoard, updated_by: user.id })
    .eq("id", id);
  if (error) {
    console.error("setDesignStageOnBoard failed:", error);
    return { error: "Could not update the stage. Try again." };
  }

  revalidatePath("/design-management", "layout");
  return undefined;
}

/** Swaps sort_order with the neighbour: two updates, not a rewrite of the list. */
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
