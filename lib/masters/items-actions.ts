"use server";

import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { isItemKind, type ItemKind, type Placement } from "./constants";
import { isActiveUom } from "./uoms";

function readItemForm(formData: FormData) {
  return {
    code: String(formData.get("code") ?? "").trim() || null,
    name: String(formData.get("name") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim() || null,
    kind: String(formData.get("kind") ?? "") as ItemKind,
    category_id: String(formData.get("category_id") ?? ""),
    brand_id: String(formData.get("brand_id") ?? "") || null,
    placement: (String(formData.get("placement") ?? "") || null) as Placement | null,
    default_uom: String(formData.get("default_uom") ?? ""),
    indicative_price: formData.get("indicative_price")
      ? Number(formData.get("indicative_price"))
      : null,
  };
}

export async function createItem(_state: ActionState, formData: FormData): Promise<ActionState> {
  await requireTool("/masters");

  const input = readItemForm(formData);
  if (!input.name) return { error: "Enter an item name." };
  if (!isItemKind(input.kind)) return { error: "Choose catalogue or material." };
  if (!input.category_id) return { error: "Choose a category." };
  if (!(await isActiveUom(input.default_uom))) return { error: "Choose a unit of measure." };

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

export async function updateItem(
  id: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireTool("/masters");

  const input = readItemForm(formData);
  if (!input.name) return { error: "Enter an item name." };
  if (!isItemKind(input.kind)) return { error: "Choose catalogue or material." };
  if (!input.category_id) return { error: "Choose a category." };
  if (!(await isActiveUom(input.default_uom))) return { error: "Choose a unit of measure." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("items")
    .update({ ...input, updated_by: user.id })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") return { error: "An item with this code already exists." };
    console.error("updateItem failed:", error);
    return { error: "Could not update item. Try again." };
  }

  revalidatePath("/masters/items");
  return undefined;
}

/**
 * One item's price, and nothing else — for screens outside Masters that
 * show a price beside where it is used (the Estimator's rate panel), so
 * pricing a material doesn't mean opening the whole item form. The same
 * gate as every Masters write: `/masters`. Blank clears it — "not priced"
 * is a real answer and never ₹0. The caller refreshes its own screen.
 */
export async function setItemPrice(itemId: string, price: number | null): Promise<ActionState> {
  const user = await requireTool("/masters");
  if (!itemId) return { error: "Which item?" };
  if (price !== null && (typeof price !== "number" || !Number.isFinite(price) || price < 0)) {
    return { error: "The price must be a number, or left blank." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("items")
    .update({ indicative_price: price, updated_by: user.id })
    .eq("id", itemId);
  if (error) {
    console.error("setItemPrice failed:", error);
    return { error: "Could not save the price. Try again." };
  }

  revalidatePath("/masters/items");
  return undefined;
}
