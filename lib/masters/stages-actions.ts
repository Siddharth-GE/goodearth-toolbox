"use server";

import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type StageFormState = ActionState;

export async function addConstructionStage(
  _state: StageFormState,
  formData: FormData,
): Promise<StageFormState> {
  const user = await requireTool("/masters");

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Give the stage a name." };
  if (name.length > 60) return { error: "Keep the name under 60 characters." };

  const supabase = await createClient();

  // New stages land at the end of the sequence; steps of 10 leave room
  // to slot one between two later by editing sort_order in the database.
  const { data: last } = await supabase
    .from("construction_stages")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("construction_stages").insert({
    name,
    sort_order: (last?.sort_order ?? 0) + 10,
    created_by: user.id,
    updated_by: user.id,
  });
  if (error) {
    if (error.code === "23505") return { error: "That stage is already on the list." };
    console.error("addConstructionStage failed:", error);
    return { error: "Could not add the stage. Try again." };
  }

  revalidatePath("/masters/stages");
  return undefined;
}

/**
 * A rename follows through to every indent and construction budget line
 * carrying the stage — the FKs cascade on update (0053), so the word
 * changes everywhere at once and history keeps making sense.
 */
export async function renameConstructionStage(id: string, name: string): Promise<StageFormState> {
  const user = await requireTool("/masters");

  const trimmed = name.trim();
  if (!trimmed) return { error: "Give the stage a name." };
  if (trimmed.length > 60) return { error: "Keep the name under 60 characters." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("construction_stages")
    .update({ name: trimmed, updated_by: user.id })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") return { error: "Another stage already has that name." };
    console.error("renameConstructionStage failed:", error);
    return { error: "Could not rename the stage. Try again." };
  }

  revalidatePath("/masters/stages");
  return undefined;
}

export async function setConstructionStageActive(
  id: string,
  isActive: boolean,
): Promise<StageFormState> {
  const user = await requireTool("/masters");

  const supabase = await createClient();
  const { error } = await supabase
    .from("construction_stages")
    .update({ is_active: isActive, updated_by: user.id })
    .eq("id", id);
  if (error) {
    console.error("setConstructionStageActive failed:", error);
    return { error: "Could not update the stage. Try again." };
  }

  revalidatePath("/masters/stages");
  return undefined;
}
