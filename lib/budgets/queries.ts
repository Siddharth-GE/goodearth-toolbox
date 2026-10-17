import "server-only";

import { requireTool } from "@/lib/auth/access";
import { listVendors } from "@/lib/masters/vendors";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { assertRead } from "@/lib/supabase/read-failed";
import { createClient } from "@/lib/supabase/server";
import { cache } from "react";

import { rollUp, type Totals } from "./math";

// Reads the Selections tables DIRECTLY under the /budgets grant: lib/selections/queries.ts opens with requireTool("/selections") and would redirect a budget-team member without the design grant.

export type BudgetStatus = "pricing" | "approved";

export type InboxRow = {
  selection_id: string;
  unit_id: string;
  unit_name: string;
  project_name: string;
  revision_no: number;
  issued_at: string | null;
  line_count: number;
  budget_id: string | null;
  budget_status: BudgetStatus | null;
  priced_count: number;
};

/** Superseded revisions are excluded: their budgets stay as history. */
export async function listInbox(): Promise<InboxRow[]> {
  await requireTool("/budgets");
  const supabase = await createClient();

  // Line counts ride along as embedded aggregates (two requests in all), still computed by the database, never derived from fetched rows (1,000 cap).
  // Both reads use fetchAll: a silent cap would make an issued revision not exist for Budgets.
  const selections = await fetchAll((from, to) =>
    supabase
      .from("selections")
      .select(
        "id, unit_id, revision_no, issued_at, units(name, projects(name)), selection_lines(count)",
      )
      .eq("status", "issued")
      .order("issued_at", { ascending: false })
      .order("id")
      .range(from, to),
  );

  const selectionIds = selections.map((row) => row.id);
  if (selectionIds.length === 0) return [];

  // The filter on the embedded table scopes the count to priced lines.
  const budgets = await fetchAll((from, to) =>
    supabase
      .from("budgets")
      .select("id, selection_id, status, budget_lines(count)")
      .in("selection_id", selectionIds)
      .eq("budget_lines.budget_status", "priced")
      .order("id")
      .range(from, to),
  );

  const budgetBySelection = new Map(budgets.map((budget) => [budget.selection_id, budget]));

  const embeddedCount = (embed: unknown): number =>
    (embed as { count: number }[] | null)?.[0]?.count ?? 0;

  return selections.map((selection) => {
    const unit = selection.units as { name: string; projects: { name: string } | null } | null;
    const budget = budgetBySelection.get(selection.id);
    return {
      selection_id: selection.id,
      unit_id: selection.unit_id,
      unit_name: unit?.name ?? "—",
      project_name: unit?.projects?.name ?? "—",
      revision_no: selection.revision_no,
      issued_at: selection.issued_at,
      line_count: embeddedCount(selection.selection_lines),
      budget_id: budget?.id ?? null,
      budget_status: (budget?.status as BudgetStatus | undefined) ?? null,
      priced_count: budget ? embeddedCount(budget.budget_lines) : 0,
    };
  });
}

export type BudgetLineRow = {
  id: string | null;
  line_key: string;
  unit_space_id: string;

  item_id: string;
  item_name: string;
  item_code: string | null;
  item_brand: string | null;
  item_thumb_url: string | null;

  uom: string;
  designer_quantity: number;
  indicative_rate: number | null;
  designer_note: string | null;

  quantity: number;
  expected_vendor_id: string | null;
  unit_cost: number | null;
  margin_pct: number | null;
  client_rate: number | null;
  needs_review: boolean;
  notes: string | null;
  sort_order: number;
};

export type BudgetSpaceGroup = {
  space_id: string;
  label: string;
  space_type_name: string;
  lines: BudgetLineRow[];
  totals: Totals;
};

export type BudgetDetail = {
  id: string;
  status: BudgetStatus;
  /** Which pricing of the design revision: R2-v1 is the first quotation; re-opening to fix a rate starts v2 (migration 0012). */
  version: number;
  notes: string | null;
  approved_at: string | null;
  selection_id: string;
  unit_id: string;
  unit_name: string;
  project_name: string;
  revision_no: number;
  issued_at: string | null;
  spaces: BudgetSpaceGroup[];
  totals: Totals;
  /** Carried-forward lines whose quantity the designer has since changed. */
  needsReviewCount: number;
};

