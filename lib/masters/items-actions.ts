"use server";

import { requireApp } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { ItemKind, Placement, Uom } from "./items";

const ITEM_KINDS = ["catalogue", "material"];
const UOMS = ["each", "rft", "sqft", "lumpsum", "bag", "kg", "litre", "cft"];

export type ItemFormState = { error?: string } | undefined;

function readItemForm(formData: FormData) {
  return {
    code: String(formData.get("code") ?? "").trim() || null,
    name: String(formData.get("name") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || null,
    kind: String(formData.get("kind") ?? "") as ItemKind,
    category_id: String(formData.get("category_id") ?? ""),
    brand_id: String(formData.get("brand_id") ?? "") || null,
    placement: (String(formData.get("placement") ?? "") || null) as Placement | null,
    default_uom: String(formData.get("default_uom") ?? "") as Uom,
    indicative_price: formData.get("indicative_price") ? Number(formData.get("indicative_price")) : null,
  };
}

export async function createItem(_state: ItemFormState, formData: FormData): Promise<ItemFormState> {
  const user = await requireUser();
  await requireApp(user, "/masters");

  const input = readItemForm(formData);
  if (!input.name) return { error: "Enter an item name." };
  if (!ITEM_KINDS.includes(input.kind)) return { error: "Choose catalogue or material." };
  if (!input.category_id) return { error: "Choose a category." };
  if (!UOMS.includes(input.default_uom)) return { error: "Choose a unit of measure." };

  const supabase = await createClient();
  const { error } = await supabase.from("items").insert(input);
  if (error) {
    if (error.code === "23505") return { error: "An item with this code already exists." };
    console.error("createItem failed:", error);
    return { error: "Could not create item. Try again." };
  }

  revalidatePath("/masters/items");
  return undefined;
}

export async function updateItem(id: string, _state: ItemFormState, formData: FormData): Promise<ItemFormState> {
  const user = await requireUser();
  await requireApp(user, "/masters");

  const input = readItemForm(formData);
  if (!input.name) return { error: "Enter an item name." };
  if (!ITEM_KINDS.includes(input.kind)) return { error: "Choose catalogue or material." };
  if (!input.category_id) return { error: "Choose a category." };
  if (!UOMS.includes(input.default_uom)) return { error: "Choose a unit of measure." };

  const supabase = await createClient();
  const { error } = await supabase.from("items").update(input).eq("id", id);
  if (error) {
    if (error.code === "23505") return { error: "An item with this code already exists." };
    console.error("updateItem failed:", error);
    return { error: "Could not update item. Try again." };
  }

  revalidatePath("/masters/items");
  return undefined;
}
