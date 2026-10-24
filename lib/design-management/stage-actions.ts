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

import { placeStage, renumber, sameStages } from "./stage-order";

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

  const { data: added, error } = await supabase
    .from("design_stages")
    .insert({
      name,
      sort_order: (last?.sort_order ?? 0) + 10,
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { error: "That stage is already on the list." };
    console.error("addDesignStage failed:", error);
    return { error: "Could not add the stage. Try again." };
  }

  // Added at the end, then moved to where it was put; a failed move leaves it at the end, still added.
  const after = text(formData, "after") || "end";
  let placed = true;
  if (after !== "end") {
    const order = await readOrder(supabase);
    placed =
      !("error" in order) &&
      !(await writeOrder(supabase, user.id, placeStage(order.ids, added.id, after), order.current));
  }

  revalidatePath("/design-management", "layout");
  if (!placed) return { error: "Added at the end — move it into place." };
  return undefined;
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function readOrder(
  supabase: Supabase,
): Promise<{ ids: string[]; current: Map<string, number> } | { error: true }> {
  const { data, error } = await supabase
    .from("design_stages")
    .select("id, sort_order")
    .order("sort_order")
    .order("name")
    .order("id");
  if (error) {
    console.error("design_stages order read failed:", error);
    return { error: true };
  }
  return {
    ids: (data ?? []).map((stage) => stage.id),
    current: new Map((data ?? []).map((stage) => [stage.id, stage.sort_order])),
  };
}

/** Writes only the numbers that change; a part-failure leaves an order a further move puts right. */
async function writeOrder(
  supabase: Supabase,
  userId: string,
  ids: string[],
  current: Map<string, number>,
): Promise<boolean> {
  const results = await Promise.all(
    renumber(ids, current).map(({ id, sortOrder }) =>
      supabase
        .from("design_stages")
        .update({ sort_order: sortOrder, updated_by: userId })
        .eq("id", id),
    ),
  );
  const failed = results.find((result) => result.error);
  if (failed?.error) console.error("design_stages order write failed:", failed.error);
  return !!failed;
}

/** A dragged order: the whole list as the person sees it, refused if it no longer names every stage once. */
export async function reorderDesignStages(ids: string[]): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const supabase = await createClient();

  const order = await readOrder(supabase);
  if ("error" in order) return { error: "Could not reorder the stages. Try again." };
  if (!sameStages(ids, order.ids)) {
    return { error: "The stages changed while you were moving them. Reload and try again." };
  }
  if (await writeOrder(supabase, user.id, ids, order.current)) {
    return { error: "Could not save the new order. Try again." };
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

/** One step up or down, renumbering the list, so two stages sharing a number still move apart. */
export async function moveDesignStage(id: string, direction: "up" | "down"): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const supabase = await createClient();

  const order = await readOrder(supabase);
  if ("error" in order) return { error: "Could not reorder the stages. Try again." };
  const index = order.ids.indexOf(id);
  if (index === -1) return { error: "That stage no longer exists." };
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= order.ids.length) return undefined;

  const ids = [...order.ids];
  [ids[index], ids[swapIndex]] = [ids[swapIndex], ids[index]];
  if (await writeOrder(supabase, user.id, ids, order.current)) {
    return { error: "Could not reorder the stages. Try again." };
  }

  revalidatePath("/design-management", "layout");
  return undefined;
}
