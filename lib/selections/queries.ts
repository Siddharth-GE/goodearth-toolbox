import "server-only";

import { requireApp } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

export type SelectionStatus = "draft" | "issued" | "superseded";

export type SelectionRow = {
  id: string;
  unit_id: string;
  revision_no: number;
  status: SelectionStatus;
  title: string | null;
  notes: string | null;
  issued_at: string | null;
  created_at: string;
};

/** A unit plus the revision a designer would land on. */
export type UnitSelectionRow = {
  unit_id: string;
  unit_name: string;
  unit_type: string;
  project_name: string;
  /** The open draft, if there is one — only ever zero or one per unit. */
  draft: SelectionRow | null;
  /** The most recent issued revision, for units whose design is settled. */
  latestIssued: SelectionRow | null;
};

export type UnitSpaceRow = {
  id: string;
  unit_id: string;
  space_type_id: string;
  space_type_name: string;
  label: string;
  description: string | null;
  sort_order: number;
  /** Lines currently against this space, so the rail can show counts. */
  line_count: number;
};

export type SelectionLineRow = {
  id: string;
  line_key: string;
  unit_space_id: string;
  item_id: string;
  item_name: string;
  item_code: string | null;
  item_thumb_url: string | null;
  item_is_provisional: boolean;
  quantity: number;
  uom: string;
  indicative_rate_snapshot: number | null;
  designer_note: string | null;
  sort_order: number;
};

/**
 * Units a designer can work on, with whichever revision matters.
 *
 * Deliberately lists every unit rather than only those with a design:
 * starting the first revision for a unit is the most common action here,
 * so a unit with no design yet must be visible to be startable.
 */
export async function listUnitsForSelections(projectId?: string): Promise<UnitSelectionRow[]> {
  const user = await requireUser();
  await requireApp(user, "/selections");

  const supabase = await createClient();
  let query = supabase
    .from("units")
    .select("id, name, unit_type, project_id, projects(name), selections(*)")
    .order("name");
  if (projectId) query = query.eq("project_id", projectId);

  const { data } = await query;

  return (data ?? []).map((unit) => {
    const revisions = ((unit.selections ?? []) as SelectionRow[])
      .slice()
      .sort((a, b) => b.revision_no - a.revision_no);
    return {
      unit_id: unit.id,
      unit_name: unit.name,
      unit_type: unit.unit_type,
      // The embed is typed as an object or array depending on the FK
      // direction; units → projects is many-to-one, so it's one row.
      project_name: (unit.projects as { name: string } | null)?.name ?? "—",
      draft: revisions.find((r) => r.status === "draft") ?? null,
      latestIssued: revisions.find((r) => r.status === "issued") ?? null,
    };
  });
}

export type SelectionDetail = SelectionRow & {
  unit_name: string;
  project_name: string;
  /** Set once a later revision supersedes this one. */
  superseded_by: string | null;
};

export async function getSelection(selectionId: string): Promise<SelectionDetail | null> {
  const user = await requireUser();
  await requireApp(user, "/selections");

  const supabase = await createClient();
  const { data } = await supabase
    .from("selections")
    .select("*, units(name, projects(name))")
    .eq("id", selectionId)
    .maybeSingle();
  if (!data) return null;

  const unit = data.units as { name: string; projects: { name: string } | null } | null;
  return {
    id: data.id,
    unit_id: data.unit_id,
    revision_no: data.revision_no,
    status: data.status as SelectionStatus,
    title: data.title,
    notes: data.notes,
    issued_at: data.issued_at,
    created_at: data.created_at,
    superseded_by: data.superseded_by,
    unit_name: unit?.name ?? "—",
    project_name: unit?.projects?.name ?? "—",
  };
}

export async function listUnitSpaces(unitId: string, selectionId?: string): Promise<UnitSpaceRow[]> {
  const user = await requireUser();
  await requireApp(user, "/selections");

  const supabase = await createClient();
  const [spacesResult, linesResult] = await Promise.all([
    supabase
      .from("spaces")
      .select("id, unit_id, space_type_id, label, description, sort_order, space_types(name)")
      .eq("unit_id", unitId)
      .order("sort_order")
      .order("label"),
    selectionId
      ? supabase.from("selection_lines").select("unit_space_id").eq("selection_id", selectionId)
      : Promise.resolve({ data: [] as { unit_space_id: string }[] }),
  ]);

  const counts = new Map<string, number>();
  for (const line of linesResult.data ?? []) {
    counts.set(line.unit_space_id, (counts.get(line.unit_space_id) ?? 0) + 1);
  }

  return (spacesResult.data ?? []).map((space) => ({
    id: space.id,
    unit_id: space.unit_id,
    space_type_id: space.space_type_id,
    space_type_name: (space.space_types as { name: string } | null)?.name ?? "—",
    label: space.label as string,
    description: space.description,
    sort_order: space.sort_order,
    line_count: counts.get(space.id) ?? 0,
  }));
}

export async function listSelectionLines(selectionId: string): Promise<SelectionLineRow[]> {
  const user = await requireUser();
  await requireApp(user, "/selections");

  const supabase = await createClient();
  const { data } = await supabase
    .from("selection_lines")
    .select("*, items(name, code, thumb_url, is_provisional)")
    .eq("selection_id", selectionId)
    .order("sort_order")
    .order("created_at");

  return (data ?? []).map((line) => {
    const item = line.items as {
      name: string;
      code: string | null;
      thumb_url: string | null;
      is_provisional: boolean;
    } | null;
    return {
      id: line.id,
      line_key: line.line_key,
      unit_space_id: line.unit_space_id,
      item_id: line.item_id,
      item_name: item?.name ?? "(deleted item)",
      item_code: item?.code ?? null,
      item_thumb_url: item?.thumb_url ?? null,
      item_is_provisional: item?.is_provisional ?? false,
      quantity: Number(line.quantity),
      uom: line.uom,
      indicative_rate_snapshot:
        line.indicative_rate_snapshot === null ? null : Number(line.indicative_rate_snapshot),
      designer_note: line.designer_note,
      sort_order: line.sort_order,
    };
  });
}

/** Space types a designer may pick from — proposals aren't offered until approved. */
export async function listActiveSpaceTypes() {
  const user = await requireUser();
  await requireApp(user, "/selections");

  const supabase = await createClient();
  const { data } = await supabase
    .from("space_types")
    .select("id, code, name, sort_order")
    .eq("status", "active")
    .order("sort_order");
  return data ?? [];
}
