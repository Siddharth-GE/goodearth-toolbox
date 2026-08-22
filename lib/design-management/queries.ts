import "server-only";

import { requireTool } from "@/lib/auth/access";
import { fetchAll } from "@/lib/supabase/fetch-all";
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

function fail(context: string, error: { message: string }): never {
  console.error(`design-management: ${context} failed:`, error);
  throw new Error(`Could not load ${context}.`);
}

// ---------------------------------------------------------------------
// Welcome
// ---------------------------------------------------------------------

export async function getWelcomeCounts(): Promise<{
  activeSets: number;
  villasWithReleasedDrawings: number;
  draftRevisions: number;
  transmittalsIssued: number;
}> {
  await requireTool(GRANT);
  const supabase = await createClient();

  const [sets, releasedRevisionUnits, draftRevisions, issuedTransmittals] = await Promise.all([
    supabase
      .from("drawing_sets")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
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
      .from("drawing_revisions")
      .select("id", { count: "exact", head: true })
      .eq("status", "draft"),
    supabase
      .from("transmittals")
      .select("id", { count: "exact", head: true })
      .eq("status", "issued"),
  ]);

  return {
    activeSets: sets.count ?? 0,
    villasWithReleasedDrawings: new Set(releasedRevisionUnits.map((row) => row.unit_id)).size,
    draftRevisions: draftRevisions.count ?? 0,
    transmittalsIssued: issuedTransmittals.count ?? 0,
  };
}

// ---------------------------------------------------------------------
// Drawing sets (the drawing master)
// ---------------------------------------------------------------------

export type DrawingSetRow = {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  /** Count of work_items this set links by default (drawing_set_works). */
  workCount: number;
};

export async function listDrawingSets(): Promise<DrawingSetRow[]> {
  await requireTool(GRANT);
  const supabase = await createClient();

  const [sets, links] = await Promise.all([
    fetchAll<{
      id: string;
      code: string | null;
      name: string;
      description: string | null;
      is_active: boolean;
      sort_order: number;
    }>((from, to) =>
      supabase
        .from("drawing_sets")
        .select("id, code, name, description, is_active, sort_order")
        .order("sort_order")
        .order("name")
        .order("id")
        .range(from, to),
    ),
    fetchAll<{ drawing_set_id: string }>((from, to) =>
      supabase.from("drawing_set_works").select("drawing_set_id").order("id").range(from, to),
    ),
  ]);

  const workCountBySet = new Map<string, number>();
  for (const link of links) {
    workCountBySet.set(link.drawing_set_id, (workCountBySet.get(link.drawing_set_id) ?? 0) + 1);
  }

  return sets.map((set) => ({
    id: set.id,
    code: set.code,
    name: set.name,
    description: set.description,
    isActive: set.is_active,
    sortOrder: set.sort_order,
    workCount: workCountBySet.get(set.id) ?? 0,
  }));
}

export type DrawingSetDetail = {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  isActive: boolean;
  /** work_item ids this set links by default — the checkbox tree's state. */
  workItemIds: string[];
};

