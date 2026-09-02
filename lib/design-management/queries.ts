import "server-only";

import { requireTool } from "@/lib/auth/access";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { readFailed } from "@/lib/supabase/read-failed";
import { createClient } from "@/lib/supabase/server";

/**
 * Reads for the Design Management app.
 *
 * Every function opens with `requireTool("/design-management")`. What
 * this tool reads from outside itself (STATUS.md contract row): the
 * shared units/plots/projects/profiles masters, and the works
 * vocabulary (work_categories/work_groups/work_items) via
 * lib/masters/works.ts — the same vocabulary Estimator prices and
 * Supervisors logs against. Nothing here reads or shows money.
 *
 * `units` has two FK paths to `plots` (0029), and `drawing_revisions` /
 * `transmittals` carry multiple FKs to `profiles` (created_by,
 * released_by/issued_by, updated_by) — so wherever this module needs a
 * villa or a person's name it merges through a `Map` rather than an
 * embed (BUGCATCHER #2), the lib/supervisors/queries.ts pattern.
 */

const GRANT = "/design-management";

const fail = (context: string, error: { message: string }): never =>
  readFailed("design-management", context, error);

// ---------------------------------------------------------------------
// Welcome
// ---------------------------------------------------------------------

export async function getWelcomeCounts(): Promise<{
  villasWithReleasedDrawings: number;
  draftTransmittals: number;
  transmittalsIssued: number;
}> {
  await requireTool(GRANT);
  const supabase = await createClient();

  // No count of drawing sets: there is no master list to count any more
  // (founder, 2026-08-22 evening). Everything here is plot-level.
  const [releasedRevisionUnits, draftTransmittals, issuedTransmittals] = await Promise.all([
    // "Villas with at least one released drawing" is a
    // COUNT(DISTINCT unit_id) — `head: true` counts rows, not distinct
    // values, so it can't express this. Reading the (single, small)
    // unit_id column to completion via fetchAll and deduping in JS is
    // the honest alternative to guessing at a cap; there is no
    // aggregate view here to lean on (this tool has none — no money,
    // no fact view).
    fetchAll<{ unit_id: string }>((from, to) =>
      supabase
        .from("drawing_revisions")
        .select("unit_id")
        .eq("status", "released")
        .order("unit_id")
        .range(from, to),
    ),
    supabase
      .from("transmittals")
      .select("id", { count: "exact", head: true })
      .eq("status", "draft"),
    supabase
      .from("transmittals")
      .select("id", { count: "exact", head: true })
      .eq("status", "issued"),
  ]);

  return {
    villasWithReleasedDrawings: new Set(releasedRevisionUnits.map((row) => row.unit_id)).size,
    draftTransmittals: draftTransmittals.count ?? 0,
    transmittalsIssued: issuedTransmittals.count ?? 0,
  };
}

// ---------------------------------------------------------------------
// Design stages
// ---------------------------------------------------------------------

export type DesignStageRow = {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
};

export async function listDesignStages(): Promise<DesignStageRow[]> {
  await requireTool(GRANT);
  const supabase = await createClient();

  const data = await fetchAll<{
    id: string;
    name: string;
    sort_order: number;
    is_active: boolean;
  }>((from, to) =>
    supabase
      .from("design_stages")
      .select("id, name, sort_order, is_active")
      .order("sort_order")
      .order("name")
      .order("id")
      .range(from, to),
  );

  return data.map((stage) => ({
    id: stage.id,
    name: stage.name,
    sortOrder: stage.sort_order,
    isActive: stage.is_active,
  }));
}

// ---------------------------------------------------------------------
// Villas
// ---------------------------------------------------------------------

export type DesignVillaRow = {
  unitId: string;
  villaName: string;
  plotName: string;
  projectName: string;
  /** Transmittals issued on this villa — a draft is not one yet. */
  transmittalsIssued: number;
  /** Drafts still being put together here. */
  draftTransmittals: number;
  lastIssuedAt: string | null;
};

/**
 * Every villa as a card: where its drawings stand, said in transmittals.
 *
 * Founder, 2026-08-22 evening: "person sees all villas (as cards) goes
 * into the villa there all transmittals of that plot". So the summary is
 * plot-level — how much has gone out and when — rather than a count of
 * revisions, which is detail belonging one level in.
 *
 * Anchored on `unit_id` rather than `plot_id` because this tool's own
 * tables key off units. The per-villa tallies read the whole (small)
 * transmittals table once via `fetchAll` and count in JS rather than
 * running one query per villa.
 */
