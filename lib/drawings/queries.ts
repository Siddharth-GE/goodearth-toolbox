import "server-only";

import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";

import { readFolderSheets, type FolderSheet } from "./folder-sheets";
import { sheetNamingContext, type SheetContext } from "./sheet-context";
import { sheetFileName } from "./sheet-name";

/**
 * The released drawings, read for Supervisors; Design Management owns every write. No grant check, on purpose:
 * each caller gates itself, and RLS already admits either grant for a released revision (0091). Throws on a failed
 * read rather than showing "nothing released yet". File bytes are served only by the design-management files route.
 */

export type ReleasedDrawingFile = {
  id: string;
  fileName: string;
  /** The sheet's name as it downloads: SAA-Saarang-Villa12-WD-TB0003-GFP.pdf. */
  displayName: string;
  contentType: string;
};

export type DrawingHistoryEntry = {
  revisionNo: number;
  note: string | null;
  releasedAt: string | null;
};

export type ReleasedDrawingSet = {
  setId: string;
  setCode: string | null;
  setName: string;
  revision: {
    id: string;
    revisionNo: number;
    note: string | null;
    releasedAt: string;
  };
  files: ReleasedDrawingFile[];
  drawingsUrl: string | null;
  folderSheets: FolderSheet[];
  workItemIds: string[];
  /** The change log: superseded revisions, newest first, with number, note and date only. No files: site must not be one tap from an old sheet. */
  history: DrawingHistoryEntry[];
};

/**
 * Every drawing set's latest released revision on this unit (at most one per set: Issue supersedes the previous).
 * Throws on a failed read rather than returning an empty list, which would read as "nothing released yet".
 */
export async function listReleasedDrawingsForUnit(unitId: string): Promise<ReleasedDrawingSet[]> {
  const supabase = await createClient();

  let revisions: {
    id: string;
    drawing_set_id: string;
    revision_no: number;
    note: string | null;
    released_at: string | null;
    status: string;
    drawings_url: string | null;
  }[];
  let sets: { id: string; code: string | null; name: string; sort_order: number }[];
  let files: {
    id: string;
    drawing_revision_id: string;
    file_name: string;
    content_type: string;
    sheet_code: string | null;
  }[];
  let naming: Map<string, SheetContext>;
  let folderSheets: Map<string, FolderSheet[]>;
  let works: { drawing_revision_id: string; work_item_id: string }[];

  try {
    revisions = await fetchAll((from, to) =>
      supabase
        .from("drawing_revisions")
        .select("id, drawing_set_id, revision_no, note, released_at, status, drawings_url")
        .eq("unit_id", unitId)
        .neq("status", "draft")
        .order("drawing_set_id")
        .order("revision_no")
        .order("id")
        .range(from, to),
    );

    if (revisions.length === 0) return [];

    // Files and work links only for released revisions; the history carries notes and dates.
    const releasedIds = revisions
      .filter((revision) => revision.status === "released")
      .map((revision) => revision.id);
    const setIds = [...new Set(revisions.map((revision) => revision.drawing_set_id))];

    [sets, files, works] = await Promise.all([
      fetchAll((from, to) =>
        supabase
          .from("drawing_sets")
          .select("id, code, name, sort_order")
          .in("id", setIds)
          .order("sort_order")
          .order("id")
          .range(from, to),
      ),
      fetchAll((from, to) =>
        supabase
          .from("drawing_revision_files")
          .select("id, drawing_revision_id, file_name, content_type, sheet_code")
          .in("drawing_revision_id", releasedIds)
          .order("sort_order")
          .order("id")
          .range(from, to),
      ),
      fetchAll((from, to) =>
        supabase
          .from("drawing_revision_works")
          .select("drawing_revision_id, work_item_id")
          .in("drawing_revision_id", releasedIds)
          .order("id")
          .range(from, to),
      ),
    ]);
    [naming, folderSheets] = await Promise.all([
      sheetNamingContext(supabase, releasedIds),
      readFolderSheets(supabase, releasedIds),
    ]);
  } catch (error) {
    throw new Error(
      `Could not read the released drawings for this villa: ${(error as Error).message}`,
      { cause: error },
    );
  }

  const setsById = new Map(sets.map((set) => [set.id, set]));
  const filesByRevision = new Map<string, ReleasedDrawingFile[]>();
  for (const file of files) {
    const list = filesByRevision.get(file.drawing_revision_id) ?? [];
    const context = naming.get(file.drawing_revision_id);
    list.push({
      id: file.id,
      fileName: file.file_name,
      displayName: context
        ? sheetFileName({
            ...context,
            sheetCode: file.sheet_code,
            originalFileName: file.file_name,
            contentType: file.content_type,
          })
        : file.file_name,
      contentType: file.content_type,
    });
    filesByRevision.set(file.drawing_revision_id, list);
  }
  const workIdsByRevision = new Map<string, string[]>();
  for (const work of works) {
    const list = workIdsByRevision.get(work.drawing_revision_id) ?? [];
    list.push(work.work_item_id);
    workIdsByRevision.set(work.drawing_revision_id, list);
  }

  const historyBySet = new Map<string, DrawingHistoryEntry[]>();
  for (const revision of revisions) {
    if (revision.status !== "superseded") continue;
    const list = historyBySet.get(revision.drawing_set_id) ?? [];
    list.push({
      revisionNo: revision.revision_no,
      note: revision.note,
      releasedAt: revision.released_at,
    });
    historyBySet.set(revision.drawing_set_id, list);
  }
  for (const list of historyBySet.values()) list.reverse();

  const released = revisions.filter((revision) => revision.status === "released");
  const ordered = [...released].sort((a, b) => {
    const setA = setsById.get(a.drawing_set_id);
    const setB = setsById.get(b.drawing_set_id);
    const orderA = setA?.sort_order ?? 0;
    const orderB = setB?.sort_order ?? 0;
    if (orderA !== orderB) return orderA - orderB;
    return (setA?.name ?? "").localeCompare(setB?.name ?? "");
  });

  return ordered.map((revision) => {
    const set = setsById.get(revision.drawing_set_id);
    // The guard trigger always stamps released_at; a missing one is a data problem worth failing on.
    if (!revision.released_at) {
      throw new Error(
        `Drawing revision ${revision.id} has status "released" but no released_at timestamp.`,
      );
    }
    return {
      setId: revision.drawing_set_id,
      setCode: set?.code ?? null,
      setName: set?.name ?? "Unknown drawing set",
      revision: {
        id: revision.id,
        revisionNo: revision.revision_no,
        note: revision.note,
        releasedAt: revision.released_at,
      },
      files: filesByRevision.get(revision.id) ?? [],
      drawingsUrl: revision.drawings_url,
      folderSheets: folderSheets.get(revision.id) ?? [],
      workItemIds: workIdsByRevision.get(revision.id) ?? [],
      history: historyBySet.get(revision.drawing_set_id) ?? [],
    };
  });
}