export async function getDrawingSetDetail(id: string): Promise<DrawingSetDetail | null> {
  await requireTool(GRANT);
  const supabase = await createClient();

  const { data: set, error } = await supabase
    .from("drawing_sets")
    .select("id, code, name, description, is_active")
    .eq("id", id)
    .maybeSingle();
  if (error) fail("the drawing set", error);
  if (!set) return null;

  const links = await fetchAll<{ work_item_id: string }>((from, to) =>
    supabase
      .from("drawing_set_works")
      .select("work_item_id")
      .eq("drawing_set_id", id)
      .order("id")
      .range(from, to),
  );

  return {
    id: set.id,
    code: set.code,
    name: set.name,
    description: set.description,
    isActive: set.is_active,
    workItemIds: links.map((link) => link.work_item_id),
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
  plotId: string;
  villaName: string;
  plotName: string;
  projectName: string;
  /** Distinct drawing sets with a released revision on this villa. */
  setsReleased: number;
  /** Draft revisions open across every set on this villa. */
  draftsOpen: number;
};

/**
 * Every villa, grouped by project on screen — the Supervisors picker's
 * shape (`lib/supervisors/queries.ts:listVillas`), anchored on `unit_id`
 * rather than `plot_id` because this tool's own tables key off units. The
 * per-villa summary reads the whole (small) `drawing_revisions` set once
 * via `fetchAll` and tallies it in JS rather than one query per villa.
 */
export async function listVillas(): Promise<DesignVillaRow[]> {
  await requireTool(GRANT);
  const supabase = await createClient();

  const [units, plots, projects, revisions] = await Promise.all([
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
    fetchAll<{ unit_id: string; drawing_set_id: string; status: string }>((from, to) =>
      supabase
        .from("drawing_revisions")
        .select("unit_id, drawing_set_id, status")
        .order("unit_id")
        .range(from, to),
    ),
  ]);

  const plotNames = new Map(plots.map((plot) => [plot.id, plot.name]));
  const projectNames = new Map(projects.map((project) => [project.id, project.name]));

  const releasedSetsByUnit = new Map<string, Set<string>>();
  const draftsByUnit = new Map<string, number>();
  for (const revision of revisions) {
    if (revision.status === "released") {
      const set = releasedSetsByUnit.get(revision.unit_id) ?? new Set<string>();
      set.add(revision.drawing_set_id);
      releasedSetsByUnit.set(revision.unit_id, set);
    } else if (revision.status === "draft") {
      draftsByUnit.set(revision.unit_id, (draftsByUnit.get(revision.unit_id) ?? 0) + 1);
    }
  }

  return units.map((unit) => ({
    unitId: unit.id,
    plotId: unit.plot_id,
    villaName: unit.name,
    plotName: plotNames.get(unit.plot_id) ?? "—",
    projectName: projectNames.get(unit.project_id) ?? "—",
    setsReleased: releasedSetsByUnit.get(unit.id)?.size ?? 0,
    draftsOpen: draftsByUnit.get(unit.id) ?? 0,
  }));
}

export type DesignStageBoardRow = {
  stageId: string;
  stageName: string;
  isActive: boolean;
  /** Issued transmittals for this villa at this stage — never a draft. */
  transmittalCount: number;
  lastIssuedAt: string | null;
};

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

export type DrawingSetWithRevisions = {
  setId: string;
  setCode: string | null;
  setName: string;
  /** Newest first. */
  revisions: DrawingRevisionRow[];
};

export type VillaDesignDetail = {
  unitId: string;
  plotId: string;
  villaName: string;
  plotName: string;
  projectName: string;
  stageBoard: DesignStageBoardRow[];
  /** Only sets that have had something released on this villa. */
  setsWithRevisions: DrawingSetWithRevisions[];
};

/**
 * The villa design page's one read: header, the stage board (derived
 * fresh from issued transmittals, never stored), and the RELEASED
 * revision history of each drawing set. `null` when the unit id doesn't
 * exist — the caller's `notFound()`.
 *
 * Drafts are deliberately absent (founder, 2026-08-22, on the staging
 * vet): a draft lives on the transmittal that will send it, and the
 * villa page is the record of what has actually gone out. Showing a
 * half-finished drawing beside the issued ones is what made the two
 * screens read as the same thing.
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

  const [plot, project, stages, sets, revisions, transmittals] = await Promise.all([
    supabase.from("plots").select("name").eq("id", unit.plot_id).maybeSingle(),
    supabase.from("projects").select("name").eq("id", unit.project_id).maybeSingle(),
    fetchAll<{ id: string; name: string; sort_order: number; is_active: boolean }>((from, to) =>
      supabase
        .from("design_stages")
        .select("id, name, sort_order, is_active")
        .order("sort_order")
        .order("id")
        .range(from, to),
    ),
    fetchAll<{
      id: string;
      code: string | null;
      name: string;
      sort_order: number;
      is_active: boolean;
    }>((from, to) =>
      supabase
        .from("drawing_sets")
        .select("id, code, name, sort_order, is_active")
        .order("sort_order")
        .order("id")
        .range(from, to),
    ),
    fetchAll<{
      id: string;
      drawing_set_id: string;
      revision_no: number;
      status: string;
      note: string | null;
      released_at: string | null;
    }>((from, to) =>
      supabase
        .from("drawing_revisions")
        .select("id, drawing_set_id, revision_no, status, note, released_at")
        .eq("unit_id", unitId)
        // Released and superseded only. A draft belongs to the
        // transmittal that is assembling it, not to this page.
        .neq("status", "draft")
        .order("drawing_set_id")
        .order("revision_no", { ascending: false })
        .range(from, to),
    ),
    // Issued only — the stage board counts what site was told, not what's
    // still being assembled.
    fetchAll<{ id: string; design_stage_id: string; issued_at: string | null }>((from, to) =>
      supabase
        .from("transmittals")
        .select("id, design_stage_id, issued_at")
        .eq("unit_id", unitId)
        .eq("status", "issued")
        .order("id")
        .range(from, to),
    ),
  ]);
  if (plot.error) fail("the villa", plot.error);
  if (project.error) fail("the villa", project.error);

  const revisionIds = revisions.map((revision) => revision.id);

  // Work links are not fetched here: they are frozen on release and this
  // page never offers to edit them. Editing happens on the draft, which
  // lives on its transmittal.
  const files =
    revisionIds.length > 0
      ? await fetchAll<{
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
      : [];

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

  const transmittalsByStage = new Map<string, { count: number; lastIssuedAt: string | null }>();
  for (const transmittal of transmittals) {
    const current = transmittalsByStage.get(transmittal.design_stage_id) ?? {
      count: 0,
      lastIssuedAt: null,
    };
    current.count += 1;
    if (
      transmittal.issued_at &&
      (!current.lastIssuedAt || transmittal.issued_at > current.lastIssuedAt)
    ) {
      current.lastIssuedAt = transmittal.issued_at;
    }
    transmittalsByStage.set(transmittal.design_stage_id, current);
  }

  // Retired stages only appear if they carry history — an active stage
  // always shows, even at zero transmittals.
  const stageBoard: DesignStageBoardRow[] = stages
    .filter((stage) => stage.is_active || transmittalsByStage.has(stage.id))
    .map((stage) => ({
      stageId: stage.id,
      stageName: stage.name,
      isActive: stage.is_active,
      transmittalCount: transmittalsByStage.get(stage.id)?.count ?? 0,
      lastIssuedAt: transmittalsByStage.get(stage.id)?.lastIssuedAt ?? null,
    }));

  const revisionsBySet = new Map<string, DrawingRevisionRow[]>();
  for (const revision of revisions) {
    const list = revisionsBySet.get(revision.drawing_set_id) ?? [];
    list.push({
      id: revision.id,
      revisionNo: revision.revision_no,
      status: revision.status as DrawingRevisionRow["status"],
      note: revision.note,
      releasedAt: revision.released_at,
      files: filesByRevision.get(revision.id) ?? [],
      workItemIds: null,
    });
    revisionsBySet.set(revision.drawing_set_id, list);
  }

  const setsWithRevisions: DrawingSetWithRevisions[] = sets
    .filter((set) => revisionsBySet.has(set.id))
    .map((set) => ({
      setId: set.id,
      setCode: set.code,
      setName: set.name,
      revisions: revisionsBySet.get(set.id) ?? [],
    }));

  return {
    unitId: unit.id,
    plotId: unit.plot_id,
    villaName: unit.name,
    plotName: plot.data?.name ?? "—",
    projectName: project.data?.name ?? "—",
    stageBoard,
    setsWithRevisions,
  };
}

// ---------------------------------------------------------------------
// Transmittals
// ---------------------------------------------------------------------

/**
 * The list shows this many and says how many there are in total — the
 * Supervisors labour-log convention (`LOGS_SHOWN`). Nobody scrolls a
 * hundred rows back; the per-villa filter is how you narrow it.
 */
const TRANSMITTALS_SHOWN = 100;

export type TransmittalListRow = {
  id: string;
  /** Null while it is a draft — the number is minted on Issue (0091 §7). */
  number: string | null;
  status: "draft" | "issued";
  unitId: string;
  villaName: string;
  plotName: string;
  projectName: string;
  stageName: string;
  lineCount: number;
  issuedAt: string | null;
  issuedByName: string | null;
  createdAt: string;
};

/**
 * Every transmittal, drafts and issued together, newest first.
 *
 * Ordered by `created_at` rather than the issue date: a draft has no
 * issue date at all, and PostgREST cannot order on a coalesce. In
 * practice a transmittal is issued within minutes of being raised, so
 * the two orders agree — and an unfinished draft belongs at the top
 * anyway, since it is the one still asking for attention.
 *
 * `unitId` narrows it to one villa — the villa design page's link.
 */
export async function listTransmittals(
  unitId?: string,
): Promise<{ rows: TransmittalListRow[]; total: number }> {
  await requireTool(GRANT);
  const supabase = await createClient();

  let query = supabase
    .from("transmittals")
    .select("id, unit_id, design_stage_id, number, status, issued_at, issued_by, created_at", {
      count: "exact",
    })
    .order("created_at", { ascending: false })
    .order("id");
  if (unitId) query = query.eq("unit_id", unitId);

  const page = await query.range(0, TRANSMITTALS_SHOWN - 1);
  if (page.error) fail("the transmittals", page.error);

  const transmittals = page.data ?? [];
  const total = page.count ?? transmittals.length;
  if (transmittals.length === 0) return { rows: [], total };

  const unitIds = [...new Set(transmittals.map((row) => row.unit_id))];
  const stageIds = [...new Set(transmittals.map((row) => row.design_stage_id))];
  const issuerIds = [
    ...new Set(transmittals.map((row) => row.issued_by).filter((id): id is string => id !== null)),
  ];
  const transmittalIds = transmittals.map((row) => row.id);

  // Names merge through Maps, never an embed: `units` has two FK paths
  // to `plots` (BUGCATCHER #2) and `transmittals` carries two FKs to
  // `profiles` (created_by and issued_by).
  const [units, stages, issuers, lines] = await Promise.all([
    fetchAll<{ id: string; name: string; plot_id: string; project_id: string }>((from, to) =>
      supabase
        .from("units")
        .select("id, name, plot_id, project_id")
        .in("id", unitIds)
        .order("id")
        .range(from, to),
    ),
    fetchAll<{ id: string; name: string }>((from, to) =>
      supabase
        .from("design_stages")
        .select("id, name")
        .in("id", stageIds)
        .order("id")
        .range(from, to),
    ),
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
    fetchAll<{ transmittal_id: string }>((from, to) =>
      supabase
        .from("transmittal_lines")
        .select("transmittal_id")
        .in("transmittal_id", transmittalIds)
        .order("id")
        .range(from, to),
    ),
  ]);

  const plotIds = [...new Set(units.map((unit) => unit.plot_id))];
  const projectIds = [...new Set(units.map((unit) => unit.project_id))];
  const [plots, projects] = await Promise.all([
    fetchAll<{ id: string; name: string }>((from, to) =>
      supabase.from("plots").select("id, name").in("id", plotIds).order("id").range(from, to),
    ),
    fetchAll<{ id: string; name: string }>((from, to) =>
      supabase.from("projects").select("id, name").in("id", projectIds).order("id").range(from, to),
    ),
  ]);

  const plotNames = new Map(plots.map((plot) => [plot.id, plot.name]));
  const projectNames = new Map(projects.map((project) => [project.id, project.name]));
  const unitsById = new Map(units.map((unit) => [unit.id, unit]));
  const stageNames = new Map(stages.map((stage) => [stage.id, stage.name]));
  const issuerNames = new Map(issuers.map((issuer) => [issuer.id, issuer.full_name]));

  const lineCounts = new Map<string, number>();
  for (const line of lines) {
    lineCounts.set(line.transmittal_id, (lineCounts.get(line.transmittal_id) ?? 0) + 1);
  }

  return {
    rows: transmittals.map((row) => {
      const unit = unitsById.get(row.unit_id);
      return {
        id: row.id,
        number: row.number,
        status: row.status as TransmittalListRow["status"],
        unitId: row.unit_id,
        villaName: unit?.name ?? "—",
        plotName: unit ? (plotNames.get(unit.plot_id) ?? "—") : "—",
        projectName: unit ? (projectNames.get(unit.project_id) ?? "—") : "—",
        stageName: stageNames.get(row.design_stage_id) ?? "—",
        lineCount: lineCounts.get(row.id) ?? 0,
        issuedAt: row.issued_at,
        issuedByName: row.issued_by ? (issuerNames.get(row.issued_by) ?? null) : null,
        createdAt: row.created_at,
      };
    }),
    total,
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
 * Every drawing set, and where this villa stands on each: the open
 * draft, the current released revision, and the number the next
 * revision would take.
 *
 * This is what the transmittal's "Add drawings" board is built from
 * (founder, 2026-08-22, redirecting the flow on the staging vet: "under
 * new transmittal you either upload a new set of drawings or you revise
 * a set that can be seen there"). A set with nothing on this villa still
 * appears — that is the "upload the first drawings" case, and it could
 * never be offered by a list of what already exists.
 *
 * A retired set still appears if it carries history here, so a villa
 * mid-flight is never stranded; a retired set with nothing here does
 * not, because starting a drawing on a set the master has retired is
 * the one thing retiring it was meant to stop.
 */
export async function listVillaDrawingSetStates(unitId: string): Promise<VillaDrawingSetState[]> {
  await requireTool(GRANT);
  const supabase = await createClient();

  const [sets, revisions] = await Promise.all([
    fetchAll<{
      id: string;
      code: string | null;
      name: string;
      sort_order: number;
      is_active: boolean;
    }>((from, to) =>
      supabase
        .from("drawing_sets")
        .select("id, code, name, sort_order, is_active")
        .order("sort_order")
        .order("id")
        .range(from, to),
    ),
    fetchAll<{
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
    ),
  ]);

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
    if (!set.is_active && !held) return [];
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
      };
    }),
  };
}
