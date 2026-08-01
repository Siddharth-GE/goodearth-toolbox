import "server-only";

import { requireTool } from "@/lib/auth/access";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import { cache } from "react";

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
  item_brand: string | null;
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
  await requireTool("/selections");

  const supabase = await createClient();
  // fetchAll: every unit must be visible here to be startable, and a
  // capped read would silently hide real units as projects grow.
  const { data } = await fetchAll((from, to) => {
    let query = supabase
      .from("units")
      .select("id, name, unit_type, project_id, projects(name), selections(*)")
      .order("name")
      .order("id")
      .range(from, to);
    if (projectId) query = query.eq("project_id", projectId);
    return query;
  });

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

// The three functions below are request-cached. The editor screen asks for
// the same revision's lines and spaces from more than one place — the page
// itself, and again inside diffRevisions — and without this each one is a
// separate round trip for identical data.
export const getSelection = cache(async (selectionId: string): Promise<SelectionDetail | null> => {
  await requireTool("/selections");

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
});

export const listUnitSpaces = cache(async function listUnitSpaces(
  unitId: string,
  selectionId?: string,
): Promise<UnitSpaceRow[]> {
  await requireTool("/selections");

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
});

export const listSelectionLines = cache(async function listSelectionLines(
  selectionId: string,
): Promise<SelectionLineRow[]> {
  await requireTool("/selections");

  const supabase = await createClient();
  const { data } = await supabase
    .from("selection_lines")
    .select("*, items(name, code, thumb_url, is_provisional, brands(name))")
    .eq("selection_id", selectionId)
    .order("sort_order")
    .order("created_at");

  return (data ?? []).map((line) => {
    const item = line.items as {
      name: string;
      code: string | null;
      thumb_url: string | null;
      is_provisional: boolean;
      brands: { name: string } | null;
    } | null;
    return {
      id: line.id,
      line_key: line.line_key,
      unit_space_id: line.unit_space_id,
      item_id: line.item_id,
      item_name: item?.name ?? "(deleted item)",
      item_code: item?.code ?? null,
      item_brand: item?.brands?.name ?? null,
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
});

/** The revision this one replaced, if any. */
export async function getPreviousIssued(
  unitId: string,
  revisionNo: number,
): Promise<SelectionRow | null> {
  await requireTool("/selections");

  const supabase = await createClient();
  const { data } = await supabase
    .from("selections")
    .select("*")
    .eq("unit_id", unitId)
    .in("status", ["issued", "superseded"])
    .lt("revision_no", revisionNo)
    .order("revision_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as SelectionRow) ?? null;
}

export type LineChange =
  | { kind: "added"; line: SelectionLineRow; space: string }
  | { kind: "removed"; line: SelectionLineRow; space: string }
  | {
      kind: "changed";
      line: SelectionLineRow;
      previous: SelectionLineRow;
      space: string;
      quantityChanged: boolean;
      spaceChanged: boolean;
    };

export type RevisionDiff = {
  added: number;
  removed: number;
  changed: number;
  unchanged: number;
  entries: LineChange[];
};

/**
 * What changed between two revisions.
 *
 * Matched on `line_key`, never on row id — a line copied into the next
 * revision is a different row but the same line, and that is precisely
 * what lets Budgets carry pricing forward instead of re-pricing
 * everything each time a revision is issued.
 */
export async function diffRevisions(
  previousSelectionId: string,
  currentSelectionId: string,
  unitId: string,
): Promise<RevisionDiff> {
  const [previousLines, currentLines, spaces] = await Promise.all([
    listSelectionLines(previousSelectionId),
    // Same arguments the page itself used, so the request cache returns
    // these rather than re-querying. Passing a different shape here would
    // quietly double the work.
    listSelectionLines(currentSelectionId),
    listUnitSpaces(unitId, currentSelectionId),
  ]);

  const spaceLabel = new Map(spaces.map((space) => [space.id, space.label]));
  const previousByKey = new Map(previousLines.map((line) => [line.line_key, line]));
  const currentByKey = new Map(currentLines.map((line) => [line.line_key, line]));

  const entries: LineChange[] = [];
  let unchanged = 0;

  for (const line of currentLines) {
    const previous = previousByKey.get(line.line_key);
    if (!previous) {
      entries.push({ kind: "added", line, space: spaceLabel.get(line.unit_space_id) ?? "—" });
      continue;
    }
    const quantityChanged = previous.quantity !== line.quantity;
    const spaceChanged = previous.unit_space_id !== line.unit_space_id;
    if (quantityChanged || spaceChanged) {
      entries.push({
        kind: "changed",
        line,
        previous,
        space: spaceLabel.get(line.unit_space_id) ?? "—",
        quantityChanged,
        spaceChanged,
      });
    } else {
      unchanged++;
    }
  }

  for (const line of previousLines) {
    if (!currentByKey.has(line.line_key)) {
      entries.push({ kind: "removed", line, space: spaceLabel.get(line.unit_space_id) ?? "—" });
    }
  }

  return {
    added: entries.filter((entry) => entry.kind === "added").length,
    removed: entries.filter((entry) => entry.kind === "removed").length,
    changed: entries.filter((entry) => entry.kind === "changed").length,
    unchanged,
    entries,
  };
}

/**
 * A revision assembled whole: header, spaces, lines, and what changed.
 *
 * Despite the name, Budgets does NOT call this — it can't: everything in
 * this module gates on /selections, and Budgets reads the selection
 * tables directly under its own grant (see lib/budgets/queries.ts). The
 * name survives because this shape IS the documented handoff contract —
 * what an issued revision hands downstream — and its real callers are
 * Selections' own PDF and CSV exports, which render exactly that.
 *
 * Note what is NOT here: no cost, no margin, no client rate. Selections
 * records what was specified; `indicative_rate_snapshot` is the figure
 * the item carried the day it was picked, present so an issued revision
 * doesn't silently re-price when a master price changes, not as an
 * opinion about what anything should cost.
 */
export type BudgetHandoff = {
  selection: SelectionDetail;
  spaces: { space: UnitSpaceRow; lines: SelectionLineRow[] }[];
  totalLines: number;
  /** Null for R0 — there is nothing to compare a first revision against. */
  diff: RevisionDiff | null;
  previousRevisionNo: number | null;
};

export async function getBudgetHandoff(selectionId: string): Promise<BudgetHandoff | null> {
  const selection = await getSelection(selectionId);
  if (!selection) return null;

  const [spaces, lines, previous] = await Promise.all([
    listUnitSpaces(selection.unit_id, selectionId),
    listSelectionLines(selectionId),
    getPreviousIssued(selection.unit_id, selection.revision_no),
  ]);

  const diff = previous ? await diffRevisions(previous.id, selectionId, selection.unit_id) : null;

  return {
    selection,
    // Spaces with nothing in them are dropped: the budget team is being
    // handed work, and an empty room is not work.
    spaces: spaces
      .map((space) => ({ space, lines: lines.filter((line) => line.unit_space_id === space.id) }))
      .filter((group) => group.lines.length > 0),
    totalLines: lines.length,
    diff,
    previousRevisionNo: previous?.revision_no ?? null,
  };
}

/** Space types a designer may pick from — proposals aren't offered until approved. */
export async function listActiveSpaceTypes() {
  await requireTool("/selections");

  const supabase = await createClient();
  const { data } = await supabase
    .from("space_types")
    .select("id, code, name, sort_order")
    .eq("status", "active")
    .order("sort_order");
  return data ?? [];
}
