import "server-only";

/**
 * Shared: Selections and Budgets both read the design photographs. Selections still owns the writes (lib/selections/views-actions.ts).
 * No grant check here, on purpose: each caller gates itself, so keep this file narrowly about design photographs.
 */
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";

/**
 * Re-declared in lib/selections/views-actions.ts, not imported: a "use server" file importing from a server-only module drags it into the client bundle.
 */
export const DESIGN_VIEWS_BUCKET = "design-views";

export type SpaceViewRow = {
  id: string;
  space_id: string;
  storage_path: string;
  caption: string | null;
  sort_order: number;
};

/** Throws on a failed read, never an empty map: a client quote missing its photographs must not be sendable. */
export async function listSpaceViews(spaceIds: string[]): Promise<Map<string, SpaceViewRow[]>> {
  const bySpace = new Map<string, SpaceViewRow[]>();
  if (spaceIds.length === 0) return bySpace;

  const supabase = await createClient();
  const data = await fetchAll((from, to) =>
    supabase
      .from("space_views")
      .select("id, space_id, storage_path, caption, sort_order")
      .in("space_id", spaceIds)
      .order("sort_order")
      .order("created_at")
      .order("id")
      .range(from, to),
  );

  for (const view of data as SpaceViewRow[]) {
    const existing = bySpace.get(view.space_id);
    if (existing) existing.push(view);
    else bySpace.set(view.space_id, [view]);
  }
  return bySpace;
}

/**
 * Image bytes for a PDF, via the authenticated client (the bucket is private).
 * Returns null, not a throw: one missing file drops one photograph and callers carry on.
 */
export async function downloadSpaceView(storagePath: string): Promise<Buffer | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(DESIGN_VIEWS_BUCKET).download(storagePath);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}