export async function listVillas(): Promise<DesignVillaRow[]> {
  await requireTool(GRANT);
  const supabase = await createClient();

  const [units, plots, projects, transmittals] = await Promise.all([
    fetchAll<{ id: string; project_id: string; plot_id: string; name: string }>((from, to) =>
      supabase
        .from("units")
        .select("id, project_id, plot_id, name")
        .order("name")
        .order("id")
        .range(from, to),
    ),
    fetchAll<{ id: string; name: string }>((from, to) =>
      supabase.from("plots").select("id, name").order("id").range(from, to),
    ),
    fetchAll<{ id: string; name: string }>((from, to) =>
      supabase.from("projects").select("id, name").order("id").range(from, to),
    ),
    fetchAll<{ unit_id: string; status: string; issued_at: string | null }>((from, to) =>
      supabase
        .from("transmittals")
        .select("unit_id, status, issued_at")
        .order("unit_id")
        .order("id")
        .range(from, to),
    ),
  ]);

  const plotNames = new Map(plots.map((plot) => [plot.id, plot.name]));
  const projectNames = new Map(projects.map((project) => [project.id, project.name]));

  const issued = new Map<string, number>();
  const drafts = new Map<string, number>();
  const lastIssued = new Map<string, string>();
  for (const transmittal of transmittals) {
    if (transmittal.status === "issued") {
      issued.set(transmittal.unit_id, (issued.get(transmittal.unit_id) ?? 0) + 1);
      const held = lastIssued.get(transmittal.unit_id);
      if (transmittal.issued_at && (!held || transmittal.issued_at > held)) {
        lastIssued.set(transmittal.unit_id, transmittal.issued_at);
      }
    } else {
      drafts.set(transmittal.unit_id, (drafts.get(transmittal.unit_id) ?? 0) + 1);
    }
  }

  return units.map((unit) => ({
    unitId: unit.id,
    villaName: unit.name,
    plotName: plotNames.get(unit.plot_id) ?? "—",
    projectName: projectNames.get(unit.project_id) ?? "—",
    transmittalsIssued: issued.get(unit.id) ?? 0,
    draftTransmittals: drafts.get(unit.id) ?? 0,
    lastIssuedAt: lastIssued.get(unit.id) ?? null,
  }));
}

export type DrawingRevisionFileRow = {
  id: string;
  fileName: string;
  contentType: string;
  sortOrder: number;
};

export type DrawingRevisionRow = {
  id: string;
  revisionNo: number;
  status: "draft" | "released" | "superseded";
  note: string | null;
  releasedAt: string | null;
  files: DrawingRevisionFileRow[];
  /**
   * Null for released/superseded revisions — those work links are frozen
   * and the screen never offers to edit them, so there is nothing to
   * fetch. Populated only for the (at most one) draft per set.
   */
  workItemIds: string[] | null;
};

export type VillaTransmittalRow = {
  id: string;
  /** Null while it is a draft — the number is minted on Issue (0091 §7). */
  number: string | null;
  status: "draft" | "issued";
  stageId: string;
  stageName: string;
  lineCount: number;
  issuedAt: string | null;
  issuedByName: string | null;
  createdAt: string;
};

export type VillaDesignDetail = {
  unitId: string;
  villaName: string;
  plotName: string;
  projectName: string;
  /** Newest first, and complete — one villa's transmittals are few. */
  transmittals: VillaTransmittalRow[];
  /**
   * The design stages that actually appear on this villa's transmittals,
   * in the stage master's own order — the filter chips. A stage nobody
   * has issued against here is not offered: a chip that can only ever
   * show an empty list is clutter, which is the thing being removed.
   */
  stages: { id: string; name: string }[];
};

/**
 * The villa's home page: who it is, and every transmittal on it.
 *
 * Founder, 2026-08-22 evening: "goes into the villa there all
 * transmittals of that plot, filters by group". So this replaced both
 * the old stage board and the global transmittals list — everything is
 * plot-level now, and there is no company-wide list to consolidate with.
 *
 * Read complete rather than capped: a villa accumulates transmittals at
 * the speed a design team issues drawings, and the filter chips have to
 * be able to say honestly which stages appear. `null` when the unit id
 * doesn't exist — the caller's `notFound()`.
 *
 * Ordered by `created_at`: a draft has no issue date at all, and
 * PostgREST cannot order on a coalesce. A transmittal is issued within
 * minutes of being raised, so the two orders agree — and an unfinished
 * draft belongs at the top anyway.
 */
