import "server-only";

/**
 * The design photographs, read.
 *
 * SHARED CODE — the third thread in CLAUDE.md, alongside components/ui/*,
 * lib/masters/ and lib/format.ts. It lives here rather than in a tool
 * because TWO tools need the same photographs: Selections shows them on
 * the revision screen and prints them on the sheet set, and Budgets
 * prints them on the client quote. Until 2026-08-17 these functions sat
 * in lib/selections/views.ts and Budgets imported them from there, which
 * was the toolbox's oldest cross-tool code import, and
 * meant breaking Selections stopped the quote PDF compiling.
 *
 * SELECTIONS STILL OWNS THE WRITES. Uploading, captioning, reordering and
 * deleting a view are all in lib/selections/views-actions.ts, gated on
 * /selections, and they stay there — a photograph is added on a design
 * revision and nowhere else. Only the reading is shared.
 *
 * NO GRANT CHECK HERE, on purpose, following the lib/masters/* read
 * convention: each caller gates itself under its own grant before asking
 * (getBudgetHandoff enforces /selections, getBudget enforces /budgets),
 * and space_views' RLS read policy is open to authenticated staff anyway.
 * Anything ADDED to this file is therefore reachable by a holder of
 * either grant — so it must stay narrowly about design photographs.
 */
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";

/**
 * The private storage bucket the photographs live in.
 *
 * lib/selections/views-actions.ts deliberately re-declares this string
 * instead of importing it: that file is `"use server"`, and importing a
 * value out of a `server-only` module into one drags the server-only
 * chain into the client bundle. Both copies carry a comment saying so.
 */
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
 * THROWS on a failed read rather than answering with an empty map. It
 * used to log and return nothing, which meant a database error printed a
 * client quote with no photographs at all and reported success — the
 * QUAL-01 shape, on a document that goes to a buyer. A quote missing its
 * images must not be sendable.
 */
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
 * The image bytes themselves, for embedding in a PDF.
 *
 * The bucket is private, so there is no URL a document generator could
 * fetch — it downloads through the authenticated client instead.
 *
 * Returns null rather than throwing, and that difference from
 * listSpaceViews is deliberate: a view row whose FILE has gone missing is
 * one dropped photograph, and both callers drop it and carry on. A failed
 * read of the LIST is a document that silently has none of them.
 */
export async function downloadSpaceView(storagePath: string): Promise<Buffer | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(DESIGN_VIEWS_BUCKET).download(storagePath);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}
