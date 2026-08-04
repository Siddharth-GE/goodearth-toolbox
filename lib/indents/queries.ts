import "server-only";

import { cache } from "react";

import { requireTool } from "@/lib/auth/access";
import { listPlots } from "@/lib/masters/plots";
import { listProjects } from "@/lib/masters/projects";
import { listUnits } from "@/lib/masters/units";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";

import { classifyBudgetChooser, type BudgetCandidate, type IssuedRevision } from "./pull-rules";
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
  /** Who last touched the line — the attribution rule. */
  updated_by_name: string | null;
  /** Ordered across all live POs (Phase 6) — the "ordered X of Y" figure. */
  ordered_quantity: number;
  /** The PO references carrying this line, e.g. "PO/SAA/P12/001". */
  ordered_po_refs: string | null;
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
  submitted_by_name: string | null;
  approved_by_name: string | null;
  lines: IndentLineRow[];
  line_count: number;
};

export type IndentHeader = {
  id: string;
  reference: string;
  status: IndentStatus;
  project_id: string;
  project_name: string;
  unit_id: string | null;
};

/**
 * Just the header — for screens (the two pull pages) that need the
 * reference and status to render but have no use for the full detail's
 * lines, fulfilment facts and actor names.
 */
export const getIndentHeader = cache(async (indentId: string): Promise<IndentHeader | null> => {
  await requireTool("/indents");
  const supabase = await createClient();
  const { data } = await supabase
    .from("indents")
    .select("id, reference, status, project_id, unit_id, projects(name)")
    .eq("id", indentId)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    reference: data.reference,
    status: data.status as IndentStatus,
    project_id: data.project_id,
    project_name: (data.projects as { name: string } | null)?.name ?? "—",
    unit_id: data.unit_id,
  };
});

