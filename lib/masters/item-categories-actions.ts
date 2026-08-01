"use server";

import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { isItemKind } from "./constants";

export type ItemCategoryFormState = ActionState;

export async function createItemCategory(
  _state: ItemCategoryFormState,
  formData: FormData,
): Promise<ItemCategoryFormState> {
  await requireTool("/masters");

  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "");
  if (!name) return { error: "Enter a category name." };
  if (!isItemKind(kind)) return { error: "Choose catalogue or material." };

  const supabase = await createClient();
  const { error } = await supabase.from("item_categories").insert({ name, kind });
  if (error) {
    if (error.code === "23505") return { error: "A category with this name already exists." };
    console.error("createItemCategory failed:", error);
    return { error: "Could not create category. Try again." };
  }

  revalidatePath("/masters/categories");
  return undefined;
}