export async function getVillaDesignDetail(unitId: string): Promise<VillaDesignDetail | null> {
  await requireTool(GRANT);
  const supabase = await createClient();

  const { data: unit, error: unitError } = await supabase
    .from("units")
    .select("id, name, plot_id, project_id")
    .eq("id", unitId)
    .maybeSingle();
  if (unitError) fail("the villa", unitError);
  if (!unit) return null;

  const [plot, project, transmittals, stages] = await Promise.all([
    supabase.from("plots").select("name").eq("id", unit.plot_id).maybeSingle(),
    supabase.from("projects").select("name").eq("id", unit.project_id).maybeSingle(),
    fetchAll<{
      id: string;
      design_stage_id: string;
      number: string | null;
      status: string;
      issued_at: string | null;
      issued_by: string | null;
      created_at: string;
    }>((from, to) =>
      supabase
        .from("transmittals")
        .select("id, design_stage_id, number, status, issued_at, issued_by, created_at")
        .eq("unit_id", unitId)
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to),
    ),
    fetchAll<{ id: string; name: string; sort_order: number }>((from, to) =>
      supabase
        .from("design_stages")
        .select("id, name, sort_order")
        .order("sort_order")
        .order("id")
        .range(from, to),
    ),
  ]);
  if (plot.error) fail("the villa", plot.error);
  if (project.error) fail("the villa", project.error);

  const transmittalIds = transmittals.map((row) => row.id);
  const issuerIds = [
    ...new Set(transmittals.map((row) => row.issued_by).filter((id): id is string => id !== null)),
  ];

  // Names merge through Maps, never an embed: `transmittals` carries two
  // FKs to `profiles` (created_by and issued_by), which is a PGRST201 at
  // runtime that every local gate passes (BUGCATCHER #2).
  const [lines, issuers] = await Promise.all([
    transmittalIds.length > 0
      ? fetchAll<{ transmittal_id: string }>((from, to) =>
          supabase
            .from("transmittal_lines")
            .select("transmittal_id")
            .in("transmittal_id", transmittalIds)
            .order("id")
            .range(from, to),
        )
      : Promise.resolve([]),
    issuerIds.length > 0
      ? fetchAll<{ id: string; full_name: string | null }>((from, to) =>
          supabase
            .from("profiles")
            .select("id, full_name")
            .in("id", issuerIds)
            .order("id")
            .range(from, to),
        )
      : Promise.resolve([]),
  ]);

  const lineCounts = new Map<string, number>();
  for (const line of lines) {
    lineCounts.set(line.transmittal_id, (lineCounts.get(line.transmittal_id) ?? 0) + 1);
  }
  const issuerNames = new Map(issuers.map((issuer) => [issuer.id, issuer.full_name]));
  const stageNames = new Map(stages.map((stage) => [stage.id, stage.name]));

  const rows: VillaTransmittalRow[] = transmittals.map((row) => ({
    id: row.id,
    number: row.number,
    status: row.status as VillaTransmittalRow["status"],
    stageId: row.design_stage_id,
    stageName: stageNames.get(row.design_stage_id) ?? "—",
    lineCount: lineCounts.get(row.id) ?? 0,
    issuedAt: row.issued_at,
    issuedByName: row.issued_by ? (issuerNames.get(row.issued_by) ?? null) : null,
    createdAt: row.created_at,
  }));

  const present = new Set(rows.map((row) => row.stageId));

  return {
    unitId: unit.id,
    villaName: unit.name,
    plotName: plot.data?.name ?? "—",
    projectName: project.data?.name ?? "—",
    transmittals: rows,
    stages: stages
      .filter((stage) => present.has(stage.id))
      .map((stage) => ({ id: stage.id, name: stage.name })),
  };
}

export type VillaRevisionSummary = {
  revisionId: string;
  revisionNo: number;
  note: string | null;
  fileCount: number;
};

