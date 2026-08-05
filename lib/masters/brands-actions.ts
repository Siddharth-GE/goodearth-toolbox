"use server";

import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type BrandFormState = ActionState;

export async function createBrand(
  _state: BrandFormState,
  formData: FormData,
): Promise<BrandFormState> {
  await requireTool("/masters");

  const name = String(formData.get("name") ?? "").trim();
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
  _state: BrandFormState,
  formData: FormData,
): Promise<BrandFormState> {
  const user = await requireTool("/masters");

  const name = String(formData.get("name") ?? "").trim();
  const is_active = formData.get("is_active") === "1";
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
