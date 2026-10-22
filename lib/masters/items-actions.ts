"use server";

import { optionalText, rawText, text } from "@/lib/form-data";
import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { isItemKind, type ItemKind, type Placement } from "./constants";
import { listActiveGstRates } from "./gst-rates";
import { isActiveUom } from "./uoms";

function readItemForm(formData: FormData) {
  return {
    code: optionalText(formData, "code"),
    name: text(formData, "name"),
    description: optionalText(formData, "description"),
    kind: rawText(formData, "kind") as ItemKind,
    category_id: rawText(formData, "category_id"),
    brand_id: rawText(formData, "brand_id") || null,
    placement: (rawText(formData, "placement") || null) as Placement | null,
    default_uom: rawText(formData, "default_uom"),
    indicative_price: formData.get("indicative_price")
      ? Number(formData.get("indicative_price"))
      : null,
    gst_pct: rawText(formData, "gst_pct") === "" ? null : Number(rawText(formData, "gst_pct")),
  };
}

/** A GST % is one of the active rates the PO picker offers, or left blank; blank is never 0%. */
async function gstProblem(
  gst: number | null,
  current: number | null = null,
): Promise<string | null> {
  if (gst === null || gst === current) return null;
  const rates = await listActiveGstRates();
  return rates.some((r) => Number(r.rate) === gst)
    ? null
    : "Choose a GST rate from the list, or leave it blank.";
}

export async function createItem(_state: ActionState, formData: FormData): Promise<ActionState> {
  await requireTool("/masters");

  const input = readItemForm(formData);
  if (!input.name) return { error: "Enter an item name." };
  if (!isItemKind(input.kind)) return { error: "Choose catalogue or material." };
  if (!input.category_id) return { error: "Choose a category." };
  if (!(await isActiveUom(input.default_uom))) return { error: "Choose a unit of measure." };
  const gst = await gstProblem(input.gst_pct);
  if (gst) return { error: gst };

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
  const gst = await gstProblem(input.gst_pct, Number(rawText(formData, "gst_pct_was")) || null);
  if (gst) return { error: gst };

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
 * Price only, for screens outside Masters. Same gate as every Masters write.
 * Blank clears it: "not priced" is never ₹0.
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
