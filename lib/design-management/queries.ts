import "server-only";

import { requireTool } from "@/lib/auth/access";
import { readFolderSheets, type FolderSheet } from "@/lib/drawings/folder-sheets";
import { sheetNamingContext } from "@/lib/drawings/sheet-context";
import { sheetFileName } from "@/lib/drawings/sheet-name";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { readFailed } from "@/lib/supabase/read-failed";
import { createClient } from "@/lib/supabase/server";

/**
 * Every function opens with requireTool. Outside reads (STATUS.md contract row): the shared units/plots/projects/profiles masters and the works vocabulary via lib/masters/works.ts. No money here.
 * `units` has two FK paths to `plots` (0029) and drawing_revisions/transmittals carry several FKs to `profiles`, so villa and person names merge through a Map, not an embed (BUGCATCHER #2).
 */

const GRANT = "/design-management";

const fail = (context: string, error: { message: string }): never =>
  readFailed("design-management", context, error);

export type DesignStageRow = {
  id: string;
  name: string;
  /** The short code in sheet file names (0099); null until one is set. */
  code: string | null;
  sortOrder: number;
  isActive: boolean;
  onBoard: boolean;
};

export async function listDesignStages(): Promise<DesignStageRow[]> {
  await requireTool(GRANT);
  const supabase = await createClient();

  const data = await fetchAll<{
    id: string;
    name: string;
    code: string | null;
    sort_order: number;
    is_active: boolean;
    on_board: boolean;
  }>((from, to) =>
    supabase
      .from("design_stages")
      .select("id, name, code, sort_order, is_active, on_board")
      .order("sort_order")
      .order("name")
      .order("id")
      .range(from, to),
  );

  return data.map((stage) => ({
    id: stage.id,
    name: stage.name,
    code: stage.code,
    sortOrder: stage.sort_order,
    isActive: stage.is_active,
    onBoard: stage.on_board,
  }));
}

export type DrawingRevisionFileRow = {
  id: string;
  fileName: string;
  /** GFP — typed at upload; null only for sheets from before 0099. */
  sheetCode: string | null;
  /** The name it downloads under: SAA-Saarang-Villa12-WD-TB0003-GFP.pdf. */
  displayName: string;
  contentType: string;
  sortOrder: number;
};

export type DrawingRevisionRow = {
  id: string;
  revisionNo: number;
  status: "draft" | "released" | "superseded";
  note: string | null;
  releasedAt: string | null;
  /** Sheets uploaded before 0124 — none on a revision started since. */
  files: DrawingRevisionFileRow[];
  drawingsUrl: string | null;
  folderSheets: FolderSheet[];
  /** Null for released/superseded revisions (frozen, never edited); set only for the one draft per set. */
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
  setName: string | null;
  revisionNo: number | null;
  issuedAt: string | null;
  issuedByName: string | null;
  createdAt: string;
};

export type VillaDesignDetail = {
  unitId: string;
  villaName: string;
  plotName: string;
  projectName: string;
  transmittals: VillaTransmittalRow[];
  /** Stages that appear on this villa's transmittals, in master order: the filter chips offer no stage that would show an empty list. */
  stages: { id: string; name: string }[];
};

