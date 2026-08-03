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
        line.budget_id != null
          ? "interiors"
          : line.construction_line_id != null
            ? "construction"
            : "direct",
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

/* ------------------------------------------------------------------ *
 * Pull path 1 — the construction plan (the site flow)
 * ------------------------------------------------------------------ */

export type PullLineRow = {
  /** The source row's id — construction_budget_lines.id. */
  source_id: string;
  item_id: string;
  item_name: string;
  item_code: string | null;
  item_brand: string | null;
  item_thumb_url: string | null;
  uom: string;
  /** What the plan (or the budget) says this line should be. */
  planned_quantity: number;
  /** How much has been asked for across EVERY indent, this one included —
   * the figure that says whether a stage is already covered. */
  already_requested: number;
  /** Already a line on this indent: the unique (indent_id, source) pair
   * means it can't be added twice, so the screen says so instead. */
  on_this_indent: boolean;
  note: string | null;
};

export type PullStageGroup = { stage: string; lines: PullLineRow[] };

export type ConstructionPull = {
  plan_id: string;
  unit_name: string;
  stages: PullStageGroup[];
};

/**
 * The unit's construction plan, stage by stage, annotated with what has
 * already been requested against each line.
 *
 * Reads construction_budget_lines directly under /indents — no money is
 * involved anywhere in the construction tree, which is why its reads are
 * open to all staff (see the note at the top of this file).
 */
export async function getConstructionPull(
  unitId: string,
  indentId: string,
): Promise<ConstructionPull | null> {
  await requireTool("/indents");
  const supabase = await createClient();

  const { data: plan } = await supabase
    .from("construction_budgets")
    .select("id, units(name)")
    .eq("unit_id", unitId)
    .maybeSingle();
  if (!plan) return null;

  const { data: lines } = await fetchAll((from, to) =>
    supabase
      .from("construction_budget_lines")
      .select("id, stage, item_id, quantity, uom, note, items(name, code, thumb_url, brands(name))")
      .eq("budget_id", plan.id)
      .order("created_at")
      .order("id")
      .range(from, to),
  );

  const sourceIds = (lines ?? []).map((line) => line.id);

  // Read to completion: these sums are the "already requested" figure a
  // QS decides on, and a truncated read would under-report it — which
  // reads as "nothing has been ordered yet" and buys the material twice.
  const { data: raised } = sourceIds.length
    ? await fetchAll((from, to) =>
        supabase
          .from("indent_lines")
          .select("construction_line_id, quantity, indent_id")
          .in("construction_line_id", sourceIds)
          .order("id")
          .range(from, to),
      )
    : { data: [] };

  const requested = new Map<string, number>();
  const onThisIndent = new Set<string>();
  for (const line of raised ?? []) {
    const key = line.construction_line_id;
    if (!key) continue;
    requested.set(key, (requested.get(key) ?? 0) + line.quantity);
    if (line.indent_id === indentId) onThisIndent.add(key);
  }

  // First-appearance order, so stages stay in construction order rather
  // than alphabetical — same rule as the plan editor.
  const groups = new Map<string, PullLineRow[]>();
  for (const line of lines ?? []) {
    const item = line.items as {
      name: string;
      code: string | null;
      thumb_url: string | null;
      brands: { name: string } | null;
    } | null;
    const group = groups.get(line.stage) ?? [];
    group.push({
      source_id: line.id,
      item_id: line.item_id,
      item_name: item?.name ?? "—",
      item_code: item?.code ?? null,
      item_brand: item?.brands?.name ?? null,
      item_thumb_url: item?.thumb_url ?? null,
      uom: line.uom,
      planned_quantity: line.quantity,
      already_requested: requested.get(line.id) ?? 0,
      on_this_indent: onThisIndent.has(line.id),
      note: line.note,
    });
    groups.set(line.stage, group);
  }

  return {
    plan_id: plan.id,
    unit_name: (plan.units as { name: string } | null)?.name ?? "—",
    stages: [...groups.entries()].map(([stage, stageLines]) => ({ stage, lines: stageLines })),
  };
}

/* ------------------------------------------------------------------ *
 * Pull path 2 — an approved interiors budget
 *
 * Everything below goes through the approved_budgets /
 * approved_budget_lines security-barrier views (migration 0019). Those
 * views are the ONE sanctioned window through the 0011 margin RLS, and
 * their column lists are the security boundary: no unit_cost, no
 * margin_pct, no client_rate, and item_margins is not reachable at all.
 * Never widen a select here to the underlying budgets/budget_lines
 * tables — under /indents alone they return zero rows, and under
 * /budgets they would leak markup into a screen that must never show it.
 * ------------------------------------------------------------------ */

