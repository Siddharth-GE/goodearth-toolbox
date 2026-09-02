"use server";

import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

function readStoreForm(formData: FormData) {
  return {
    name: String(formData.get("name") ?? "").trim(),
    project_id: String(formData.get("project_id") ?? "") || null,
    location: String(formData.get("location") ?? "").trim() || null,
    is_active: formData.get("is_active") === "1",
  };
}

export async function createStore(_state: ActionState, formData: FormData): Promise<ActionState> {
  await requireTool("/masters");

  const { name, project_id, location, is_active } = readStoreForm(formData);
  if (!name) return { error: "Enter the store's name." };

  const supabase = await createClient();
  const { error } = await supabase.from("stores").insert({ name, project_id, location, is_active });
  if (error) {
    console.error("createStore failed:", error);
    return { error: "Could not create store. Try again." };
  }

  revalidatePath("/masters/stores");
  return undefined;
}

export async function updateStore(
  id: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireTool("/masters");

  const { name, project_id, location, is_active } = readStoreForm(formData);
  if (!name) return { error: "Enter the store's name." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("stores")
    .update({ name, project_id, location, is_active, updated_by: user.id })
    .eq("id", id);
  if (error) {
    console.error("updateStore failed:", error);
    return { error: "Could not update store. Try again." };
  }

  revalidatePath("/masters/stores");
  return undefined;
}
