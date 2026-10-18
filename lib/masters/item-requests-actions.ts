"use server";

import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function approveItemRequest(
  requestId: string,
  provisionalItemId: string,
  code: string | null,
): Promise<ActionState> {
  const user = await requireTool("/masters");
  const supabase = await createClient();

  const { error: itemError } = await supabase
    .from("items")
    .update({ is_provisional: false, code: code?.trim() || null, updated_by: user.id })
    .eq("id", provisionalItemId);
  if (itemError) {
    if (itemError.code === "23505") return { error: "That code is already used by another item." };
    console.error("approveItemRequest item failed:", itemError);
    return { error: "Could not approve the item. Try again." };
  }

  const { error } = await supabase
    .from("item_requests")
    .update({ status: "approved", resolved_by: user.id, resolved_at: new Date().toISOString() })
    .eq("id", requestId);
  if (error) {
    console.error("approveItemRequest failed:", error);
    return { error: "Item approved, but the request could not be closed." };
  }

  revalidatePath("/masters/requests");
  revalidatePath("/masters/items");
  return undefined;
}

/**
 * Not deleted and lines not repointed: issued revisions are immutable.
 * The row survives as a flagged alias, hidden from the picker.
 */
export async function mergeItemRequest(
  requestId: string,
  provisionalItemId: string,
  targetItemId: string,
): Promise<ActionState> {
  const user = await requireTool("/masters");
  if (!targetItemId) return { error: "Choose the item this duplicates." };
  if (targetItemId === provisionalItemId) return { error: "An item can't be merged into itself." };

  const supabase = await createClient();

  const { error: itemError } = await supabase
    .from("items")
    .update({
      merged_into_item_id: targetItemId,
      is_active: false,
      is_provisional: false,
      updated_by: user.id,
    })
    .eq("id", provisionalItemId);
  if (itemError) {
    console.error("mergeItemRequest item failed:", itemError);
    return { error: "Could not merge the item. Try again." };
  }

  const { error } = await supabase
    .from("item_requests")
    .update({
      status: "merged",
      merged_into_item_id: targetItemId,
      resolved_by: user.id,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", requestId);
  if (error) {
    console.error("mergeItemRequest failed:", error);
    return { error: "Item merged, but the request could not be closed." };
  }

  revalidatePath("/masters/requests");
  revalidatePath("/masters/items");
  return undefined;
}

export async function rejectItemRequest(
  requestId: string,
  provisionalItemId: string,
): Promise<ActionState> {
  const user = await requireTool("/masters");
  const supabase = await createClient();

  // Deactivated, not deleted: selection lines may point at it.
  const { error: itemError } = await supabase
    .from("items")
    .update({ is_active: false, updated_by: user.id })
    .eq("id", provisionalItemId);
  if (itemError) {
    console.error("rejectItemRequest item failed:", itemError);
    return { error: "Could not reject the item. Try again." };
  }

  const { error } = await supabase
    .from("item_requests")
    .update({ status: "rejected", resolved_by: user.id, resolved_at: new Date().toISOString() })
    .eq("id", requestId);
  if (error) {
    console.error("rejectItemRequest failed:", error);
    return { error: "Item retired, but the request could not be closed." };
  }

  revalidatePath("/masters/requests");
  revalidatePath("/masters/items");
  return undefined;
}