export type ApprovedBudgetOption = {
  budget_id: string;
  unit_id: string;
  unit_name: string;
  revision_no: number;
  version: number;
  approved_at: string | null;
};

/** The approved interiors budgets on this indent's project — what the
 * pull screen offers to pull from. */
export async function listApprovedBudgetsForProject(
  projectId: string,
): Promise<ApprovedBudgetOption[]> {
  await requireTool("/indents");
  const supabase = await createClient();

  const units = await listUnits(projectId);
  if (units.length === 0) return [];
  const unitNames = new Map(units.map((unit) => [unit.id, unit.name]));

  const { data: budgets } = await fetchAll((from, to) =>
    supabase
      .from("approved_budgets")
      .select("id, selection_id, unit_id, version, approved_at")
      .in(
        "unit_id",
        units.map((unit) => unit.id),
      )
      .order("id")
      .range(from, to),
  );
  if ((budgets ?? []).length === 0) return [];

  // R-numbers live on the selection, which the view deliberately doesn't
  // carry — it's the design's number, not the budget's.
  const selectionIds = (budgets ?? [])
    .map((budget) => budget.selection_id)
    .filter((id): id is string => id != null);
  const { data: selections } = await supabase
    .from("selections")
    .select("id, revision_no")
    .in("id", selectionIds);
  const revisions = new Map((selections ?? []).map((row) => [row.id, row.revision_no]));

  return (budgets ?? [])
    .filter((budget) => budget.id != null && budget.unit_id != null)
    .map((budget) => ({
      budget_id: budget.id as string,
      unit_id: budget.unit_id as string,
      unit_name: unitNames.get(budget.unit_id as string) ?? "—",
      revision_no: revisions.get(budget.selection_id as string) ?? 0,
      version: budget.version ?? 1,
      approved_at: budget.approved_at,
    }))
    .sort((a, b) => a.unit_name.localeCompare(b.unit_name) || b.revision_no - a.revision_no);
}

export type BudgetPullLineRow = PullLineRow & {
  /** budget_lines.line_key — half of the composite anchor. */
  line_key: string;
  space_label: string;
  vendor_name: string | null;
};

export type BudgetPullSpaceGroup = { space_label: string; lines: BudgetPullLineRow[] };

export type BudgetPull = {
  budget_id: string;
  unit_name: string;
  revision_no: number;
  version: number;
  spaces: BudgetPullSpaceGroup[];
};

/**
 * One approved budget's lines, grouped by space, ready to pull.
 *
 * The quantity shown is the BUDGET's quantity (the team's measured
 * figure), not the designer's — that's what was actually costed and
 * approved. Item, uom and space come from selection_lines, joined on
 * (selection_id, line_key), because the view carries no item at all.
 */