/** The selection's lines are the spine: a budget line exists only once touched, yet every line must appear. Matched on `line_key`, never a row id. */
export const getBudget = cache(async (budgetId: string): Promise<BudgetDetail | null> => {
  await requireTool("/budgets");
  const supabase = await createClient();

  const { data: budget } = await supabase
    .from("budgets")
    .select("*, selections(revision_no, issued_at, units(name, projects(name)))")
    .eq("id", budgetId)
    .maybeSingle();
  if (!budget) return null;

  const selection = budget.selections as {
    revision_no: number;
    issued_at: string | null;
    units: { name: string; projects: { name: string } | null } | null;
  } | null;

  // Both line reads use fetchAll: a truncated read would render priced lines unpriced and under-report totals. .order("id") is the unique tiebreaker paging needs.
  const [selectionLines, budgetLines, spacesResult] = await Promise.all([
    fetchAll((from, to) =>
      supabase
        .from("selection_lines")
        .select("*, items(name, code, thumb_url, brands(name))")
        .eq("selection_id", budget.selection_id)
        .order("sort_order")
        .order("created_at")
        .order("id")
        .range(from, to),
    ),
    fetchAll((from, to) =>
      supabase
        .from("budget_lines")
        .select("*")
        .eq("budget_id", budgetId)
        .order("id")
        .range(from, to),
    ),
    supabase
      .from("spaces")
      .select("id, label, sort_order, space_types(name)")
      .eq("unit_id", budget.unit_id)
      .order("sort_order")
      .order("label"),
  ]);

  assertRead("budgets", "the budget's spaces", spacesResult.error);

  const budgetByKey = new Map(budgetLines.map((line) => [line.line_key, line]));

  // Default markup for unpriced lines; saving copies it onto the budget line, so a later change can't re-price done work.
  // Scoped to this budget's items: a capped read would blank some margins, and a blank margin saved is a line sold at cost.
  const itemIds = [...new Set(selectionLines.map((line) => line.item_id))];
  const { data: margins, error: marginsError } = itemIds.length
    ? await supabase.from("item_margins").select("item_id, margin_pct").in("item_id", itemIds)
    : { data: [], error: null };
  assertRead("budgets", "the default margins", marginsError);
  const defaultMargin = new Map(
    (margins ?? []).map((row) => [row.item_id, Number(row.margin_pct)]),
  );

  const lines: BudgetLineRow[] = selectionLines.map((line) => {
    const item = line.items as {
      name: string;
      code: string | null;
      thumb_url: string | null;
      brands: { name: string } | null;
    } | null;
    const priced = budgetByKey.get(line.line_key);
    const designerQuantity = Number(line.quantity);

    return {
      id: priced?.id ?? null,
      line_key: line.line_key,
      unit_space_id: line.unit_space_id,
      item_id: line.item_id,
      item_name: item?.name ?? "(deleted item)",
      item_code: item?.code ?? null,
      item_brand: item?.brands?.name ?? null,
      item_thumb_url: item?.thumb_url ?? null,
      uom: line.uom,
      designer_quantity: designerQuantity,
      indicative_rate:
        line.indicative_rate_snapshot === null ? null : Number(line.indicative_rate_snapshot),
      designer_note: line.designer_note,
      quantity: priced ? Number(priced.quantity) : designerQuantity,
      expected_vendor_id: priced?.expected_vendor_id ?? null,
      unit_cost:
        priced?.unit_cost === null || priced?.unit_cost === undefined
          ? null
          : Number(priced.unit_cost),
      margin_pct:
        priced?.margin_pct === null || priced?.margin_pct === undefined
          ? (defaultMargin.get(line.item_id) ?? null)
          : Number(priced.margin_pct),
      client_rate:
        priced?.client_rate === null || priced?.client_rate === undefined
          ? null
          : Number(priced.client_rate),
      needs_review: priced?.needs_review ?? false,
      notes: priced?.notes ?? null,
      sort_order: line.sort_order,
    };
  });

  const spaces: BudgetSpaceGroup[] = (spacesResult.data ?? [])
    .map((space) => {
      const spaceLines = lines.filter((line) => line.unit_space_id === space.id);
      return {
        space_id: space.id,
        label: space.label as string,
        space_type_name: (space.space_types as { name: string } | null)?.name ?? "—",
        lines: spaceLines,
        totals: rollUp(spaceLines),
      };
    })
    .filter((group) => group.lines.length > 0);

  const unit = selection?.units;
  return {
    id: budget.id,
    status: budget.status as BudgetStatus,
    version: budget.version,
    notes: budget.notes,
    approved_at: budget.approved_at,
    selection_id: budget.selection_id,
    unit_id: budget.unit_id,
    unit_name: unit?.name ?? "—",
    project_name: unit?.projects?.name ?? "—",
    revision_no: selection?.revision_no ?? 0,
    issued_at: selection?.issued_at ?? null,
    spaces,
    totals: rollUp(lines),
    needsReviewCount: lines.filter((line) => line.needs_review).length,
  };
});

export async function listVendorOptions() {
  await requireTool("/budgets");
  const vendors = await listVendors();
  return vendors.map(({ id, name }) => ({ id, name }));
}

export type MarginRow = {
  item_id: string;
  item_name: string;
  item_code: string | null;
  item_brand: string | null;
  margin_pct: number | null;
};

/** A lookup map read to completion: a capped read shows a configured margin as blank, and a blank margin saved is a line sold at cost. */
export async function listMargins(): Promise<Map<string, number>> {
  await requireTool("/budgets");
  const supabase = await createClient();
  const data = await fetchAll((from, to) =>
    supabase.from("item_margins").select("item_id, margin_pct").order("item_id").range(from, to),
  );
  return new Map(data.map((row) => [row.item_id, Number(row.margin_pct)]));
}
