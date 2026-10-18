import "server-only";

import { requireTool } from "@/lib/auth/access";
import { listUnits } from "@/lib/masters/units";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { assertRead } from "@/lib/supabase/read-failed";
import { createClient } from "@/lib/supabase/server";
import { withRetry } from "@/lib/supabase/transient";

import { getIndentHeader } from "./detail-queries";
import {
  classifyBudgetChooser,
  type BudgetCandidate,
  type EstimatePullState as EstimateVerdict,
  factsForWork,
  groupEstimatePull,
  type IssuedRevision,
  requestedByItem,
  workingChangedSince,
} from "./pull-rules";

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