export type VillaDrawingSetState = {
  setId: string;
  setCode: string | null;
  setName: string;
  /** The one open draft on this villa, if there is one. */
  draft: VillaRevisionSummary | null;
  /** The current released revision, if this set has ever gone out here. */
  released: VillaRevisionSummary | null;
  /**
   * What "Revise" would number the next draft — max + 1 across every
   * status, or 0 for a set never drawn for this villa. Superseded rows
   * count: a number is spent once and never re-used.
   */
  nextRevisionNo: number;
};

/**
 * THIS VILLA'S drawing sets, and where it stands on each: the open
 * draft, the current released revision, and the number the next
 * revision would take.
 *
 * A set is only this villa's if a revision of it lives on this unit.
 * That is the whole of the villa-scoping the founder asked for on
 * 2026-08-22 evening — "not a master set for the whole damn project" —
 * and it needs no column: `drawing_sets` stays one global table, and a
 * set born on another villa's transmittal simply never appears here.
 * Two villas that both make a "Working Drawings" are two rows, which is
 * intended.
 *
 * It feeds two screens: the villa page's read-only "Drawing sets on this
 * plot", and the transmittal's Add-drawings board (Continue draft /
 * Revise). A set that has never been drawn here cannot be reached from
 * either — that is what the transmittal's "New drawing set" control is
 * for.
 *
 * A retired set still appears if it carries history here, so a villa
 * mid-flight is never stranded.
 */
export async function listVillaDrawingSetStates(unitId: string): Promise<VillaDrawingSetState[]> {
  await requireTool(GRANT);
  const supabase = await createClient();

  // The villa's revisions come first, and the sets follow from them —
  // the order that makes the scoping true rather than filtered.
  const revisions = await fetchAll<{
    id: string;
    drawing_set_id: string;
    revision_no: number;
    status: string;
    note: string | null;
  }>((from, to) =>
    supabase
      .from("drawing_revisions")
      .select("id, drawing_set_id, revision_no, status, note")
      .eq("unit_id", unitId)
      .order("drawing_set_id")
      .order("revision_no", { ascending: false })
      .order("id")
      .range(from, to),
  );
  if (revisions.length === 0) return [];

  const setIds = [...new Set(revisions.map((revision) => revision.drawing_set_id))];
  const sets = await fetchAll<{
    id: string;
    code: string | null;
    name: string;
    sort_order: number;
  }>((from, to) =>
    supabase
      .from("drawing_sets")
      .select("id, code, name, sort_order")
      .in("id", setIds)
      .order("sort_order")
      .order("id")
      .range(from, to),
  );

  // Only the drafts and the current released rows ever have their files
  // counted — a superseded revision's sheets are history nobody is about
  // to send again.
  const countableIds = revisions
    .filter((revision) => revision.status !== "superseded")
    .map((revision) => revision.id);
  const files =
    countableIds.length > 0
      ? await fetchAll<{ drawing_revision_id: string }>((from, to) =>
          supabase
            .from("drawing_revision_files")
            .select("drawing_revision_id")
            .in("drawing_revision_id", countableIds)
            .order("id")
            .range(from, to),
        )
      : [];

  const fileCounts = new Map<string, number>();
  for (const file of files) {
    fileCounts.set(file.drawing_revision_id, (fileCounts.get(file.drawing_revision_id) ?? 0) + 1);
  }

  const bySet = new Map<
    string,
    { draft: VillaRevisionSummary | null; released: VillaRevisionSummary | null; highest: number }
  >();
  for (const revision of revisions) {
    const held = bySet.get(revision.drawing_set_id) ?? { draft: null, released: null, highest: -1 };
    if (revision.revision_no > held.highest) held.highest = revision.revision_no;

    const summary: VillaRevisionSummary = {
      revisionId: revision.id,
      revisionNo: revision.revision_no,
      note: revision.note,
      fileCount: fileCounts.get(revision.id) ?? 0,
    };
    if (revision.status === "draft") {
      // The partial unique index allows only one, so this never fights.
      held.draft = summary;
    } else if (revision.status === "released" && !held.released) {
      held.released = summary;
    }
    bySet.set(revision.drawing_set_id, held);
  }

  return sets.flatMap((set) => {
    const held = bySet.get(set.id);
    return [
      {
        setId: set.id,
        setCode: set.code,
        setName: set.name,
        draft: held?.draft ?? null,
        released: held?.released ?? null,
        nextRevisionNo: (held?.highest ?? -1) + 1,
      },
    ];
  });
}

