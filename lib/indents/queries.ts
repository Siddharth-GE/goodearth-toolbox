import "server-only";

import { cache } from "react";

import { requireTool } from "@/lib/auth/access";
import { listPlots } from "@/lib/masters/plots";
import { listProjects } from "@/lib/masters/projects";
import { listActiveStageNames } from "@/lib/masters/stages";
import { listUnits } from "@/lib/masters/units";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import { withRetry } from "@/lib/supabase/transient";

import {
  classifyBudgetChooser,
  classifyDesignDrift,
  type BudgetCandidate,
  type DriftLine,
  type DriftStatus,
  type IssuedRevision,
} from "./pull-rules";
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

/** Headline counts for the tool's welcome screen. Indents carry no
 * money by design, so these are plain status counts. */
export async function getWelcomeCounts() {
  await requireTool("/indents");
  const supabase = await createClient();

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const since = startOfMonth.toISOString();

  // Exact database counts, head-only — never rows.length.
  const [submitted, drafts, approved] = await Promise.all([
    supabase.from("indents").select("id", { count: "exact", head: true }).eq("status", "submitted"),
    supabase.from("indents").select("id", { count: "exact", head: true }).eq("status", "draft"),
    supabase
      .from("indents")
      .select("id", { count: "exact", head: true })
      .eq("status", "approved")
      .gte("created_at", since),
  ]);

  return {
    awaitingApproval: submitted.count ?? 0,
    drafts: drafts.count ?? 0,
    approvedThisMonth: approved.count ?? 0,
  };
}

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
  /** Set when a design revision issued AFTER this line was pulled has
   * changed or removed it — the "check this order" flag. Null for
   * direct/construction lines and for lines still on the current
   * revision. */
  design_drift: "changed" | "removed" | null;
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
  const { data, error } = await withRetry(() =>
    supabase
      .from("indents")
      .select("id, reference, status, project_id, unit_id, projects(name)")
      .eq("id", indentId)
      .maybeSingle(),
  );
  // Both pull screens call notFound() on a null header, so a swallowed
  // error here told the user the indent doesn't exist. Throw instead —
  // it is the same rule as the drift reads below.
  if (error) {
    console.error("getIndentHeader failed:", error);
    throw new Error("Could not open that indent.", { cause: error });
  }
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

  const [{ data: indent }, lines] = await Promise.all([
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
          "id, item_id, quantity, uom, note, budget_id, line_key, construction_line_id, created_by, updated_by, created_at, items(name, code, thumb_url, brands(name))",
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
        ...lines.map((line) => line.updated_by ?? line.created_by),
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
  const lineIds = lines.map((line) => line.id);
  const orderedFacts = lineIds.length
    ? await fetchAll((from, to) =>
        supabase
          .from("po_line_facts")
          .select("indent_line_id, quantity, po_reference, po_status")
          .in("indent_line_id", lineIds)
          .order("id")
          .range(from, to),
      )
    : [];

  const orderedByLine = new Map<string, { quantity: number; refs: Set<string> }>();
  for (const fact of orderedFacts) {
    if (fact.po_status === "cancelled" || !fact.indent_line_id) continue;
    const entry = orderedByLine.get(fact.indent_line_id) ?? { quantity: 0, refs: new Set() };
    entry.quantity += fact.quantity ?? 0;
    if (fact.po_reference) entry.refs.add(fact.po_reference);
    orderedByLine.set(fact.indent_line_id, entry);
  }

  // Lines anchored to an interiors budget may have drifted: a revision
  // issued AFTER the pull can change or remove the design line they came
  // from. Compare each anchored line (its own revision's selection line)
  // against the unit's latest issued revision, and flag the differences.
  // All money-free reads: approved_budgets, selections, selection_lines.
  const driftByAnchor = new Map<string, DriftStatus>();
  const anchoredBudgetIds = [
    ...new Set(lines.map((line) => line.budget_id).filter((id): id is string => id != null)),
  ];
  if (anchoredBudgetIds.length > 0) {
    const { data: anchorBudgets, error: anchorBudgetsError } = await withRetry(() =>
      supabase
        .from("approved_budgets")
        .select("id, selection_id, unit_id")
        .in("id", anchoredBudgetIds),
    );
    // Throw rather than fall through to an empty list: no rows here reads
    // as "nothing drifted", so a failed read would clear every drift flag
    // on the screen and tell the site team an indent is safe to order
    // when the design under it has changed. Same rule as fetchAll — a
    // read that failed has no partial answer worth showing.
    if (anchorBudgetsError) {
      console.error("indent drift read failed:", anchorBudgetsError);
      throw new Error("Could not check this indent for design changes.", {
        cause: anchorBudgetsError,
      });
    }
    const budgets = (anchorBudgets ?? []).filter(
      (row): row is { id: string; selection_id: string; unit_id: string } =>
        row.id != null && row.selection_id != null && row.unit_id != null,
    );
    const { data: anchorSelections, error: anchorSelectionsError } = budgets.length
      ? await withRetry(() =>
          supabase
            .from("selections")
            .select("id, status")
            .in(
              "id",
              budgets.map((row) => row.selection_id),
            ),
        )
      : { data: [], error: null };
    // Same rule as the read above. An empty answer here means "no anchor
    // revision is still issued", which marks every budget superseded — so
    // a failed read doesn't clear the flags, it invents them. Either way
    // the screen is telling the site team something untrue.
    if (anchorSelectionsError) {
      console.error("indent drift read failed:", anchorSelectionsError);
      throw new Error("Could not check this indent for design changes.", {
        cause: anchorSelectionsError,
      });
    }
    const statusById = new Map((anchorSelections ?? []).map((row) => [row.id, row.status]));
    const superseded = budgets.filter((row) => statusById.get(row.selection_id) !== "issued");

    if (superseded.length > 0) {
      const anchoredKeysByBudget = new Map<string, string[]>();
      for (const line of lines) {
        if (!line.budget_id || !line.line_key) continue;
        const keys = anchoredKeysByBudget.get(line.budget_id) ?? [];
        keys.push(line.line_key);
        anchoredKeysByBudget.set(line.budget_id, keys);
      }

      const { data: issuedSelections, error: issuedSelectionsError } = await withRetry(() =>
        supabase
          .from("selections")
          .select("id, unit_id")
          .in("unit_id", [...new Set(superseded.map((row) => row.unit_id))])
          .eq("status", "issued"),
      );
      // This is the revision the drift is measured AGAINST. No rows reads
      // as "there is nothing newer to compare with", so a failed read
      // leaves every changed and removed line unflagged — the exact
      // silence the throw above exists to prevent.
      if (issuedSelectionsError) {
        console.error("indent drift read failed:", issuedSelectionsError);
        throw new Error("Could not check this indent for design changes.", {
          cause: issuedSelectionsError,
        });
      }
      const issuedByUnit = new Map((issuedSelections ?? []).map((row) => [row.unit_id, row.id]));

      const selectionIds = [
        ...new Set([
          ...superseded.map((row) => row.selection_id),
          ...(issuedSelections ?? []).map((row) => row.id),
        ]),
      ];
      const allKeys = [
        ...new Set(superseded.flatMap((row) => anchoredKeysByBudget.get(row.id) ?? [])),
      ];
      const revisionLines = allKeys.length
        ? await fetchAll((from, to) =>
            supabase
              .from("selection_lines")
              .select("selection_id, line_key, item_id, quantity, unit_space_id")
              .in("selection_id", selectionIds)
              .in("line_key", allKeys)
              .order("id")
              .range(from, to),
          )
        : [];
      const linesBySelection = new Map<string, DriftLine[]>();
      for (const row of revisionLines) {
        const bucket = linesBySelection.get(row.selection_id) ?? [];
        bucket.push(row);
        linesBySelection.set(row.selection_id, bucket);
      }

      for (const budget of superseded) {
        const issuedId = issuedByUnit.get(budget.unit_id);
        const keys = anchoredKeysByBudget.get(budget.id) ?? [];
        if (!issuedId || keys.length === 0) continue;
        const drift = classifyDesignDrift(
          keys,
          linesBySelection.get(budget.selection_id) ?? [],
          linesBySelection.get(issuedId) ?? [],
        );
        for (const [key, status] of drift) {
          driftByAnchor.set(`${budget.id}:${key}`, status);
        }
      }
    }
  }

  const mapped: IndentLineRow[] = lines.map((line) => {
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
      design_drift:
        line.budget_id && line.line_key
          ? (driftByAnchor.get(`${line.budget_id}:${line.line_key}`) ?? null)
          : null,
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

  const { data: plan, error: planError } = await withRetry(() =>
    supabase.from("construction_budgets").select("id, units(name)").eq("unit_id", unitId).single(),
  );
  // "No plan for this unit" and "the read failed" both arrive as a null
  // plan, and returning null here lands the caller on a 404 — which tells
  // the site team the plan doesn't exist. Throw on a genuine failure so
  // they get the retryable error screen instead. PGRST116 is the real
  // "no rows" answer, and keeps the 404.
  if (planError && planError.code !== "PGRST116") {
    console.error("construction pull plan read failed:", planError);
    throw new Error("Could not open the construction plan.", { cause: planError });
  }
  if (!plan) return null;

  const lines = await fetchAll((from, to) =>
    supabase
      .from("construction_budget_lines")
      .select("id, stage, item_id, quantity, uom, note, items(name, code, thumb_url, brands(name))")
      .eq("budget_id", plan.id)
      .order("created_at")
      .order("id")
      .range(from, to),
  );

  const sourceIds = lines.map((line) => line.id);

  // Read to completion: these sums are the "already requested" figure a
  // QS decides on, and a truncated read would under-report it — which
  // reads as "nothing has been ordered yet" and buys the material twice.
  const raised = sourceIds.length
    ? await fetchAll((from, to) =>
        supabase
          .from("indent_lines")
          .select("construction_line_id, quantity, indent_id")
          .in("construction_line_id", sourceIds)
          .order("id")
          .range(from, to),
      )
    : [];

  const requested = new Map<string, number>();
  const onThisIndent = new Set<string>();
  for (const line of raised) {
    const key = line.construction_line_id;
    if (!key) continue;
    requested.set(key, (requested.get(key) ?? 0) + line.quantity);
    if (line.indent_id === indentId) onThisIndent.add(key);
  }

  // First-appearance order, so stages stay in construction order rather
  // than alphabetical — same rule as the plan editor.
  const groups = new Map<string, PullLineRow[]>();
  for (const line of lines) {
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

  const [budgets, { data: issuedSelections }] = await Promise.all([
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
  if (budgets.length === 0) return { pullable: [], pending: [] };

  const issuedByUnit = new Map<string, IssuedRevision>(
    (issuedSelections ?? []).map((row) => [
      row.unit_id,
      { selection_id: row.id, revision_no: row.revision_no },
    ]),
  );

  const candidates: BudgetCandidate[] = budgets
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

  const { data: budget, error: budgetError } = await withRetry(() =>
    supabase
      .from("approved_budgets")
      .select("id, selection_id, unit_id, version")
      .eq("id", budgetId)
      .maybeSingle(),
  );
  // Same rule as getConstructionPull: a failed read must not become a
  // 404 that says this budget isn't there.
  if (budgetError) {
    console.error("indent budget pull read failed:", budgetError);
    throw new Error("Could not open that budget.", { cause: budgetError });
  }
  if (!budget || !budget.selection_id || !budget.unit_id) return null;
  // Captured as locals: TypeScript drops property narrowing inside the
  // retry callbacks below, and these are non-null from here on.
  const budgetUnitId: string = budget.unit_id;
  const budgetSelectionId: string = budget.selection_id;

  // An indent tagged to a unit pulls from that unit alone — the chooser
  // never offers another unit's budget, so arriving here with one is a
  // pasted URL.
  const indent = await getIndentHeader(indentId);
  if (!indent) return null;
  if (indent.unit_id && indent.unit_id !== budget.unit_id) return null;

  const [
    budgetLines,
    selectionLines,
    { data: spaces, error: spacesError },
    { data: selection, error: selectionError },
  ] = await Promise.all([
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
        .eq("selection_id", budgetSelectionId)
        .order("sort_order")
        .order("id")
        .range(from, to),
    ),
    supabase.from("spaces").select("id, label, sort_order").eq("unit_id", budgetUnitId),
    supabase
      .from("selections")
      .select("revision_no, status, units(name)")
      .eq("id", budgetSelectionId)
      .maybeSingle(),
  ]);

  // A failed spaces read would silently label every line "Unassigned";
  // a failed selection read would look exactly like a superseded
  // revision and 404. Neither is worth showing.
  if (spacesError || selectionError) {
    console.error("indent budget pull read failed:", spacesError ?? selectionError);
    throw new Error("Could not open that budget.", { cause: spacesError ?? selectionError });
  }

  // Only the current design revision may be requested against. The
  // chooser already filters; this holds against a stale tab or a pasted
  // URL, and the 0028 trigger backstops the insert itself.
  if (selection?.status !== "issued") return null;

  // Every line already raised against ANY of this unit's budgets, on any
  // indent. line_key is stable across revisions, so a line pulled from
  // R1's budget must show as already asked when R2's budget is on
  // screen — scoping this to one budget_id was the double-buy bug.
  const { data: siblingBudgets, error: siblingBudgetsError } = await withRetry(() =>
    supabase.from("approved_budgets").select("id").eq("unit_id", budgetUnitId),
  );
  // No sibling budgets reads as "nothing has ever been raised for this
  // unit", so every line shows as still to order — which is the
  // double-buy bug arriving by the other door. Throw instead.
  if (siblingBudgetsError) {
    console.error("indent pull sibling budgets read failed:", siblingBudgetsError);
    throw new Error("Could not check what has already been requested for this unit.", {
      cause: siblingBudgetsError,
    });
  }
  const siblingIds = (siblingBudgets ?? [])
    .map((row) => row.id)
    .filter((id): id is string => id != null);

  const raised = await fetchAll((from, to) =>
    supabase
      .from("indent_lines")
      .select("line_key, quantity, indent_id")
      .in("budget_id", siblingIds)
      .order("id")
      .range(from, to),
  );

  const requested = new Map<string, number>();
  const onThisIndent = new Set<string>();
  for (const line of raised) {
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
 * Admins always may; everyone else is either named on
 * `indent_approvers` or holds a role that approves indents (0034).
 * This asks the database's own `can_approve_indents()` — the same
 * function `indents_guard()` calls — so which buttons appear and what
 * the database will actually allow cannot drift apart.
 */
export async function isCurrentUserApprover(): Promise<{
  isAdmin: boolean;
  isApprover: boolean;
}> {
  const user = await requireTool("/indents");
  const supabase = await createClient();

  const isAdmin = user.profile?.role === "admin";
  if (isAdmin) return { isAdmin: true, isApprover: true };

  const { data, error } = await supabase.rpc("can_approve_indents", { uid: user.id });
  // Fail closed: a missing button is recoverable, a dead one isn't.
  if (error) {
    console.error("isCurrentUserApprover failed:", error);
    return { isAdmin: false, isApprover: false };
  }

  return { isAdmin: false, isApprover: data === true };
}

export type ProjectOption = { id: string; name: string; code: string | null };
export type ScopedOption = { id: string; project_id: string; name: string; code: string | null };

export type IndentFormOptions = {
  projects: ProjectOption[];
  plots: ScopedOption[];
  units: (ScopedOption & { plot_id: string | null })[];
  /** The active construction stages (0053) — stage is picked, never typed. */
  stages: string[];
};

/** Everything the new-indent form needs, in one gated call. The masters
 * reads themselves are ungated by design — this wrapper is the gate. */
export async function getIndentFormOptions(): Promise<IndentFormOptions> {
  await requireTool("/indents");
  const [projects, plots, units, stages] = await Promise.all([
    listProjects(),
    listPlots(),
    listUnits(),
    listActiveStageNames(),
  ]);
  return {
    projects: projects.map(({ id, name, code }) => ({ id, name, code })),
    plots: plots.map(({ id, project_id, name, code }) => ({ id, project_id, name, code })),
    units: units.map(({ id, project_id, plot_id, name, code }) => ({
      id,
      project_id,
      plot_id,
      name,
      code,
    })),
    stages,
  };
}
