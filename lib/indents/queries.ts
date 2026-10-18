import "server-only";

import { cache } from "react";

import { requireTool } from "@/lib/auth/access";
import { istDayEndExclusive, istDayStart, type Filterable } from "@/lib/list-params";
import { listPlots } from "@/lib/masters/plots";
import { listProjects } from "@/lib/masters/projects";
import { listWorkCategories, listWorkItems } from "@/lib/masters/works";
import { listUnits } from "@/lib/masters/units";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { assertRead } from "@/lib/supabase/read-failed";
import { createClient } from "@/lib/supabase/server";
import { withRetry } from "@/lib/supabase/transient";

import {
  classifyBudgetChooser,
  classifyDesignDrift,
  type BudgetCandidate,
  type DriftLine,
  type DriftStatus,
  type EstimatePullState as EstimateVerdict,
  factsForWork,
  groupEstimatePull,
  type IssuedRevision,
  requestedByItem,
  workingChangedSince,
} from "./pull-rules";
import { stillToBuy, type IndentStatus } from "./workflow";

// Reads the tables directly under the /indents grant: another tool's queries open with their own requireTool and would redirect a site user.
// No money here: indents carry none, and interiors are read only through the approved_budgets views (0011 boundary).

const INDENTS_LIST_LIMIT = 50;

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
  /** Lines still to buy: requested less live PO orders. Null unless approved. */
  lines_to_buy: number | null;
};