export type TransmittalLineRow = {
  lineId: string;
  revisionId: string;
  setId: string;
  setCode: string | null;
  setName: string;
  revisionNo: number;
  revisionStatus: "draft" | "released" | "superseded";
  revisionNote: string | null;
  files: DrawingRevisionFileRow[];
  /**
   * The draft's work links, for the editor that now sits inline on this
   * page. Null for a released or superseded line — those are frozen, so
   * there is nothing to edit and nothing to fetch.
   */
  draftWorkItemIds: string[] | null;
  /** Every revision of this set that has gone to site, newest first. */
  revisionLog: { revisionNo: number; note: string | null; releasedAt: string | null }[];
};

export type TransmittalDetail = {
  id: string;
  number: string | null;
  status: "draft" | "issued";
  note: string | null;
  stageId: string;
  stageName: string;
  unitId: string;
  villaName: string;
  plotName: string;
  projectName: string;
  issuedAt: string | null;
  issuedByName: string | null;
  createdAt: string;
  /** In sheet order — what the screen lists and the PDF prints. */
  lines: TransmittalLineRow[];
};

/**
 * One transmittal, everything the detail screen and the PDF cover sheet
 * need. `null` when the id doesn't exist — the caller's `notFound()`,
 * and also what someone without this tool's grant gets for a draft,
 * since the widened SELECT qual (0091 §11) hides it rather than
 * refusing.
 */
