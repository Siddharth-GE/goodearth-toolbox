import "server-only";

import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";

/**
 * A material's Master rate rises by itself when a PO is issued at a
 * higher rate, never falls (0103, founder 2026-10-08), and each rise is
 * logged in item_price_changes. This reads the newest rise per item for
 * the items list.
 *
 * item_price_changes is gated to /masters or /purchase-orders (it names
 * the PO and the old price), so anyone else simply sees no history. The
 * PO's number comes from po_facts — the money-free view every signed-in
 * person may read — never from the gated PO tables.
 */
export type PriceRaise = {
  item_id: string;
  old_price: number | null;
  new_price: number;
  changed_at: string;
  po_reference: string | null;
};

export async function latestPriceRaises(itemIds: string[]): Promise<Map<string, PriceRaise>> {
  if (itemIds.length === 0) return new Map();
  const supabase = await createClient();

  const changes = await fetchAll((from, to) =>
    supabase
      .from("item_price_changes")
      .select("item_id, old_price, new_price, po_id, changed_at")
      .in("item_id", itemIds)
      .order("changed_at", { ascending: false })
      .order("id")
      .range(from, to),
  );
  const latest = new Map<string, (typeof changes)[number]>();
  for (const change of changes) if (!latest.has(change.item_id)) latest.set(change.item_id, change);
  if (latest.size === 0) return new Map();

  const poIds = [...new Set([...latest.values()].map((change) => change.po_id))];
  const { data: pos, error } = await supabase
    .from("po_facts")
    .select("id, reference")
    .in("id", poIds);
  if (error) throw error;
  const references = new Map((pos ?? []).map((po) => [po.id, po.reference]));

  return new Map(
    [...latest.values()].map((change) => [
      change.item_id,
      {
        item_id: change.item_id,
        old_price: change.old_price,
        new_price: change.new_price,
        changed_at: change.changed_at,
        po_reference: references.get(change.po_id) ?? null,
      },
    ]),
  );
}