export async function getBudgetPull(
  budgetId: string,
  indentId: string,
): Promise<BudgetPull | null> {
  await requireTool("/indents");
  const supabase = await createClient();

  const { data: budget } = await supabase
    .from("approved_budgets")
    .select("id, selection_id, unit_id, version")
    .eq("id", budgetId)
    .maybeSingle();
  if (!budget || !budget.selection_id || !budget.unit_id) return null;

  const [{ data: budgetLines }, { data: selectionLines }, { data: spaces }, { data: selection }] =
    await Promise.all([
      fetchAll((from, to) =>
        supabase
          .from("approved_budget_lines")
          .select("line_key, quantity, expected_vendor_id")
          .eq("budget_id", budgetId)
          .order("line_key")
          .range(from, to),
      ),
      fetchAll((from, to) =>
        supabase
          .from("selection_lines")
          .select(
            "line_key, item_id, uom, unit_space_id, sort_order, items(name, code, thumb_url, brands(name))",
          )
          .eq("selection_id", budget.selection_id as string)
          .order("sort_order")
          .order("id")
          .range(from, to),
      ),
      supabase.from("spaces").select("id, label, sort_order").eq("unit_id", budget.unit_id),
      supabase
        .from("selections")
        .select("revision_no, units(name)")
        .eq("id", budget.selection_id as string)
        .maybeSingle(),
    ]);

  // Every line already raised against THIS budget, on any indent.
  const { data: raised } = await fetchAll((from, to) =>
    supabase
      .from("indent_lines")
      .select("line_key, quantity, indent_id")
      .eq("budget_id", budgetId)
      .order("id")
      .range(from, to),
  );

  const requested = new Map<string, number>();
  const onThisIndent = new Set<string>();
  for (const line of raised ?? []) {
    const key = line.line_key;
    if (!key) continue;
    requested.set(key, (requested.get(key) ?? 0) + line.quantity);
    if (line.indent_id === indentId) onThisIndent.add(key);
  }

  const spaceLabels = new Map((spaces ?? []).map((space) => [space.id, space.label]));
  const designLines = new Map((selectionLines ?? []).map((line) => [line.line_key, line]));

  const vendorIds = [
    ...new Set(
      (budgetLines ?? [])
        .map((line) => line.expected_vendor_id)
        .filter((id): id is string => id != null),
    ),
  ];
  const { data: vendors } = vendorIds.length
    ? await supabase.from("vendors").select("id, name").in("id", vendorIds)
    : { data: [] };
  const vendorNames = new Map((vendors ?? []).map((vendor) => [vendor.id, vendor.name]));

  const groups = new Map<string, BudgetPullLineRow[]>();
  for (const line of budgetLines ?? []) {
    if (!line.line_key) continue;
    const design = designLines.get(line.line_key);
    // A budget line whose selection line has gone is not something to
    // request — skip it rather than render a row with no item.
    if (!design) continue;
    const item = design.items as {
      name: string;
      code: string | null;
      thumb_url: string | null;
      brands: { name: string } | null;
    } | null;
    const label = spaceLabels.get(design.unit_space_id) ?? "Unassigned";
    const group = groups.get(label) ?? [];
    group.push({
      source_id: line.line_key,
      line_key: line.line_key,
      space_label: label,
      item_id: design.item_id,
      item_name: item?.name ?? "—",
      item_code: item?.code ?? null,
      item_brand: item?.brands?.name ?? null,
      item_thumb_url: item?.thumb_url ?? null,
      uom: design.uom,
      planned_quantity: line.quantity ?? 0,
      already_requested: requested.get(line.line_key) ?? 0,
      on_this_indent: onThisIndent.has(line.line_key),
      vendor_name: line.expected_vendor_id
        ? (vendorNames.get(line.expected_vendor_id) ?? null)
        : null,
      note: null,
    });
    groups.set(label, group);
  }

  const unit = selection?.units as { name: string } | null;
  return {
    budget_id: budgetId,
    unit_name: unit?.name ?? "—",
    revision_no: selection?.revision_no ?? 0,
    version: budget.version ?? 1,
    spaces: [...groups.entries()]
      .map(([space_label, lines]) => ({ space_label, lines }))
      .sort((a, b) => a.space_label.localeCompare(b.space_label)),
  };
}

/**
 * May the signed-in user decide on a submitted indent?
 *
 * Admins always may; everyone else needs a row in `indent_approvers`
 * (managed from Settings). This drives which buttons appear —
 * `indents_guard()` enforces the same rule in the database, which is
 * what actually stops a decision.
 */
export async function isCurrentUserApprover(): Promise<{
  isAdmin: boolean;
  isApprover: boolean;
}> {
  const user = await requireTool("/indents");
  const supabase = await createClient();

  const isAdmin = user.profile?.role === "admin";
  if (isAdmin) return { isAdmin: true, isApprover: true };

  const { data } = await supabase
    .from("indent_approvers")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  return { isAdmin: false, isApprover: data != null };
}

/**
 * Counts for the Overview pipeline's first stage.
 *
 * Deliberately NOT gated: the Overview page is the shell's home and
 * every signed-in user sees it, whether or not they hold /indents —
 * so a gate here would redirect a designer off their own dashboard.
 * Safe because it returns counts of rows whose reads are already open
 * to all staff, and indents carry no money by design.
 */
export async function countIndentsPipeline(): Promise<{
  raisedThisMonth: number;
  lineCount: number;
  awaitingApproval: number;
  approved: number;
}> {
  const supabase = await createClient();

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const since = startOfMonth.toISOString();

  // Exact database counts, head-only — never rows.length (the rule the
  // codebase has now learned four separate times).
  const [raised, lines, submitted, approved] = await Promise.all([
    supabase.from("indents").select("id", { count: "exact", head: true }).gte("created_at", since),
    supabase
      .from("indent_lines")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since),
    supabase.from("indents").select("id", { count: "exact", head: true }).eq("status", "submitted"),
    supabase
      .from("indents")
      .select("id", { count: "exact", head: true })
      .eq("status", "approved")
      .gte("created_at", since),
  ]);

  return {
    raisedThisMonth: raised.count ?? 0,
    lineCount: lines.count ?? 0,
    awaitingApproval: submitted.count ?? 0,
    approved: approved.count ?? 0,
  };
}

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