export async function getTransmittalDetail(
  transmittalId: string,
): Promise<TransmittalDetail | null> {
  await requireTool(GRANT);
  const supabase = await createClient();

  const { data: transmittal, error } = await supabase
    .from("transmittals")
    .select("id, unit_id, design_stage_id, number, note, status, issued_at, issued_by, created_at")
    .eq("id", transmittalId)
    .maybeSingle();
  if (error) fail("the transmittal", error);
  if (!transmittal) return null;

  const [unit, stage, issuer, lines] = await Promise.all([
    supabase
      .from("units")
      .select("name, plot_id, project_id")
      .eq("id", transmittal.unit_id)
      .maybeSingle(),
    supabase
      .from("design_stages")
      .select("name")
      .eq("id", transmittal.design_stage_id)
      .maybeSingle(),
    transmittal.issued_by
      ? supabase.from("profiles").select("full_name").eq("id", transmittal.issued_by).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    fetchAll<{ id: string; drawing_revision_id: string; sort_order: number }>((from, to) =>
      supabase
        .from("transmittal_lines")
        .select("id, drawing_revision_id, sort_order")
        .eq("transmittal_id", transmittalId)
        .order("sort_order")
        .order("id")
        .range(from, to),
    ),
  ]);
  if (unit.error) fail("the transmittal", unit.error);
  if (stage.error) fail("the transmittal", stage.error);
  if (issuer.error) fail("the transmittal", issuer.error);

  const [plot, project] = await Promise.all([
    unit.data
      ? supabase.from("plots").select("name").eq("id", unit.data.plot_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    unit.data
      ? supabase.from("projects").select("name").eq("id", unit.data.project_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (plot.error) fail("the transmittal", plot.error);
  if (project.error) fail("the transmittal", project.error);

  const revisionIds = lines.map((line) => line.drawing_revision_id);
  const [revisions, files] = await Promise.all([
    revisionIds.length > 0
      ? fetchAll<{
          id: string;
          drawing_set_id: string;
          revision_no: number;
          status: string;
          note: string | null;
        }>((from, to) =>
          supabase
            .from("drawing_revisions")
            .select("id, drawing_set_id, revision_no, status, note")
            .in("id", revisionIds)
            .order("id")
            .range(from, to),
        )
      : Promise.resolve([]),
    revisionIds.length > 0
      ? fetchAll<{
          id: string;
          drawing_revision_id: string;
          file_name: string;
          content_type: string;
          sort_order: number;
        }>((from, to) =>
          supabase
            .from("drawing_revision_files")
            .select("id, drawing_revision_id, file_name, content_type, sort_order")
            .in("drawing_revision_id", revisionIds)
            .order("sort_order")
            .order("id")
            .range(from, to),
        )
      : Promise.resolve([]),
  ]);

  // The draft lines carry the editor that now lives on this page, so
  // their work links are read here. A released line has none to read.
  const draftRevisionIds = revisions
    .filter((revision) => revision.status === "draft")
    .map((revision) => revision.id);
  const works =
    draftRevisionIds.length > 0
      ? await fetchAll<{ drawing_revision_id: string; work_item_id: string }>((from, to) =>
          supabase
            .from("drawing_revision_works")
            .select("drawing_revision_id, work_item_id")
            .in("drawing_revision_id", draftRevisionIds)
            .order("id")
            .range(from, to),
        )
      : [];

  const setIds = [...new Set(revisions.map((revision) => revision.drawing_set_id))];
  const sets =
    setIds.length > 0
      ? await fetchAll<{ id: string; code: string | null; name: string }>((from, to) =>
          supabase
            .from("drawing_sets")
            .select("id, code, name")
            .in("id", setIds)
            .order("id")
            .range(from, to),
        )
      : [];

  // The revision log per set: every revision of this villa's sets that
  // has gone to site, for the "Revision log" button beside a released
  // line — long change text folded behind a click (founder, 2026-08-22).
  const logRows =
    setIds.length > 0
      ? await fetchAll<{
          drawing_set_id: string;
          revision_no: number;
          note: string | null;
          released_at: string | null;
        }>((from, to) =>
          supabase
            .from("drawing_revisions")
            .select("drawing_set_id, revision_no, note, released_at")
            .eq("unit_id", transmittal.unit_id)
            .in("drawing_set_id", setIds)
            .neq("status", "draft")
            .order("revision_no", { ascending: false })
            .order("id")
            .range(from, to),
        )
      : [];
  const logBySet = new Map<string, TransmittalLineRow["revisionLog"]>();
  for (const row of logRows) {
    const list = logBySet.get(row.drawing_set_id) ?? [];
    list.push({ revisionNo: row.revision_no, note: row.note, releasedAt: row.released_at });
    logBySet.set(row.drawing_set_id, list);
  }

  const setsById = new Map(sets.map((set) => [set.id, set]));
  const revisionsById = new Map(revisions.map((revision) => [revision.id, revision]));
  const filesByRevision = new Map<string, DrawingRevisionFileRow[]>();
  for (const file of files) {
    const list = filesByRevision.get(file.drawing_revision_id) ?? [];
    list.push({
      id: file.id,
      fileName: file.file_name,
      contentType: file.content_type,
      sortOrder: file.sort_order,
    });
    filesByRevision.set(file.drawing_revision_id, list);
  }

  const worksByRevision = new Map<string, string[]>();
  for (const work of works) {
    const list = worksByRevision.get(work.drawing_revision_id) ?? [];
    list.push(work.work_item_id);
    worksByRevision.set(work.drawing_revision_id, list);
  }

  return {
    id: transmittal.id,
    number: transmittal.number,
    status: transmittal.status as TransmittalDetail["status"],
    note: transmittal.note,
    stageId: transmittal.design_stage_id,
    stageName: stage.data?.name ?? "—",
    unitId: transmittal.unit_id,
    villaName: unit.data?.name ?? "—",
    plotName: plot.data?.name ?? "—",
    projectName: project.data?.name ?? "—",
    issuedAt: transmittal.issued_at,
    issuedByName: issuer.data?.full_name ?? null,
    createdAt: transmittal.created_at,
    lines: lines.map((line) => {
      const revision = revisionsById.get(line.drawing_revision_id);
      const set = revision ? setsById.get(revision.drawing_set_id) : undefined;
      const status = (revision?.status ?? "draft") as TransmittalLineRow["revisionStatus"];
      return {
        lineId: line.id,
        revisionId: line.drawing_revision_id,
        setId: revision?.drawing_set_id ?? "",
        setCode: set?.code ?? null,
        setName: set?.name ?? "Unknown drawing set",
        revisionNo: revision?.revision_no ?? 0,
        revisionStatus: status,
        revisionNote: revision?.note ?? null,
        files: filesByRevision.get(line.drawing_revision_id) ?? [],
        draftWorkItemIds:
          status === "draft" ? (worksByRevision.get(line.drawing_revision_id) ?? []) : null,
        revisionLog: revision ? (logBySet.get(revision.drawing_set_id) ?? []) : [],
      };
    }),
  };
}
