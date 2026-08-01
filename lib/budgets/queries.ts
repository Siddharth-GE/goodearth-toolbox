import "server-only";

import { requireApp } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { cache } from "react";

import { rollUp, type Totals } from "./math";

/**
 * Budgets reads the Selections tables DIRECTLY, under its own grant.
 *
 * It deliberately does not call lib/selections/queries.ts's
 * getBudgetHandoff(): every function in that module opens with
 * requireApp(user, "/selections"), so a budget-team member without the
 * design grant would be redirected away from their own screen. Cross-stage
 * reads belong to the downstream tool — the same rule that lets any tool
 * read lib/masters/* without holding /masters.
 */
async function authorize() {
  const user = await requireUser();
  await requireApp(user, "/budgets");
  return user;
}

export type BudgetStatus = "pricing" | "approved";

export type InboxRow = {
  selection_id: string;
  unit_id: string;
  unit_name: string;
  project_name: string;
  revision_no: number;
  issued_at: string | null;
  line_count: number;
  /** Null when nobody has pressed "Start pricing" yet. */
  budget_id: string | null;
  budget_status: BudgetStatus | null;
  priced_count: number;
};

/**
 * Everything the budget team could work on: issued revisions, whether or
 * not a budget has been started against them.
 *
 * Superseded revisions are excluded — their budgets stay in the database
 * as history, but re-opening one is not work anybody should be offered.
 */
export async function listInbox(): Promise<InboxRow[]> {
  await authorize();
  const supabase = await createClient();

  const { data: selections } = await supabase
    .from("selections")
    .select("id, unit_id, revision_no, issued_at, units(name, projects(name))")
    .eq("status", "issued")
    .order("issued_at", { ascending: false });

  const selectionIds = (selections ?? []).map((row) => row.id);
  if (selectionIds.length === 0) return [];

  // One exact count per revision rather than fetching every line of every
  // issued revision and tallying in JS. At ~200 lines a revision that hit
  // PostgREST's 1000-row ceiling by the sixth one, after which every
  // further revision reported "0 lines waiting" — an inbox quietly
  // telling the budget team there was no work to do.
  const [countResults, budgetsResult] = await Promise.all([
    Promise.all(
      selectionIds.map(async (selectionId) => {
        const { count } = await supabase
          .from("selection_lines")
          .select("id", { count: "exact", head: true })
          .eq("selection_id", selectionId);
        return [selectionId, count ?? 0] as const;
      }),
    ),
    supabase.from("budgets").select("id, selection_id, status").in("selection_id", selectionIds),
  ]);

  const lineCount = new Map(countResults);

  const budgetBySelection = new Map(
    (budgetsResult.data ?? []).map((budget) => [budget.selection_id, budget]),
  );

  // How much of each budget is done, so the inbox can show progress rather
  // than just "in progress". One query for every budget, not one each.
  // Counted per budget, for the same reason as the line counts above.
  const budgetIds = (budgetsResult.data ?? []).map((budget) => budget.id);
  const pricedCount = new Map(
    await Promise.all(
      budgetIds.map(async (budgetId) => {
        const { count } = await supabase
          .from("budget_lines")
          .select("id", { count: "exact", head: true })
          .eq("budget_id", budgetId)
          .eq("budget_status", "priced");
        return [budgetId, count ?? 0] as const;
      }),
    ),
  );

  return (selections ?? []).map((selection) => {
    const unit = selection.units as { name: string; projects: { name: string } | null } | null;
    const budget = budgetBySelection.get(selection.id);
    return {
      selection_id: selection.id,
      unit_id: selection.unit_id,
      unit_name: unit?.name ?? "—",
      project_name: unit?.projects?.name ?? "—",
      revision_no: selection.revision_no,
      issued_at: selection.issued_at,
      line_count: lineCount.get(selection.id) ?? 0,
      budget_id: budget?.id ?? null,
      budget_status: (budget?.status as BudgetStatus | undefined) ?? null,
      priced_count: budget ? (pricedCount.get(budget.id) ?? 0) : 0,
    };
  });
}

