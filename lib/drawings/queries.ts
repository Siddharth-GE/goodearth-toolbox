import "server-only";

import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";

/**
 * The released drawings, read.
 *
 * SHARED CODE — the lib/design-views precedent, restated for this tool
 * pair: Design Management owns every write on a drawing set, a revision,
 * its files and its work links (lib/design-management/actions.ts, gated
 * on /design-management) and stays that way. This module only reads what
 * has already been RELEASED, because Supervisors needs those exact rows
 * on the villa page and against each work — the same data, not a copy of
 * it.
 *
 * NO GRANT CHECK HERE, on purpose — the lib/masters/* and lib/design-views
 * convention: each caller gates itself under its own grant before asking
 * (lib/supervisors/queries.ts opens with requireTool("/supervisors"),
 * Design Management's own screens open with requireTool("/design-management")).
 * The underlying tables' RLS SELECT quals already admit either grant for
 * a non-draft revision (0091 drawing_revisions/drawing_revision_files/
 * drawing_revision_works), so this module widening its own reach costs
 * nothing on top of that — but it must stay narrowly about released
 * drawings, the same discipline lib/design-views keeps about photographs.
 *
 * Imports only the shared Supabase surface (createClient, fetchAll) —
 * never lib/design-management/ or lib/supervisors/, per CLAUDE.md's "one
 * tool never imports another tool's code; shared code never imports a
 * tool's."
 *
 * File BYTES are not served here. The private `drawings` bucket stays
 * behind app/(dashboard)/design-management/files/[fileId]/route.ts,
 * which re-checks the grant and re-reads the file row through the
 * RLS-scoped client before streaming. This module hands back file ids
 * only, for building that route's URL
 * (`/design-management/files/<fileId>`).
 */

export type ReleasedDrawingFile = {
  id: string;
  fileName: string;
  contentType: string;
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
  workItemIds: string[];
};

/**
 * Every drawing set with a released revision on this unit — the LATEST
 * released one. 0091's issue function supersedes the previous released
 * revision of a set the instant a new one releases, so there is at most
 * one row per (unit, set) with `status = 'released'` by design; no
 * ORDER/LIMIT trick is needed to pick "latest" out of several.
 *
 * Flat selects only, completed via `fetchAll` — a villa carries few
 * revisions in practice, but a read that has to be right is exactly what
 * `fetchAll` is for rather than trusting PostgREST's silent 1,000-row cap
 * to never bind. Ordered to match the drawing-set master's own order
 * (sort_order, then name) — the same sequence Design Management's own
 * screens and the transmittal PDF use, so a set doesn't jump around
 * depending which app is looking at it.
 *
 * Throws (with context) rather than answering with an empty list on a
 * failed read — an empty Drawings section that is actually a database
 * error would read as "nothing has been released yet," which is not what
 * happened.
 */
export async function listReleasedDrawingsForUnit(unitId: string): Promise<ReleasedDrawingSet[]> {
  const supabase = await createClient();

  let revisions: {
    id: string;
    drawing_set_id: string;
    revision_no: number;
    note: string | null;
    released_at: string | null;
  }[];
  let sets: { id: string; code: string | null; name: string; sort_order: number }[];
  let files: {
    id: string;
    drawing_revision_id: string;
    file_name: string;
    content_type: string;
  }[];
  let works: { drawing_revision_id: string; work_item_id: string }[];

  try {
    revisions = await fetchAll((from, to) =>
      supabase
        .from("drawing_revisions")
        .select("id, drawing_set_id, revision_no, note, released_at")
        .eq("unit_id", unitId)
        .eq("status", "released")
        .order("drawing_set_id")
        .order("id")
        .range(from, to),
    );

    if (revisions.length === 0) return [];

    const revisionIds = revisions.map((revision) => revision.id);
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
          .select("id, drawing_revision_id, file_name, content_type")
          .in("drawing_revision_id", revisionIds)
          .order("sort_order")
          .order("id")
          .range(from, to),
      ),
      fetchAll((from, to) =>
        supabase
          .from("drawing_revision_works")
          .select("drawing_revision_id, work_item_id")
          .in("drawing_revision_id", revisionIds)
          .order("id")
          .range(from, to),
      ),
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
    list.push({ id: file.id, fileName: file.file_name, contentType: file.content_type });
    filesByRevision.set(file.drawing_revision_id, list);
  }
  const workIdsByRevision = new Map<string, string[]>();
  for (const work of works) {
    const list = workIdsByRevision.get(work.drawing_revision_id) ?? [];
    list.push(work.work_item_id);
    workIdsByRevision.set(work.drawing_revision_id, list);
  }

  const ordered = [...revisions].sort((a, b) => {
    const setA = setsById.get(a.drawing_set_id);
    const setB = setsById.get(b.drawing_set_id);
    const orderA = setA?.sort_order ?? 0;
    const orderB = setB?.sort_order ?? 0;
    if (orderA !== orderB) return orderA - orderB;
    return (setA?.name ?? "").localeCompare(setB?.name ?? "");
  });

  return ordered.map((revision) => {
    const set = setsById.get(revision.drawing_set_id);
    // The guard trigger stamps released_at the one time a revision moves
    // off draft, so a row with status = 'released' always has one — a
    // missing value here is a data integrity problem, not a display
    // choice, and is worth failing loudly over.
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
      workItemIds: workIdsByRevision.get(revision.id) ?? [],
    };
  });
}
