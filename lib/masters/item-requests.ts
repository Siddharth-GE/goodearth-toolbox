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
  usage_count: number;
};

/** No requireApp gate (masters read convention); only the resolve actions are restricted. */
export async function listItemRequests(
  status: ItemRequestStatus = "pending",
): Promise<ItemRequestRow[]> {
  const supabase = await createClient();

  const requests = await fetchAll((from, to) =>
    supabase
      .from("item_requests")
      .select("*, item_categories(name), brands(name)")
      .eq("status", status)
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to),
  );
  if (requests.length === 0) return [];

  // Read to completion: a capped count would show a heavily used item as barely used.
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