export type IndentListPage = {
  indents: IndentListRow[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
};

export async function getWelcomeCounts() {
  await requireTool("/indents");
  const supabase = await createClient();

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const since = startOfMonth.toISOString();

  const [submitted, drafts, approved] = await Promise.all([
    supabase.from("indents").select("id", { count: "exact", head: true }).eq("status", "submitted"),
    supabase.from("indents").select("id", { count: "exact", head: true }).eq("status", "draft"),
    supabase
      .from("indents")
      .select("id", { count: "exact", head: true })
      .eq("status", "approved")
      .gte("created_at", since),
  ]);

  assertRead("indents", "the welcome counts", submitted.error ?? drafts.error ?? approved.error);

  return {
    awaitingApproval: submitted.count ?? 0,
    drafts: drafts.count ?? 0,
    approvedThisMonth: approved.count ?? 0,
  };
}

export type IndentListFilters = {
  page?: number;
  status?: IndentStatus;
  projectId?: string;
  workItemId?: string;
  q?: string;
  from?: string;
  to?: string;
};

export async function listIndents({
  page = 1,
  status,
  projectId,
  workItemId,
  q,
  from,
  to,
}: IndentListFilters = {}): Promise<IndentListPage> {
  await requireTool("/indents");
  const supabase = await createClient();

  const pageSize = INDENTS_LIST_LIMIT;
  const currentPage = Math.max(1, page);

  // created_at is a timestamp, so the "to" day runs up to the day after it.
  const filtered = <T extends Filterable<T>>(query: T): T => {
    let next = query;
    if (status) next = next.eq("status", status);
    if (projectId) next = next.eq("project_id", projectId);
    if (workItemId) next = next.eq("work_item_id", workItemId);
    if (from) next = next.gte("created_at", istDayStart(from));
    if (to) next = next.lt("created_at", istDayEndExclusive(to));
    if (q) next = next.or(`reference.ilike.*${q}*`);
    return next;
  };

  const { data, count, error } = await filtered(
    supabase
      .from("indents")
      .select(
        "id, reference, status, stage, required_by, created_at, projects(name), units(name), indent_lines(count)",
        { count: "exact" },
      ),
  )
    .order("created_at", { ascending: false })
    .order("id")
    .range((currentPage - 1) * pageSize, currentPage * pageSize - 1);
  // A failed read is an error screen, never an empty list.
  if (error) {
    console.error("listIndents failed:", error);
    throw new Error("Could not read the indents.", { cause: error });
  }

  const linesToBuy = await countLinesToBuy(
    supabase,
    data.filter((row) => row.status === "approved").map((row) => row.id),
  );

  const total = count ?? 0;
  return {
    indents: data.map((row) => ({
      id: row.id,
      reference: row.reference ?? "—",
      status: row.status as IndentStatus,
      stage: row.stage,
      required_by: row.required_by,
      created_at: row.created_at,
      project_name: (row.projects as { name: string } | null)?.name ?? "—",
      unit_name: (row.units as { name: string } | null)?.name ?? null,
      line_count: (row.indent_lines as { count: number }[] | null)?.[0]?.count ?? 0,
      lines_to_buy: row.status === "approved" ? (linesToBuy.get(row.id) ?? 0) : null,
    })),
    total,
    page: currentPage,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    pageSize,
  };
}

/** Lines still to buy per indent, from the money-free po_line_facts (0022). Summed, so fetchAll. */
async function countLinesToBuy(
  supabase: Awaited<ReturnType<typeof createClient>>,
  indentIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (indentIds.length === 0) return counts;

  const lines = await fetchAll((rangeFrom, rangeTo) =>
    supabase
      .from("indent_lines")
      .select("id, indent_id, quantity")
      .in("indent_id", indentIds)
      .order("id")
      .range(rangeFrom, rangeTo),
  );
  const lineIds = lines.map((line) => line.id);
  const facts = lineIds.length
    ? await fetchAll((rangeFrom, rangeTo) =>
        supabase
          .from("po_line_facts")
          .select("indent_line_id, quantity, po_status")
          .in("indent_line_id", lineIds)
          .order("id")
          .range(rangeFrom, rangeTo),
      )
    : [];

  const ordered = new Map<string, number>();
  for (const fact of facts) {
    if (fact.po_status === "cancelled" || !fact.indent_line_id) continue;
    ordered.set(
      fact.indent_line_id,
      (ordered.get(fact.indent_line_id) ?? 0) + (fact.quantity ?? 0),
    );
  }

  for (const line of lines) {
    if (stillToBuy(line.quantity, ordered.get(line.id) ?? 0) > 0) {
      counts.set(line.indent_id, (counts.get(line.indent_id) ?? 0) + 1);
    }
  }
  return counts;
}

export async function getIndentFilterOptions(): Promise<{
  projects: { id: string; name: string }[];
  works: { id: string; label: string }[];
}> {
  await requireTool("/indents");
  const [projects, workItems] = await Promise.all([listProjects(), listWorkItems()]);
  return {
    projects: projects.map(({ id, name }) => ({ id, name })),
    works: workItems
      .filter((work) => work.is_active)
      .map((work) => ({ id: work.id, label: `${work.name} — ${work.code}` })),
  };
}

export type IndentLineSource = "direct" | "construction" | "interiors" | "estimate";

export type IndentLineRow = {
  id: string;
  item_id: string;
  item_name: string;
  item_code: string | null;
  item_brand: string | null;
  item_thumb_url: string | null;
  quantity: number;
  uom: string;
  /** Lines move in the item's Masters unit (interiors excepted); another unit shows a warning. */
  item_default_uom: string | null;
  note: string | null;
  source: IndentLineSource;
  updated_by_name: string | null;
  ordered_quantity: number;
  ordered_po_refs: string | null;
  /** Set when a design revision issued after the pull changed or removed this line. */
  design_drift: "changed" | "removed" | null;
  /** Why a line outside the estimate is needed (0113); null on the rest. */
  off_estimate_reason: string | null;
  /** The estimator's answer on a line outside the estimate (0113). */
  estimator: {
    decision: "approved" | "refused";
    by_name: string | null;
    at: string;
    note: string | null;
  } | null;
};

export type IndentDetail = {
  id: string;
  reference: string;
  status: IndentStatus;
  stage: string | null;
  work_item_id: string | null;
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
  work_item_id: string | null;
};

export const getIndentHeader = cache(async (indentId: string): Promise<IndentHeader | null> => {
  await requireTool("/indents");
  const supabase = await createClient();
  const { data, error } = await withRetry(() =>
    supabase
      .from("indents")
      .select("id, reference, status, project_id, unit_id, work_item_id, projects(name)")
      .eq("id", indentId)
      .maybeSingle(),
  );
  // Throw: both pull screens turn a null header into notFound(), so a swallowed error reads as "no such indent".
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
    work_item_id: data.work_item_id,
  };
});

