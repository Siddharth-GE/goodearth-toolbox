import "server-only";

import { fetchAll } from "@/lib/supabase/fetch-all";
import type { createClient } from "@/lib/supabase/server";

import type { SheetNameParts } from "./sheet-name";

/**
 * What a sheet's download name needs that is not on the sheet row: villa, project, stage, issuing transmittal number.
 * No grant check (each caller gates itself); throws on a failed read (fetchAll). Names merge through Maps (BUGCATCHER #2).
 */
export type SheetContext = Omit<SheetNameParts, "sheetCode" | "originalFileName" | "contentType">;

type Client = Awaited<ReturnType<typeof createClient>>;

export async function sheetNamingContext(
  supabase: Client,
  revisionIds: string[],
): Promise<Map<string, SheetContext>> {
  const context = new Map<string, SheetContext>();
  const ids = [...new Set(revisionIds)];
  if (ids.length === 0) return context;

  const [revisions, lines] = await Promise.all([
    fetchAll<{ id: string; unit_id: string; drawing_set_id: string }>((from, to) =>
      supabase
        .from("drawing_revisions")
        .select("id, unit_id, drawing_set_id")
        .in("id", ids)
        .order("id")
        .range(from, to),
    ),
    fetchAll<{ drawing_revision_id: string; transmittal_id: string }>((from, to) =>
      supabase
        .from("transmittal_lines")
        .select("drawing_revision_id, transmittal_id")
        .in("drawing_revision_id", ids)
        .order("id")
        .range(from, to),
    ),
  ]);

  const unitIds = [...new Set(revisions.map((revision) => revision.unit_id))];
  const setIds = [...new Set(revisions.map((revision) => revision.drawing_set_id))];
  const transmittalIds = [...new Set(lines.map((line) => line.transmittal_id))];

  const [units, sets, transmittals] = await Promise.all([
    unitIds.length > 0
      ? fetchAll<{ id: string; name: string; project_id: string }>((from, to) =>
          supabase
            .from("units")
            .select("id, name, project_id")
            .in("id", unitIds)
            .order("id")
            .range(from, to),
        )
      : Promise.resolve([]),
    setIds.length > 0
      ? fetchAll<{ id: string; design_stage_id: string | null }>((from, to) =>
          supabase
            .from("drawing_sets")
            .select("id, design_stage_id")
            .in("id", setIds)
            .order("id")
            .range(from, to),
        )
      : Promise.resolve([]),
    transmittalIds.length > 0
      ? fetchAll<{
          id: string;
          number: string | null;
          issued_at: string | null;
          design_stage_id: string;
        }>((from, to) =>
          supabase
            .from("transmittals")
            .select("id, number, issued_at, design_stage_id")
            .in("id", transmittalIds)
            .order("id")
            .range(from, to),
        )
      : Promise.resolve([]),
  ]);

  const projectIds = [...new Set(units.map((unit) => unit.project_id))];
  // A set made before sets had stages takes its transmittal's stage.
  const stageIds = [
    ...new Set(
      [
        ...sets.map((set) => set.design_stage_id),
        ...transmittals.map((transmittal) => transmittal.design_stage_id),
      ].filter((id): id is string => id !== null),
    ),
  ];

  const [projects, stages] = await Promise.all([
    projectIds.length > 0
      ? fetchAll<{ id: string; code: string | null; name: string }>((from, to) =>
          supabase
            .from("projects")
            .select("id, code, name")
            .in("id", projectIds)
            .order("id")
            .range(from, to),
        )
      : Promise.resolve([]),
    stageIds.length > 0
      ? fetchAll<{ id: string; code: string | null; name: string }>((from, to) =>
          supabase
            .from("design_stages")
            .select("id, code, name")
            .in("id", stageIds)
            .order("id")
            .range(from, to),
        )
      : Promise.resolve([]),
  ]);

  const unitsById = new Map(units.map((unit) => [unit.id, unit]));
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const setsById = new Map(sets.map((set) => [set.id, set]));
  const stagesById = new Map(stages.map((stage) => [stage.id, stage]));
  const transmittalsById = new Map(transmittals.map((row) => [row.id, row]));

  // The transmittal that ISSUED a revision is the earliest issued one carrying it; none means a draft (number null).
  const issuedBy = new Map<string, { number: string; issuedAt: string; stageId: string }>();
  const onDraft = new Map<string, string>();
  for (const line of lines) {
    const transmittal = transmittalsById.get(line.transmittal_id);
    if (!transmittal) continue;
    if (transmittal.number && transmittal.issued_at) {
      const held = issuedBy.get(line.drawing_revision_id);
      if (!held || transmittal.issued_at < held.issuedAt) {
        issuedBy.set(line.drawing_revision_id, {
          number: transmittal.number,
          issuedAt: transmittal.issued_at,
          stageId: transmittal.design_stage_id,
        });
      }
    } else {
      onDraft.set(line.drawing_revision_id, transmittal.design_stage_id);
    }
  }

  for (const revision of revisions) {
    const unit = unitsById.get(revision.unit_id);
    const project = unit ? projectsById.get(unit.project_id) : undefined;
    const issued = issuedBy.get(revision.id);
    const stageId =
      setsById.get(revision.drawing_set_id)?.design_stage_id ??
      issued?.stageId ??
      onDraft.get(revision.id) ??
      null;
    const stage = stageId ? stagesById.get(stageId) : undefined;
    context.set(revision.id, {
      projectCode: project?.code ?? null,
      projectName: project?.name ?? "",
      villaName: unit?.name ?? "",
      stageCode: stage?.code ?? null,
      stageName: stage?.name ?? "",
      transmittalNumber: issued?.number ?? null,
    });
  }

  return context;
}
