import "server-only";

// SHARED SURFACE — the one module in a tool's folder other tools import.
// Budgets renders design views into the client quote (lib/budgets/
// quote.ts), so everything here is deliberately un-gated, exactly like
// lib/masters/* reads: callers gate themselves under their own grant,
// and space_views' RLS read policy is open to authenticated staff.
// It stays in lib/selections/ because Selections owns the writes
// (views-actions.ts); if a third consumer appears (Indents?), move the
// reads to their own lib/design-views/ instead of importing from here.
import { createClient } from "@/lib/supabase/server";

export const DESIGN_VIEWS_BUCKET = "design-views";

export type SpaceViewRow = {
  id: string;
  space_id: string;
  storage_path: string;
  caption: string | null;
  sort_order: number;
};

/**
 * Views for a set of spaces, in one query.
 *
 * No requireApp gate on purpose, following the masters read convention:
 * Budgets renders these into the client quote under its own /budgets
 * grant and must not need /selections to do it. Callers gate themselves.
 */
export async function listSpaceViews(spaceIds: string[]): Promise<Map<string, SpaceViewRow[]>> {
  const bySpace = new Map<string, SpaceViewRow[]>();
  if (spaceIds.length === 0) return bySpace;

  const supabase = await createClient();
  const { data } = await supabase
    .from("space_views")
    .select("id, space_id, storage_path, caption, sort_order")
    .in("space_id", spaceIds)
    .order("sort_order")
    .order("created_at");

  for (const view of (data ?? []) as SpaceViewRow[]) {
    const existing = bySpace.get(view.space_id);
    if (existing) existing.push(view);
    else bySpace.set(view.space_id, [view]);
  }
  return bySpace;
}

/**
 * The image bytes themselves, for embedding in a PDF.
 *
 * The bucket is private, so there is no URL a document generator could
 * fetch — it downloads through the authenticated client instead.
 */
export async function downloadSpaceView(storagePath: string): Promise<Buffer | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(DESIGN_VIEWS_BUCKET).download(storagePath);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}