export const getIndent = cache(async (indentId: string): Promise<IndentDetail | null> => {
  await requireTool("/indents");
  const supabase = await createClient();

  const [{ data: indent, error: indentError }, lines] = await Promise.all([
    supabase
      .from("indents")
      .select(
        "id, reference, status, stage, work_item_id, required_by, note, rejection_note, project_id, unit_id, created_at, submitted_by, submitted_at, approved_by, approved_at, projects(name), plots(name), units(name)",
      )
      .eq("id", indentId)
      .maybeSingle(),
    fetchAll((from, to) =>
      supabase
        .from("indent_lines")
        .select(
          "id, item_id, quantity, uom, note, budget_id, line_key, construction_line_id, estimate_id, off_estimate_reason, estimator_decision, estimator_decided_by, estimator_decided_at, estimator_note, created_by, updated_by, created_at, items(name, code, thumb_url, default_uom, brands(name))",
        )
        .eq("indent_id", indentId)
        .order("created_at")
        .order("id")
        .range(from, to),
    ),
  ]);

  assertRead("indents", "this indent", indentError);
  if (!indent) return null;

  // One profiles read, not embeds (several FKs to profiles).
  const actorIds = [
    ...new Set(
      [
        indent.submitted_by,
        indent.approved_by,
        ...lines.map((line) => line.updated_by ?? line.created_by),
        ...lines.map((line) => line.estimator_decided_by),
      ].filter((id): id is string => id != null),
    ),
  ];
  const { data: profiles } = actorIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", actorIds)
    : { data: [] };
  const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name]));
  const nameOf = (id: string | null | undefined) => (id ? (names.get(id) ?? null) : null);

  // Money-free po_line_facts (0022), summed, so read to completion.
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

  // Anchored lines may have drifted: compare each to the unit's latest issued revision.
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
    // Throw: an empty result would read as "nothing drifted" and clear every flag.
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
    // Throw: an empty result would mark every budget superseded.
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
      // Throw: an empty result would leave every changed line unflagged.
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
      default_uom: string | null;
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
      item_default_uom: item?.default_uom ?? null,
      note: line.note,
      source:
        line.budget_id != null
          ? "interiors"
          : line.construction_line_id != null
            ? "construction"
            : line.estimate_id != null
              ? "estimate"
              : "direct",
      updated_by_name: nameOf(line.updated_by ?? line.created_by),
      ordered_quantity: ordered?.quantity ?? 0,
      ordered_po_refs: ordered ? [...ordered.refs].sort().join(", ") : null,
      design_drift:
        line.budget_id && line.line_key
          ? (driftByAnchor.get(`${line.budget_id}:${line.line_key}`) ?? null)
          : null,
      off_estimate_reason: line.off_estimate_reason,
      estimator:
        (line.estimator_decision === "approved" || line.estimator_decision === "refused") &&
        line.estimator_decided_at
          ? {
              decision: line.estimator_decision,
              by_name: nameOf(line.estimator_decided_by),
              at: line.estimator_decided_at,
              note: line.estimator_note,
            }
          : null,
    };
  });

  return {
    id: indent.id,
    reference: indent.reference ?? "—",
    status: indent.status as IndentStatus,
    stage: indent.stage,
    work_item_id: indent.work_item_id,
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

// Pull path 1 (the construction plan) is retired; the "construction" source and indent_lines.construction_line_id stay for historic lines.

export type PullLineRow = {
  source_id: string;
  item_id: string;
  item_name: string;
  item_code: string | null;
  item_brand: string | null;
  item_thumb_url: string | null;
  uom: string;
  planned_quantity: number;
  already_requested: number;
  /** Already a line on this indent: the unique (indent_id, source) pair forbids adding it twice. */
  on_this_indent: boolean;
  note: string | null;
};

// Pull path 2 reads only the approved_budgets / approved_budget_lines views (0019), the one window through the 0011 margin RLS.
// Never select from budgets or budget_lines here: zero rows under /indents, a margin leak under /budgets.

export type ApprovedBudgetOption = {
  budget_id: string;
  unit_id: string;
  unit_name: string;
  revision_no: number;
  version: number;
  approved_at: string | null;
};

export type PendingBudgetUnit = {
  unit_name: string;
  revision_no: number;
};

export type BudgetChooser = {
  pullable: ApprovedBudgetOption[];
  pending: PendingBudgetUnit[];
};

/** Approved budgets to offer: only each unit's current issued revision, since a superseded one is how a line gets bought twice. */
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

  const [budgets, { data: issuedSelections, error: selectionsError }] = await Promise.all([
    fetchAll((from, to) =>
      supabase
        .from("approved_budgets")
        .select("id, selection_id, unit_id, version, approved_at")
        .in("unit_id", unitIds)
        .order("id")
        .range(from, to),
    ),
    // At most one issued selection per unit (issue_selection supersedes the last).
    supabase
      .from("selections")
      .select("id, unit_id, revision_no")
      .in("unit_id", unitIds)
      .eq("status", "issued"),
  ]);
  assertRead("indents", "the issued designs", selectionsError);
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

/** Lines show the budget's quantity (what was costed); item, uom and space come from selection_lines on (selection_id, line_key). */
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
  if (budgetError) {
    console.error("indent budget pull read failed:", budgetError);
    throw new Error("Could not open that budget.", { cause: budgetError });
  }
  if (!budget || !budget.selection_id || !budget.unit_id) return null;
  const budgetUnitId: string = budget.unit_id;
  const budgetSelectionId: string = budget.selection_id;

  // A unit-tagged indent pulls from that unit alone; a pasted URL could name another.
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

  // A failed read must not look like a missing budget or a superseded revision.
  if (spacesError || selectionError) {
    console.error("indent budget pull read failed:", spacesError ?? selectionError);
    throw new Error("Could not open that budget.", { cause: spacesError ?? selectionError });
  }

  // Only the current revision may be requested against (the 0028 trigger backstops).
  if (selection?.status !== "issued") return null;

  // Lines raised against ANY of the unit's budgets: line_key is stable across revisions, so scoping to one budget double-buys.
  const { data: siblingBudgets, error: siblingBudgetsError } = await withRetry(() =>
    supabase.from("approved_budgets").select("id").eq("unit_id", budgetUnitId),
  );
  // Throw: no sibling rows would show every line as still to order.
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
    // Skip a budget line whose selection line has gone.
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

/** May the user decide on a submitted indent? Asks the database's can_approve_indents() (0034), as indents_guard() does. */
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
  works: { id: string; code: string; name: string; category: string }[];
};

