"use server";

import { checked, rawText, text } from "@/lib/form-data";
import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { isItemKind } from "./constants";
import { deleteMaster } from "./delete-master";

export async function createItemCategory(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireTool("/masters");

  const name = text(formData, "name");
  const kind = rawText(formData, "kind");
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

// Kind stays fixed: items under this category were picked with its kind in mind. Rename or deactivate instead.
export async function updateItemCategory(
  id: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireTool("/masters");

  const name = text(formData, "name");
  const is_active = checked(formData, "is_active", "1");
  if (!name) return { error: "Enter a category name." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("item_categories")
    .update({ name, is_active, updated_by: user.id })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") return { error: "A category with this name already exists." };
    console.error("updateItemCategory failed:", error);
    return { error: "Could not update category. Try again." };
  }

  revalidatePath("/masters/categories");
  return undefined;
}

/** Only while nothing uses it, and only by an admin (0150); anything in use is retired with Active instead. */
export async function deleteItemCategory(id: string): Promise<ActionState> {
  const user = await requireTool("/masters");
  return deleteMaster(user, "item_categories", id, {
    noun: "category",
    retire: true,
    paths: ["/masters/categories"],
  });
}
