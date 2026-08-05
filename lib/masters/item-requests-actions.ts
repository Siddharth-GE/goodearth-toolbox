"use server";

import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type RequestActionState = ActionState;

/**
 * Accepts the provisional item into the catalogue as it stands.
 * An optional code lets Masters give it the catalogue's own convention
 * (4-letter sub-type prefix + number) at the same moment.
 */
export async function approveItemRequest(
  requestId: string,
  provisionalItemId: string,
  code: string | null,
): Promise<RequestActionState> {
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
 * Records the provisional item as a duplicate of an existing one.
 *
 * The provisional row is NOT deleted and selection lines are NOT
 * repointed — issued revisions referencing it are immutable, and quietly
 * rewriting them would break the guarantee the whole revision design
 * rests on. It survives as an alias: flagged, pointed at its replacement,
 * and hidden from the picker so nobody picks it again.
 */
export async function mergeItemRequest(
  requestId: string,
  provisionalItemId: string,
  targetItemId: string,
): Promise<RequestActionState> {
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

/** Rejects the request and retires the provisional item from the picker. */
export async function rejectItemRequest(
  requestId: string,
  provisionalItemId: string,
): Promise<RequestActionState> {
  const user = await requireTool("/masters");
  const supabase = await createClient();

  // Deactivated rather than deleted: selection lines may already point at
  // it, and those lines are the record of what was specified.
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