export async function getIndentFormOptions(): Promise<IndentFormOptions> {
  await requireTool("/indents");
  const [projects, plots, units, workItems, workCategories] = await Promise.all([
    listProjects(),
    listPlots(),
    listUnits(),
    listWorkItems(),
    listWorkCategories(),
  ]);
  const categoryNameById = new Map(workCategories.map((c) => [c.id, c.name]));
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
    works: workItems
      .filter((work) => work.is_active)
      .map((work) => ({
        id: work.id,
        code: work.code,
        name: work.name,
        category: categoryNameById.get(work.category_id) ?? "Other",
      })),
  };
}

// Pull path 3 reads estimate_takeoff_facts (money-free, 0077 snapshot).
// Aggregated per item: the anchor dedupes on (indent, estimate, item), so one row per item cannot double-buy.

export type EstimatePullState = EstimateVerdict["state"];

export type EstimatePullRow = {
  /** The item's id, or "unlinked:<name>" for an older row naming none. */
  key: string;
  estimate_name: string;
  estimate_parts: { quantity: number; uom: string }[];
  work_count: number;
  item_id: string | null;
  item_name: string | null;
  item_code: string | null;
  item_thumb_url: string | null;
  item_default_uom: string | null;
  state: EstimatePullState;
  prefill_qty: number | null;
  already_requested: number;
  already_requested_for_work: number | null;
  on_this_indent: boolean;
};

export type EstimatePull = {
  estimate_id: string;
  reference: string;
  submitted_at: string | null;
  /** The villa's working estimate changed after this copy was made (0109). */
  working_changed_at: string | null;
  unit_name: string;
  rows: EstimatePullRow[];
  /** Rows of an older estimate that name no catalogue item. */
  unlinked_count: number;
  work: { id: string; label: string } | null;
  indent_work: { id: string; label: string } | null;
  other_work_material_count: number;
};

