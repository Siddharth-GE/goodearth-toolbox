"use server";

import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

/**
 * Build progress, written (0119). Order carries meaning here — the last
 * active stage is the handover — so unlike construction stages this list
 * can be re-ordered from the screen. A stage a plot sits on cannot be
 * deleted (0120's foreign key), so there is no delete: switch it off.
 */

function validName(name: string): string | ActionState {
  const trimmed = name.trim();
  if (!trimmed) return { error: "Give the stage a name." };
  if (trimmed.length > 60) return { error: "Keep the name under 60 characters." };
  return trimmed;
}

function refresh() {
  revalidatePath("/masters/stages");
  // Client Relations names each plot's stage and draws its rail from the order.
  revalidatePath("/client-relations", "layout");
}

export async function addProgressStage(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireTool("/masters");
  const name = validName(String(formData.get("name") ?? ""));
  if (typeof name !== "string") return name;

  const supabase = await createClient();
  const { data: last, error: lastError } = await supabase
    .from("progress_stages")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastError) {
    console.error("progress_stages next sort_order read failed:", lastError);
    return { error: "Could not work out where to add it. Try again." };
  }

  const { error } = await supabase.from("progress_stages").insert({
    name,
    sort_order: (last?.sort_order ?? 0) + 10,
    created_by: user.id,
    updated_by: user.id,
  });
  if (error) {
    if (error.code === "23505") return { error: "That stage is already on the list." };
    console.error("addProgressStage failed:", error);
    return { error: "Could not add the stage. Try again." };
  }

  refresh();
  return undefined;
}

export async function renameProgressStage(id: string, name: string): Promise<ActionState> {
  const user = await requireTool("/masters");
  const trimmed = validName(name);
  if (typeof trimmed !== "string") return trimmed;

  const supabase = await createClient();
  const { error } = await supabase
    .from("progress_stages")
    .update({ name: trimmed, updated_by: user.id })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") return { error: "Another stage already has that name." };
    console.error("renameProgressStage failed:", error);
    return { error: "Could not rename the stage. Try again." };
  }

  refresh();
  return undefined;
}

export async function setProgressStageActive(id: string, isActive: boolean): Promise<ActionState> {
  const user = await requireTool("/masters");

  const supabase = await createClient();
  const { error } = await supabase
    .from("progress_stages")
    .update({ is_active: isActive, updated_by: user.id })
    .eq("id", id);
  if (error) {
    console.error("setProgressStageActive failed:", error);
    return { error: "Could not update the stage. Try again." };
  }

  refresh();
  return undefined;
}

/**
 * Swap a stage with its neighbour above or below. Two updates, not one
 * transaction: if the second fails the two share a position for a moment
 * and the list sorts them by name — visible, harmless, and fixed by the
 * next press.
 */
export async function moveProgressStage(
  id: string,
  direction: "up" | "down",
): Promise<ActionState> {
  const user = await requireTool("/masters");

  const supabase = await createClient();
  let stages: { id: string; sort_order: number }[];
  try {
    stages = await fetchAll((from, to) =>
      supabase
        .from("progress_stages")
        .select("id, sort_order")
        .order("sort_order")
        .order("name")
        .order("id")
        .range(from, to),
    );
  } catch (error) {
    console.error("moveProgressStage read failed:", error);
    return { error: "Could not read the list. Try again." };
  }

  const at = stages.findIndex((stage) => stage.id === id);
  const other = direction === "up" ? at - 1 : at + 1;
  if (at === -1 || other < 0 || other >= stages.length) return undefined;

  const mine = stages[at];
  const theirs = stages[other];
  // Equal positions (two stages added by hand at one number) still swap:
  // nudge so the order actually changes.
  const myNew =
    theirs.sort_order === mine.sort_order
      ? theirs.sort_order + (direction === "up" ? -1 : 1)
      : theirs.sort_order;

  const first = await supabase
    .from("progress_stages")
    .update({ sort_order: myNew, updated_by: user.id })
    .eq("id", mine.id);
  if (first.error) {
    console.error("moveProgressStage failed:", first.error);
    return { error: "Could not move the stage. Try again." };
  }
  const second = await supabase
    .from("progress_stages")
    .update({ sort_order: mine.sort_order, updated_by: user.id })
    .eq("id", theirs.id);
  if (second.error) {
    console.error("moveProgressStage failed:", second.error);
    return { error: "Could not move the stage. Try again." };
  }

  refresh();
  return undefined;
}
