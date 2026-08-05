import "server-only";

import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";

export type ItemRequestStatus = "pending" | "approved" | "merged" | "rejected";

export type ItemRequestRow = {
  id: string;
  provisional_item_id: string;
  requested_name: string;
  category_name: string | null;
  brand_name: string | null;
  spec_note: string | null;
  status: ItemRequestStatus;
  created_at: string;
  /** How many selection lines already point at the provisional item. */
  usage_count: number;
};

/**
 * Requests raised by designers for items the catalogue doesn't have.
 *
 * No requireApp gate, per the masters convention — reads are open to any
 * tool that already gated its own entry point. Only the resolve actions
 * are restricted.
 */
export async function listItemRequests(
  status: ItemRequestStatus = "pending",
): Promise<ItemRequestRow[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("item_requests")
    .select("*, item_categories(name), brands(name)")
    .eq("status", status)
    .order("created_at", { ascending: false });
  if (error) console.error("listItemRequests failed:", error);

  const requests = data ?? [];
  if (requests.length === 0) return [];

  // How widely each provisional item is already used — the thing that
  // makes a merge consequential rather than housekeeping. Read to
  // completion: a count derived from a capped read would report a
  // heavily-used item as barely used, and it could be merged on that
  // basis.
  const lines = await fetchAll((from, to) =>
    supabase
      .from("selection_lines")
      .select("item_id")
      .in(
        "item_id",
        requests.map((request) => request.provisional_item_id),
      )
      .order("id")
      .range(from, to),
  );

  const usage = new Map<string, number>();
  for (const line of lines) usage.set(line.item_id, (usage.get(line.item_id) ?? 0) + 1);

  return requests.map((request) => ({
    id: request.id,
    provisional_item_id: request.provisional_item_id,
    requested_name: request.requested_name,
    category_name: (request.item_categories as { name: string } | null)?.name ?? null,
    brand_name: (request.brands as { name: string } | null)?.name ?? null,
    spec_note: request.spec_note,
    status: request.status as ItemRequestStatus,
    created_at: request.created_at,
    usage_count: usage.get(request.provisional_item_id) ?? 0,
  }));
}
