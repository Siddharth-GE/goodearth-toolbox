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
  /** Only sets that carry at least one revision on this villa. */
  setsWithRevisions: DrawingSetWithRevisions[];
  /** Active sets with no revision here yet — the "Add a drawing" picker. */
  availableSets: { id: string; code: string | null; name: string }[];
};

/**
 * The villa design page's one read: header, the stage board (derived
 * fresh from issued transmittals, never stored), and every drawing set's
 * revision history. `null` when the unit id doesn't exist — the caller's
 * `notFound()`.
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
  const draftRevisionIds = revisions
    .filter((revision) => revision.status === "draft")
    .map((revision) => revision.id);

  const [files, works] = await Promise.all([
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
    draftRevisionIds.length > 0
      ? fetchAll<{ drawing_revision_id: string; work_item_id: string }>((from, to) =>
          supabase
            .from("drawing_revision_works")
            .select("drawing_revision_id, work_item_id")
            .in("drawing_revision_id", draftRevisionIds)
            .order("id")
            .range(from, to),
        )
      : Promise.resolve([]),
  ]);

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
      workItemIds: revision.status === "draft" ? (worksByRevision.get(revision.id) ?? []) : null,
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

  const availableSets = sets
    .filter((set) => set.is_active && !revisionsBySet.has(set.id))
    .map((set) => ({ id: set.id, code: set.code, name: set.name }));

  return {
    unitId: unit.id,
    plotId: unit.plot_id,
    villaName: unit.name,
    plotName: plot.data?.name ?? "—",
    projectName: project.data?.name ?? "—",
    stageBoard,
    setsWithRevisions,
    availableSets,
  };
}