export const getIndent = cache(async (indentId: string): Promise<IndentDetail | null> => {
  await requireTool("/indents");
  const supabase = await createClient();

  const [{ data: indent }, { data: lines }] = await Promise.all([
    supabase
      .from("indents")
      .select(
        "id, reference, status, stage, required_by, note, rejection_note, project_id, unit_id, created_at, submitted_by, submitted_at, approved_by, approved_at, projects(name), plots(name), units(name)",
      )
      .eq("id", indentId)
      .maybeSingle(),
    fetchAll((from, to) =>
      supabase
        .from("indent_lines")
        .select(
          "id, item_id, quantity, uom, note, budget_id, construction_line_id, created_by, updated_by, created_at, items(name, code, thumb_url, brands(name))",
        )
        .eq("indent_id", indentId)
        .order("created_at")
        .order("id")
        .range(from, to),
    ),
  ]);

  if (!indent) return null;

  // Names for every actor on the document — the attribution rule. One
  // profiles read rather than embedded joins (several FKs to profiles).
  const actorIds = [
    ...new Set(
      [
        indent.submitted_by,
        indent.approved_by,
        ...(lines ?? []).map((line) => line.updated_by ?? line.created_by),
      ].filter((id): id is string => id != null),
    ),
  ];
  const { data: profiles } = actorIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", actorIds)
    : { data: [] };
  const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name]));
  const nameOf = (id: string | null | undefined) => (id ? (names.get(id) ?? null) : null);

  // "Ordered X of Y" per line, through the money-free po_line_facts view
  // (migration 0022) — quantities and references only, never a rate, so
  // a site user without /purchase-orders still sees fulfilment.
  // Read to completion: these rows are SUMMED into ordered quantities,
  // so a silent 1,000-row cap would under-report "ordered X of Y".
  const lineIds = (lines ?? []).map((line) => line.id);
  const { data: orderedFacts } = lineIds.length
    ? await fetchAll((from, to) =>
        supabase
          .from("po_line_facts")
          .select("indent_line_id, quantity, po_reference, po_status")
          .in("indent_line_id", lineIds)
          .order("id")
          .range(from, to),
      )
    : { data: [] };

  const orderedByLine = new Map<string, { quantity: number; refs: Set<string> }>();
  for (const fact of orderedFacts ?? []) {
    if (fact.po_status === "cancelled" || !fact.indent_line_id) continue;
    const entry = orderedByLine.get(fact.indent_line_id) ?? { quantity: 0, refs: new Set() };
    entry.quantity += fact.quantity ?? 0;
    if (fact.po_reference) entry.refs.add(fact.po_reference);
    orderedByLine.set(fact.indent_line_id, entry);
  }

  const mapped: IndentLineRow[] = (lines ?? []).map((line) => {
    const item = line.items as {
      name: string;
      code: string | null;
      thumb_url: string | null;
      brands: { name: string } | null;
    } | null;
    const ordered = orderedByLine.get(line.id);
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
      updated_by_name: nameOf(line.updated_by ?? line.created_by),
      ordered_quantity: ordered?.quantity ?? 0,
      ordered_po_refs: ordered ? [...ordered.refs].sort().join(", ") : null,
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
    submitted_by_name: nameOf(indent.submitted_by),
    approved_by_name: nameOf(indent.approved_by),
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

/** A unit whose current revision is issued but not yet priced and
 * approved — shown paused rather than silently offering the old budget. */
export type PendingBudgetUnit = {
  unit_name: string;
  revision_no: number;
};

export type BudgetChooser = {
  pullable: ApprovedBudgetOption[];
  pending: PendingBudgetUnit[];
};

/**
 * The approved interiors budgets the pull screen may offer: only each
 * unit's CURRENT (issued) revision. A superseded revision's budget stays
 * approved forever as history, but requesting material against it is how
 * the same line gets bought twice — those units appear as pending until
 * the new revision's budget is approved. An indent tagged to a unit sees
 * that unit alone.
 */
export async function listApprovedBudgetsForProject(
  projectId: string,
  unitId?: string | null,
): Promise<BudgetChooser> {
  await requireTool("/indents");
  const supabase = await createClient();

  const units = (await listUnits(projectId)).filter((unit) => !unitId || unit.id === unitId);
  if (units.length === 0) return { pullable: [], pending: [] };
  const unitNames = new Map(units.map((unit) => [unit.id, unit.name]));
  const unitIds = units.map((unit) => unit.id);

  const [{ data: budgets }, { data: issuedSelections }] = await Promise.all([
    fetchAll((from, to) =>
      supabase
        .from("approved_budgets")
        .select("id, selection_id, unit_id, version, approved_at")
        .in("unit_id", unitIds)
        .order("id")
        .range(from, to),
    ),
    // At most one issued selection per unit (issue_selection supersedes
    // the previous one) — the R-number and the "is this current" test in
    // one read.
    supabase
      .from("selections")
      .select("id, unit_id, revision_no")
      .in("unit_id", unitIds)
      .eq("status", "issued"),
  ]);
  if ((budgets ?? []).length === 0) return { pullable: [], pending: [] };

  const issuedByUnit = new Map<string, IssuedRevision>(
    (issuedSelections ?? []).map((row) => [
      row.unit_id,
      { selection_id: row.id, revision_no: row.revision_no },
    ]),
  );

  const candidates: BudgetCandidate[] = (budgets ?? [])
    .filter((budget) => budget.id != null && budget.unit_id != null && budget.selection_id != null)
    .map((budget) => ({
      budget_id: budget.id as string,
      unit_id: budget.unit_id as string,
      selection_id: budget.selection_id as string,
      version: budget.version ?? 1,
      approved_at: budget.approved_at,
    }));

  const rows = classifyBudgetChooser(candidates, issuedByUnit);

  return {
    pullable: rows
      .filter((row) => row.kind === "pullable")
      .map((row) => ({
        budget_id: row.budget.budget_id,
        unit_id: row.budget.unit_id,
        unit_name: unitNames.get(row.budget.unit_id) ?? "—",
        revision_no: row.revision_no,
        version: row.budget.version,
        approved_at: row.budget.approved_at,
      }))
      .sort((a, b) => a.unit_name.localeCompare(b.unit_name)),
    pending: rows
      .filter((row) => row.kind === "pending")
      .map((row) => ({
        unit_name: unitNames.get(row.unit_id) ?? "—",
        revision_no: row.revision_no,
      }))
      .sort((a, b) => a.unit_name.localeCompare(b.unit_name)),
  };
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

  // An indent tagged to a unit pulls from that unit alone — the chooser
  // never offers another unit's budget, so arriving here with one is a
  // pasted URL.
  const indent = await getIndentHeader(indentId);
  if (!indent) return null;
  if (indent.unit_id && indent.unit_id !== budget.unit_id) return null;

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
        .select("revision_no, status, units(name)")
        .eq("id", budget.selection_id as string)
        .maybeSingle(),
    ]);

  // Only the current design revision may be requested against. The
  // chooser already filters; this holds against a stale tab or a pasted
  // URL, and the 0028 trigger backstops the insert itself.
  if (selection?.status !== "issued") return null;

  // Every line already raised against ANY of this unit's budgets, on any
  // indent. line_key is stable across revisions, so a line pulled from
  // R1's budget must show as already asked when R2's budget is on
  // screen — scoping this to one budget_id was the double-buy bug.
  const { data: siblingBudgets } = await supabase
    .from("approved_budgets")
    .select("id")
    .eq("unit_id", budget.unit_id);
  const siblingIds = (siblingBudgets ?? [])
    .map((row) => row.id)
    .filter((id): id is string => id != null);

  const { data: raised } = await fetchAll((from, to) =>
    supabase
      .from("indent_lines")
      .select("line_key, quantity, indent_id")
      .in("budget_id", siblingIds)
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