/**
 * The villa's home page. Read complete, not capped, so the filter chips can say honestly which stages appear. `null` for an unknown unit id (the caller's notFound()).
 * Ordered by created_at: a draft has no issue date and PostgREST cannot order on a coalesce; the two orders agree in practice.
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

  // Names merge through Maps: transmittals has two FKs to profiles (PGRST201 at runtime, BUGCATCHER #2).
  const [lines, issuers] = await Promise.all([
    transmittalIds.length > 0
      ? fetchAll<{ transmittal_id: string; drawing_revision_id: string }>((from, to) =>
          supabase
            .from("transmittal_lines")
            .select("transmittal_id, drawing_revision_id")
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

  const lineRevisionIds = [...new Set(lines.map((line) => line.drawing_revision_id))];
  const lineRevisions =
    lineRevisionIds.length > 0
      ? await fetchAll<{ id: string; drawing_set_id: string; revision_no: number }>((from, to) =>
          supabase
            .from("drawing_revisions")
            .select("id, drawing_set_id, revision_no")
            .in("id", lineRevisionIds)
            .order("id")
            .range(from, to),
        )
      : [];
  const lineSetIds = [...new Set(lineRevisions.map((revision) => revision.drawing_set_id))];
  const lineSets =
    lineSetIds.length > 0
      ? await fetchAll<{ id: string; name: string }>((from, to) =>
          supabase
            .from("drawing_sets")
            .select("id, name")
            .in("id", lineSetIds)
            .order("id")
            .range(from, to),
        )
      : [];
  const lineRevisionsById = new Map(lineRevisions.map((revision) => [revision.id, revision]));
  const lineSetNames = new Map(lineSets.map((set) => [set.id, set.name]));
  const carried = new Map<string, { setName: string | null; revisionNo: number }>();
  for (const line of lines) {
    const revision = lineRevisionsById.get(line.drawing_revision_id);
    if (!revision || carried.has(line.transmittal_id)) continue;
    carried.set(line.transmittal_id, {
      setName: lineSetNames.get(revision.drawing_set_id) ?? null,
      revisionNo: revision.revision_no,
    });
  }

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
    setName: carried.get(row.id)?.setName ?? null,
    revisionNo: carried.get(row.id)?.revisionNo ?? null,
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
  /** For a draft, the transmittal it sits on (null for an orphan); for a released revision, the earliest issued one carrying it. */
  transmittalId: string | null;
};

export type VillaDrawingSetState = {
  setId: string;
  setCode: string | null;
  setName: string;
  stageId: string | null;
  draft: VillaRevisionSummary | null;
  released: VillaRevisionSummary | null;
  /** What Revise would number the next draft: max + 1 across every status (superseded count), or 0. */
  nextRevisionNo: number;
};

/**
 * THIS VILLA'S drawing sets and where it stands on each. A set is this villa's only if a revision of it lives on this unit (no column; drawing_sets stays one global table),
 * so two villas that both make "Working Drawings" are two rows, on purpose. A retired set still appears if it carries history here.
 */
export async function listVillaDrawingSetStates(unitId: string): Promise<VillaDrawingSetState[]> {
  await requireTool(GRANT);
  const supabase = await createClient();

  // The villa's revisions come first and the sets follow, so the scoping is true rather than filtered.
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
    design_stage_id: string | null;
  }>((from, to) =>
    supabase
      .from("drawing_sets")
      .select("id, code, name, sort_order, design_stage_id")
      .in("id", setIds)
      .order("sort_order")
      .order("id")
      .range(from, to),
  );

  // Only drafts and current released rows have files counted; a superseded revision's sheets are history.
  const countableIds = revisions
    .filter((revision) => revision.status !== "superseded")
    .map((revision) => revision.id);
  const [files, folderSheets] =
    countableIds.length > 0
      ? await Promise.all([
          fetchAll<{ drawing_revision_id: string }>((from, to) =>
            supabase
              .from("drawing_revision_files")
              .select("drawing_revision_id")
              .in("drawing_revision_id", countableIds)
              .order("id")
              .range(from, to),
          ),
          fetchAll<{ drawing_revision_id: string }>((from, to) =>
            supabase
              .from("drawing_revision_folder_sheets")
              .select("drawing_revision_id")
              .in("drawing_revision_id", countableIds)
              .order("id")
              .range(from, to),
          ),
        ])
      : [[], []];

  const fileCounts = new Map<string, number>();
  for (const file of [...files, ...folderSheets]) {
    fileCounts.set(file.drawing_revision_id, (fileCounts.get(file.drawing_revision_id) ?? 0) + 1);
  }

  // Which transmittal to open for each current revision: two flat reads merged through Maps (BUGCATCHER #2).
  const lines =
    countableIds.length > 0
      ? await fetchAll<{ drawing_revision_id: string; transmittal_id: string }>((from, to) =>
          supabase
            .from("transmittal_lines")
            .select("drawing_revision_id, transmittal_id")
            .in("drawing_revision_id", countableIds)
            .order("id")
            .range(from, to),
        )
      : [];
  const lineTransmittalIds = [...new Set(lines.map((line) => line.transmittal_id))];
  const lineTransmittals =
    lineTransmittalIds.length > 0
      ? await fetchAll<{ id: string; status: string; issued_at: string | null }>((from, to) =>
          supabase
            .from("transmittals")
            .select("id, status, issued_at")
            .in("id", lineTransmittalIds)
            .order("id")
            .range(from, to),
        )
      : [];
  const transmittalsById = new Map(lineTransmittals.map((row) => [row.id, row]));

  // A draft opens on its draft transmittal; a released revision on the first issued one that carried it.
  const draftHome = new Map<string, string>();
  const releasedHome = new Map<string, { id: string; issuedAt: string }>();
  for (const line of lines) {
    const transmittal = transmittalsById.get(line.transmittal_id);
    if (!transmittal) continue;
    if (transmittal.status === "draft") {
      if (!draftHome.has(line.drawing_revision_id)) {
        draftHome.set(line.drawing_revision_id, transmittal.id);
      }
    } else if (transmittal.issued_at) {
      const held = releasedHome.get(line.drawing_revision_id);
      if (!held || transmittal.issued_at < held.issuedAt) {
        releasedHome.set(line.drawing_revision_id, {
          id: transmittal.id,
          issuedAt: transmittal.issued_at,
        });
      }
    }
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
      transmittalId:
        revision.status === "draft"
          ? (draftHome.get(revision.id) ?? null)
          : (releasedHome.get(revision.id)?.id ?? null),
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
        stageId: set.design_stage_id,
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
  drawingsUrl: string | null;
  /** Its folder's sheets — as last read on a draft, as kept on Issue once issued. */
  folderSheets: FolderSheet[];
  /** Null for a released or superseded line: frozen, nothing to edit. */
  draftWorkItemIds: string[] | null;
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
  lines: TransmittalLineRow[];
};

