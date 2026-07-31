"use server";

import { requireApp } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { ItemKind } from "./items";

const ITEM_KINDS = ["catalogue", "material"];

export type ItemCategoryFormState = { error?: string } | undefined;

export async function createItemCategory(
  _state: ItemCategoryFormState,
  formData: FormData,
): Promise<ItemCategoryFormState> {
  const user = await requireUser();
  await requireApp(user, "/masters");

  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "") as ItemKind;
  if (!name) return { error: "Enter a category name." };
  if (!ITEM_KINDS.includes(kind)) return { error: "Choose catalogue or material." };

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
