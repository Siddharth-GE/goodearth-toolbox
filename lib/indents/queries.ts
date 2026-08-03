import "server-only";

import { cache } from "react";

import { requireTool } from "@/lib/auth/access";
import { listPlots } from "@/lib/masters/plots";
import { listProjects } from "@/lib/masters/projects";
import { listUnits } from "@/lib/masters/units";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";

import type { IndentStatus } from "./workflow";

// Indents reads the construction/selections/masters tables DIRECTLY,
// under its own /indents grant. It deliberately does not call another
// tool's queries module: those all open with requireTool for *their*
// tool, so a site user holding only /indents would be redirected away
// from their own screen. Cross-stage reads belong to the downstream
// tool — the same rule that lets any tool read lib/masters/* without
// holding /masters.
//
// Nothing here can leak money: indents carry no cost, margin or rate by
// design, and the only interiors window this tool will ever read
// through (M4) is the approved_budgets/approved_budget_lines views,
// whose column lists exclude the secret side of the 0011 boundary.

export const INDENTS_LIST_LIMIT = 50;

export type IndentListRow = {
  id: string;
  reference: string;
  status: IndentStatus;
  stage: string | null;
  required_by: string | null;
  created_at: string;
  project_name: string;
  unit_name: string | null;
  line_count: number;
};

export type IndentListPage = {
  indents: IndentListRow[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
};

export async function listIndents({
  page = 1,
  status,
}: {
  page?: number;
  status?: IndentStatus;
} = {}): Promise<IndentListPage> {
  await requireTool("/indents");
  const supabase = await createClient();

  const pageSize = INDENTS_LIST_LIMIT;
  const currentPage = Math.max(1, page);

  // A stated limit with an exact database count — the total is never
  // derived from the rows that happened to arrive.
  let query = supabase
    .from("indents")
    .select(
      "id, reference, status, stage, required_by, created_at, projects(name), units(name), indent_lines(count)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .order("id")
    .range((currentPage - 1) * pageSize, currentPage * pageSize - 1);
  if (status) query = query.eq("status", status);

  const { data, count, error } = await query;
  if (error) {
    console.error("listIndents failed:", error);
    return { indents: [], total: 0, page: currentPage, pageCount: 1, pageSize };
  }

  const total = count ?? 0;
  return {
    indents: (data ?? []).map((row) => ({
      id: row.id,
      reference: row.reference ?? "—",
      status: row.status as IndentStatus,
      stage: row.stage,
      required_by: row.required_by,
      created_at: row.created_at,
      project_name: (row.projects as { name: string } | null)?.name ?? "—",
      unit_name: (row.units as { name: string } | null)?.name ?? null,
      line_count: (row.indent_lines as { count: number }[] | null)?.[0]?.count ?? 0,
    })),
    total,
    page: currentPage,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    pageSize,
  };
}

/** Where a line came from — provenance, shown on the grid and used by
 * the pull screens (M4) to skip lines already requested. */
export type IndentLineSource = "direct" | "construction" | "interiors";

export type IndentLineRow = {
  id: string;
  item_id: string;
  item_name: string;
  item_code: string | null;
  item_brand: string | null;
  item_thumb_url: string | null;
  quantity: number;
  uom: string;
  note: string | null;
  source: IndentLineSource;
};

export type IndentDetail = {
  id: string;
  reference: string;
  status: IndentStatus;
  stage: string | null;
  required_by: string | null;
  note: string | null;
  rejection_note: string | null;
  project_id: string;
  project_name: string;
  plot_name: string | null;
  unit_id: string | null;
  unit_name: string | null;
  created_at: string;
  submitted_at: string | null;
  approved_at: string | null;
  lines: IndentLineRow[];
  line_count: number;
};

export const getIndent = cache(async (indentId: string): Promise<IndentDetail | null> => {
  await requireTool("/indents");
  const supabase = await createClient();

  const [{ data: indent }, { data: lines }] = await Promise.all([
    supabase
      .from("indents")
      .select(
        "id, reference, status, stage, required_by, note, rejection_note, project_id, unit_id, created_at, submitted_at, approved_at, projects(name), plots(name), units(name)",
      )
      .eq("id", indentId)
      .maybeSingle(),
    fetchAll((from, to) =>
      supabase
        .from("indent_lines")
        .select(
          "id, item_id, quantity, uom, note, budget_id, construction_line_id, created_at, items(name, code, thumb_url, brands(name))",
        )
        .eq("indent_id", indentId)
        .order("created_at")
        .order("id")
        .range(from, to),
    ),
  ]);

  if (!indent) return null;

  const mapped: IndentLineRow[] = (lines ?? []).map((line) => {
    const item = line.items as {
      name: string;
      code: string | null;
      thumb_url: string | null;
      brands: { name: string } | null;
    } | null;
    return {
      id: line.id,
      item_id: line.item_id,
      item_name: item?.name ?? "—",
      item_code: item?.code ?? null,
      item_brand: item?.brands?.name ?? null,
      item_thumb_url: item?.thumb_url ?? null,
      quantity: line.quantity,
      uom: line.uom,
      note: line.note,
      source:
        line.budget_id != null ? "interiors" : line.construction_line_id != null ? "construction" : "direct",
    };
  });

  return {
    id: indent.id,
    reference: indent.reference ?? "—",
    status: indent.status as IndentStatus,
    stage: indent.stage,
    required_by: indent.required_by,
    note: indent.note,
    rejection_note: indent.rejection_note,
    project_id: indent.project_id,
    project_name: (indent.projects as { name: string } | null)?.name ?? "—",
    plot_name: (indent.plots as { name: string } | null)?.name ?? null,
    unit_id: indent.unit_id,
    unit_name: (indent.units as { name: string } | null)?.name ?? null,
    created_at: indent.created_at,
    submitted_at: indent.submitted_at,
    approved_at: indent.approved_at,
    lines: mapped,
    line_count: mapped.length,
  };
});

export type ProjectOption = { id: string; name: string; code: string | null };
export type ScopedOption = { id: string; project_id: string; name: string };

export type IndentFormOptions = {
  projects: ProjectOption[];
  plots: ScopedOption[];
  units: ScopedOption[];
};

/** Everything the new-indent form needs, in one gated call. The masters
 * reads themselves are ungated by design — this wrapper is the gate. */
export async function getIndentFormOptions(): Promise<IndentFormOptions> {
  await requireTool("/indents");
  const [projects, plots, units] = await Promise.all([listProjects(), listPlots(), listUnits()]);
  return {
    projects: projects.map(({ id, name, code }) => ({ id, name, code })),
    plots: plots.map(({ id, project_id, name }) => ({ id, project_id, name })),
    units: units.map(({ id, project_id, name }) => ({ id, project_id, name })),
  };
}
