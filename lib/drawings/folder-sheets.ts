import "server-only";

import { fetchAll } from "@/lib/supabase/fetch-all";
import type { createClient } from "@/lib/supabase/server";

/**
 * A revision's WorkDrive folder as last read (0124): read on the draft and once more on Issue, then fixed.
 * No grant check: each caller gates itself. Throws on a failed read (fetchAll), like queries.ts.
 */
export type FolderSheet = {
  id: string;
  name: string;
  modifiedAt: string | null;
  readAt: string;
};

type Client = Awaited<ReturnType<typeof createClient>>;

export async function readFolderSheets(
  supabase: Client,
  revisionIds: string[],
): Promise<Map<string, FolderSheet[]>> {
  const byRevision = new Map<string, FolderSheet[]>();
  const ids = [...new Set(revisionIds)];
  if (ids.length === 0) return byRevision;

  const rows = await fetchAll<{
    id: string;
    drawing_revision_id: string;
    name: string;
    modified_at: string | null;
    created_at: string;
  }>((from, to) =>
    supabase
      .from("drawing_revision_folder_sheets")
      .select("id, drawing_revision_id, name, modified_at, created_at")
      .in("drawing_revision_id", ids)
      .order("sort_order")
      .order("id")
      .range(from, to),
  );

  for (const row of rows) {
    const list = byRevision.get(row.drawing_revision_id) ?? [];
    list.push({ id: row.id, name: row.name, modifiedAt: row.modified_at, readAt: row.created_at });
    byRevision.set(row.drawing_revision_id, list);
  }
  return byRevision;
}