/** `null` for an unknown id, and for a draft when the caller lacks this tool's grant: the widened SELECT qual (0091) hides it. */
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
          drawings_url: string | null;
        }>((from, to) =>
          supabase
            .from("drawing_revisions")
            .select("id, drawing_set_id, revision_no, status, note, drawings_url")
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
          sheet_code: string | null;
        }>((from, to) =>
          supabase
            .from("drawing_revision_files")
            .select("id, drawing_revision_id, file_name, content_type, sort_order, sheet_code")
            .in("drawing_revision_id", revisionIds)
            .order("sort_order")
            .order("id")
            .range(from, to),
        )
      : Promise.resolve([]),
  ]);

  // Draft lines carry the inline editor, so their work links are read; released lines have none.
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

  // Every revision of this villa's sets that has gone to site, for the Revision log button.
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

  // The same naming path as the download (lib/drawings/sheet-context.ts),
  // so the name on this screen is the name the file saves under.
  const [naming, folderSheets] = await Promise.all([
    sheetNamingContext(supabase, revisionIds),
    readFolderSheets(supabase, revisionIds),
  ]);

  const setsById = new Map(sets.map((set) => [set.id, set]));
  const revisionsById = new Map(revisions.map((revision) => [revision.id, revision]));
  const filesByRevision = new Map<string, DrawingRevisionFileRow[]>();
  for (const file of files) {
    const list = filesByRevision.get(file.drawing_revision_id) ?? [];
    const context = naming.get(file.drawing_revision_id);
    list.push({
      id: file.id,
      fileName: file.file_name,
      sheetCode: file.sheet_code,
      displayName: context
        ? sheetFileName({
            ...context,
            sheetCode: file.sheet_code,
            originalFileName: file.file_name,
            contentType: file.content_type,
          })
        : file.file_name,
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
        drawingsUrl: revision?.drawings_url ?? null,
        folderSheets: folderSheets.get(line.drawing_revision_id) ?? [],
        draftWorkItemIds:
          status === "draft" ? (worksByRevision.get(line.drawing_revision_id) ?? []) : null,
        revisionLog: revision ? (logBySet.get(revision.drawing_set_id) ?? []) : [],
      };
    }),
  };
}
