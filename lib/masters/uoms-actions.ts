"use server";

import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type UomFormState = ActionState;

export async function addUom(_state: UomFormState, formData: FormData): Promise<UomFormState> {
  const user = await requireTool("/masters");

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Give the unit a name." };
  if (name.length > 20) return { error: "Keep the unit under 20 characters." };

  const supabase = await createClient();

  const { data: last, error: lastError } = await supabase
    .from("uoms")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastError) {
    console.error("uoms next sort_order read failed:", lastError);
    return { error: "Could not work out where to add it. Try again." };
  }

  const { error } = await supabase.from("uoms").insert({
    name,
    sort_order: (last?.sort_order ?? 0) + 10,
    created_by: user.id,
    updated_by: user.id,
  });
  if (error) {
    if (error.code === "23505") return { error: "That unit is already on the list." };
    console.error("addUom failed:", error);
    return { error: "Could not add the unit. Try again." };
  }

  revalidatePath("/masters/uoms");
  return undefined;
}

/**
 * A rename follows through to every row carrying the unit — items,
 * request lines, movements, estimator setups — because all the FKs
 * cascade on update (0082). The word changes everywhere at once.
 */
export async function renameUom(id: string, name: string): Promise<UomFormState> {
  const user = await requireTool("/masters");

  const trimmed = name.trim();
  if (!trimmed) return { error: "Give the unit a name." };
  if (trimmed.length > 20) return { error: "Keep the unit under 20 characters." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("uoms")
    .update({ name: trimmed, updated_by: user.id })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") return { error: "Another unit already has that name." };
    console.error("renameUom failed:", error);
    return { error: "Could not rename the unit. Try again." };
  }

  revalidatePath("/masters/uoms");
  return undefined;
}

export async function setUomActive(id: string, isActive: boolean): Promise<UomFormState> {
  const user = await requireTool("/masters");

  const supabase = await createClient();
  const { error } = await supabase
    .from("uoms")
    .update({ is_active: isActive, updated_by: user.id })
    .eq("id", id);
  if (error) {
    console.error("setUomActive failed:", error);
    return { error: "Could not update the unit. Try again." };
  }

  revalidatePath("/masters/uoms");
  return undefined;
}