/** One row per item, with what is already requested against the villa's estimates. Null when the estimate has no materials. */
export async function getEstimatePull(
  unitId: string,
  indentId: string,
  indentWorkItemId: string | null,
  allWorks: boolean,
): Promise<EstimatePull | null> {
  await requireTool("/indents");
  const supabase = await createClient();

  // Read to completion. View columns are all nullable: guard on what a row cannot do without, NOT on material_id (BUGCATCHER #16).
  const facts = await fetchAll<{
    estimate_id: string | null;
    reference: string | null;
    submitted_at: string | null;
    work_item_id: string | null;
    material_name: string | null;
    uom: string | null;
    quantity: number | null;
    item_id: string | null;
    item_uom_factor: number | null;
    working_updated_at: string | null;
  }>((from, to) =>
    supabase
      .from("estimate_takeoff_facts")
      .select(
        "estimate_id, reference, submitted_at, work_item_id, material_name, uom, quantity, item_id, item_uom_factor, working_updated_at",
      )
      .eq("unit_id", unitId)
      .order("work_item_id")
      .order("item_id")
      .order("material_name")
      .range(from, to),
  );
  const usable = facts.filter(
    (
      fact,
    ): fact is typeof fact & {
      estimate_id: string;
      material_name: string;
      uom: string;
      quantity: number;
    } =>
      fact.estimate_id !== null &&
      fact.material_name !== null &&
      fact.uom !== null &&
      fact.quantity !== null,
  );
  if (usable.length === 0) return null;
  const head = usable[0];

  const workItemId = allWorks ? null : indentWorkItemId;
  const offered = factsForWork(usable, workItemId);
  const otherWorkItems = new Set(
    usable
      .filter((fact) => workItemId && fact.work_item_id !== workItemId)
      .map((fact) => fact.item_id ?? `unlinked:${fact.material_name}`),
  );

  const itemIds = [
    ...new Set(offered.map((fact) => fact.item_id).filter((id): id is string => !!id)),
  ];

  // The villa's indents, so the double-buy figure spans every estimate it has had.
  const { data: villaIndents, error: indentsError } = await supabase
    .from("indents")
    .select("id, work_item_id")
    .eq("unit_id", unitId);
  if (indentsError) {
    console.error("estimate pull indents read failed:", indentsError);
    throw new Error("Could not open the estimate.", { cause: indentsError });
  }
  const villaIndentIds = (villaIndents ?? []).map((indent) => indent.id);
  const workByIndent = new Map(
    (villaIndents ?? []).map((indent) => [indent.id, indent.work_item_id]),
  );

  const [items, raised] = await Promise.all([
    itemIds.length
      ? fetchAll<{
          id: string;
          name: string;
          code: string | null;
          thumb_url: string | null;
          default_uom: string;
        }>((from, to) =>
          supabase
            .from("items")
            .select("id, name, code, thumb_url, default_uom")
            .in("id", itemIds)
            .order("id")
            .range(from, to),
        )
      : Promise.resolve([]),
    villaIndentIds.length
      ? fetchAll<{ item_id: string; quantity: number; indent_id: string }>((from, to) =>
          supabase
            .from("indent_lines")
            .select("item_id, quantity, indent_id")
            .in("indent_id", villaIndentIds)
            .not("estimate_id", "is", null)
            .order("id")
            .range(from, to),
        )
      : Promise.resolve([]),
  ]);

  const itemById = new Map(items.map((item) => [item.id, item]));
  const { requested, forWork, onThisIndent } = requestedByItem(
    raised.map((line) => ({ ...line, work_item_id: workByIndent.get(line.indent_id) ?? null })),
    indentId,
    workItemId,
  );

  const labelWorkIds = [workItemId, indentWorkItemId].filter((id): id is string => !!id);
  const { data: works, error: worksError } = labelWorkIds.length
    ? await supabase.from("work_items").select("id, code, name").in("id", labelWorkIds)
    : { data: [], error: null };
  if (worksError) {
    console.error("estimate pull works read failed:", worksError);
    throw new Error("Could not open the estimate.", { cause: worksError });
  }
  const workLabel = (id: string | null) => {
    const work = id ? (works ?? []).find((row) => row.id === id) : undefined;
    return work && id ? { id, label: `${work.name} — ${work.code}` } : null;
  };

  const { data: unit, error: unitError } = await supabase
    .from("units")
    .select("name")
    .eq("id", unitId)
    .maybeSingle();
  if (unitError) {
    console.error("estimate pull unit read failed:", unitError);
    throw new Error("Could not open the estimate.", { cause: unitError });
  }

  const groups = groupEstimatePull(
    offered,
    new Map(items.map((item) => [item.id, item.default_uom])),
  );
  const rows: EstimatePullRow[] = groups
    .map((group) => {
      const item = group.item_id ? itemById.get(group.item_id) : undefined;
      return {
        key: group.key,
        estimate_name: group.estimate_name,
        estimate_parts: group.estimate_parts,
        work_count: group.work_count,
        item_id: group.item_id,
        item_name: item?.name ?? null,
        item_code: item?.code ?? null,
        item_thumb_url: item?.thumb_url ?? null,
        item_default_uom: item?.default_uom ?? null,
        state: group.verdict.state,
        prefill_qty: group.verdict.state === "ready" ? group.verdict.prefillQty : null,
        already_requested: group.item_id ? (requested.get(group.item_id) ?? 0) : 0,
        already_requested_for_work:
          workItemId && group.item_id ? (forWork.get(group.item_id) ?? 0) : null,
        on_this_indent: group.item_id ? onThisIndent.has(group.item_id) : false,
      };
    })
    .sort((a, b) => (a.item_name ?? a.estimate_name).localeCompare(b.item_name ?? b.estimate_name));

  return {
    estimate_id: head.estimate_id,
    reference: head.reference ?? "—",
    submitted_at: head.submitted_at,
    working_changed_at: workingChangedSince(head.submitted_at, head.working_updated_at),
    unit_name: unit?.name ?? "—",
    rows,
    unlinked_count: rows.filter((row) => row.state === "unlinked").length,
    work: workLabel(workItemId),
    indent_work: workLabel(indentWorkItemId),
    other_work_material_count: otherWorkItems.size,
  };
}