export type BudgetLineRow = {
  /** Null until the line has a budget row of its own — see getBudget. */
  id: string | null;
  line_key: string;
  unit_space_id: string;

  item_id: string;
  item_name: string;
  item_code: string | null;
  item_brand: string | null;
  item_thumb_url: string | null;

  uom: string;
  /** What the designer specified. Read-only here, kept for variance. */
  designer_quantity: number;
  /** The item's rate at pick time — a sanity check, not a price. */
  indicative_rate: number | null;
  designer_note: string | null;

  /** The budget team's own figure; starts from the designer's. */
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
  /**
   * Which pricing of this design revision it is. R2-v1 is the first
   * quotation against design revision 2; re-opening it to fix a rate
   * starts v2. The R-number says what was designed, this says what was
   * quoted — see migration 0012.
   */
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
  /**
   * Lines carried forward from the previous revision whose quantity the
   * designer has since changed. Priced, but worth a second look — the
   * screen says so rather than leaving it to be noticed.
   */
  needsReviewCount: number;
};

/**
 * One budget, assembled space by space.
 *
 * The selection's lines are the spine, not the budget's: a budget line
 * exists only for lines someone has touched, and every line of the
 * revision must appear on the pricing screen whether or not it has been
 * priced. Matched on `line_key`, never on a row id — that is the whole
 * reason line_key exists.
 */
export const getBudget = cache(async (budgetId: string): Promise<BudgetDetail | null> => {
  await authorize();
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

  const [linesResult, budgetLinesResult, spacesResult] = await Promise.all([
    supabase
      .from("selection_lines")
      .select("*, items(name, code, thumb_url, brands(name))")
      .eq("selection_id", budget.selection_id)
      .order("sort_order")
      .order("created_at"),
    supabase.from("budget_lines").select("*").eq("budget_id", budgetId),
    supabase
      .from("spaces")
      .select("id, label, sort_order, space_types(name)")
      .eq("unit_id", budget.unit_id)
      .order("sort_order")
      .order("label"),
  ]);

  const budgetByKey = new Map((budgetLinesResult.data ?? []).map((line) => [line.line_key, line]));

  // The product's default markup, shown on lines nobody has priced yet so
  // the field arrives filled in rather than blank. Saving the line copies
  // it onto the budget line, which is what makes a later change to the
  // default unable to re-price work already done.
  //
  // Scoped to the items actually on this budget. Reading the whole table
  // would have meant that once margins were set on more than 1000 of the
  // 2,633 catalogue items, some lines would silently arrive with a blank
  // margin instead of the configured one — and a blank margin that gets
  // saved is a line sold at cost.
  const itemIds = [...new Set((linesResult.data ?? []).map((line) => line.item_id))];
  const { data: margins } = itemIds.length
    ? await supabase.from("item_margins").select("item_id, margin_pct").in("item_id", itemIds)
    : { data: [] };
  const defaultMargin = new Map(
    (margins ?? []).map((row) => [row.item_id, Number(row.margin_pct)]),
  );

  const lines: BudgetLineRow[] = (linesResult.data ?? []).map((line) => {
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
      // Falls back to the designer's figure so an untouched line still
      // shows a sensible quantity and can be priced without editing it.
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
    // A space with nothing in it isn't work; the budget team shouldn't
    // have to scroll past empty rooms.
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
    // Rolled from every line, not by summing the space totals — same
    // numbers, but one source of truth rather than two.
    totals: rollUp(lines),
    needsReviewCount: lines.filter((line) => line.needs_review).length,
  };
});

/** Vendors for the expected-vendor picker on the pricing screen. */
export async function listVendorOptions() {
  await authorize();
  const supabase = await createClient();
  const { data } = await supabase.from("vendors").select("id, name").order("name");
  return data ?? [];
}

export type MarginRow = {
  item_id: string;
  item_name: string;
  item_code: string | null;
  item_brand: string | null;
  margin_pct: number | null;
};

/** The per-product margins already set, keyed by item. */
export async function listMargins(): Promise<Map<string, number>> {
  await authorize();
  const supabase = await createClient();
  const { data } = await supabase.from("item_margins").select("item_id, margin_pct");
  return new Map((data ?? []).map((row) => [row.item_id, Number(row.margin_pct)]));
}
