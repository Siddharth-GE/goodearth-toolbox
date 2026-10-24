"use server";

import { checked, text } from "@/lib/form-data";
import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { deleteMaster } from "./delete-master";

export async function createBrand(_state: ActionState, formData: FormData): Promise<ActionState> {
  await requireTool("/masters");

  const name = text(formData, "name");
  if (!name) return { error: "Enter a brand name." };

  const supabase = await createClient();
  const { error } = await supabase.from("brands").insert({ name });
  if (error) {
    if (error.code === "23505") return { error: "A brand with this name already exists." };
    console.error("createBrand failed:", error);
    return { error: "Could not create brand. Try again." };
  }

  revalidatePath("/masters/categories");
  return undefined;
}

export async function updateBrand(
  id: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireTool("/masters");

  const name = text(formData, "name");
  const is_active = checked(formData, "is_active", "1");
  if (!name) return { error: "Enter a brand name." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("brands")
    .update({ name, is_active, updated_by: user.id })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") return { error: "A brand with this name already exists." };
    console.error("updateBrand failed:", error);
    return { error: "Could not update brand. Try again." };
  }

  revalidatePath("/masters/categories");
  return undefined;
}

/** Only while nothing uses it, and only by an admin (0150); anything in use is retired with Active instead. */
export async function deleteBrand(id: string): Promise<ActionState> {
  const user = await requireTool("/masters");
  return deleteMaster(user, "brands", id, {
    noun: "brand",
    retire: true,
    paths: ["/masters/categories"],
  });
}
