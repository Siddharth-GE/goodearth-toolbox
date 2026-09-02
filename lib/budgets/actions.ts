"use server";

import { requireTool } from "@/lib/auth/access";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// Safe to import as a value from a "use server" file: carry-forward.ts is
// pure and imports nothing, so it drags no server-only chain behind it.
import { planCarryForward } from "./carry-forward";

// Type-only import, and deliberately NOT re-exported: a bare
// `export type { X };` in a "use server" file survives into the compiled
// module's runtime export list, where X doesn't exist — every action in
// the chunk then dies at module load ("ActionState is not defined", the
// 2026-08-03 production outage). Import ActionState from
// "@/lib/action-state" directly instead.
import type { ActionState } from "@/lib/action-state";

// ---------------------------------------------------------------------
// Starting a budget
// ---------------------------------------------------------------------

/**
 * Opens a budget against an issued revision.
 *
 * Budgets creates this row itself — Selections has no idea Budgets exists,
 * and that one-way coupling is what lets later tools consume a revision
 * without Selections ever being touched again.
 *
 * For a first revision only the header is written: the pricing screen
 * takes its spine from the revision's own lines, so every line shows up
 * whether or not it has a budget row yet, and lines are created the moment
 * someone prices one (see saveLine).
 *
 * For R+1 onward this also CARRIES PRICING FORWARD from the previous
 * revision's budget — the point of the whole line_key design. See
 * carryForward below.
 */
export async function startPricing(selectionId: string): Promise<ActionState> {
  const user = await requireTool("/budgets");
  const supabase = await createClient();

  const { data: selection, error: selectionError } = await supabase
    .from("selections")
    .select("id, unit_id, revision_no, status")
    .eq("id", selectionId)
    .maybeSingle();

  if (selectionError || !selection) {
    console.error("startPricing lookup failed:", selectionError);
    return { error: "Could not find that revision." };
  }
  if (selection.status !== "issued") {
    return { error: "Only an issued revision can be priced." };
  }

  const { data, error } = await supabase
    .from("budgets")
    .insert({
      selection_id: selectionId,
      unit_id: selection.unit_id,
      status: "pricing",
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) {
    // 23505 = selection_id is unique. Two people pressed Start pricing at
    // once; the loser should land on the budget rather than see an error.
    if (error.code === "23505") {
      const { data: existing, error: existingError } = await supabase
        .from("budgets")
        .select("id")
        .eq("selection_id", selectionId)
        .maybeSingle();
      if (existingError) console.error("startPricing re-read failed:", existingError);
      if (existing) redirect(`/budgets/${existing.id}`);
    }
    console.error("startPricing failed:", error);
    return { error: "Could not start this budget. Try again." };
  }

  const carryError = await carryForward(supabase, {
    budgetId: data.id,
    selectionId,
    unitId: selection.unit_id,
    revisionNo: selection.revision_no,
  });
  if (carryError) {
    // Leaving the budget behind would be worse than failing: it would
    // look like a revision nobody has priced, and the team would redo
    // work they had already done. Removing it makes this retryable.
    const { error: cleanupError } = await supabase.from("budgets").delete().eq("id", data.id);
    if (cleanupError) {
      // The cleanup itself failed, so a budget row survives and
      // selection_id is unique — every retry from here would fail on the
      // duplicate key with a message about carry-forward, which explains
      // nothing. Say what actually happened instead of swallowing it.
      console.error("startPricing cleanup failed:", cleanupError);
      return {
        error:
          "This budget was left half-started and could not be cleared automatically. Open it from the list, or ask an admin to remove it.",
      };
    }
    return { error: carryError };
  }

  revalidatePath("/budgets", "layout");
  redirect(`/budgets/${data.id}`);
}

/**
 * Copies the previous revision's pricing into a new budget.
 *
 * Matched on `line_key`, which `create_next_revision()` carries forward
 * when a designer branches R+1 (migration 0007). Without this, issuing R3
 * with one changed quantity would hand the budget team a blank sheet for
 * all 200 lines — the single most likely reason they'd stop using this
 * and go back to a spreadsheet.
 *
 * The decision rules live in carry-forward.ts, pure and tested. This
 * function only fetches and writes.
 */
type BudgetsClient = Awaited<ReturnType<typeof createClient>>;

// Split out only so carryForward's three completeness-critical reads can
// be named in a `let` above the try that catches them.
function readPreviousBudgetLines(supabase: BudgetsClient, budgetId: string) {
  return fetchAll((from, to) =>
    supabase
      .from("budget_lines")
      .select("line_key, quantity, expected_vendor_id, unit_cost, margin_pct, notes")
      .eq("budget_id", budgetId)
      .order("line_key")
      .range(from, to),
  );
}

function readSelectionQuantities(supabase: BudgetsClient, selectionId: string) {
  return fetchAll((from, to) =>
    supabase
      .from("selection_lines")
      .select("line_key, quantity")
      .eq("selection_id", selectionId)
      .order("line_key")
      .range(from, to),
  );
}

async function carryForward(
  supabase: BudgetsClient,
  {
    budgetId,
    selectionId,
    unitId,
    revisionNo,
  }: {
    budgetId: string;
    selectionId: string;
    unitId: string;
    revisionNo: number;
  },
): Promise<string | null> {
  // Every budget this unit already has, with the revision it prices.
  // Filtered and sorted here rather than in the query: a unit has a
  // handful of revisions, and ordering by an embedded column is more
  // trouble in PostgREST than it's worth.
  const { data: priorBudgets, error: priorBudgetsError } = await supabase
    .from("budgets")
    .select("id, selection_id, selections(revision_no)")
    .eq("unit_id", unitId);

  // Checked, because "no rows" and "the read failed" mean opposite
  // things three lines below: an empty list is read as "a first budget
  // for this unit, nothing to carry" and returns null, so an unchecked
  // failure here would silently hand the budget team a blank sheet for
  // lines they had already priced — the same data loss fetchAll exists
  // to prevent, arriving by a different door.
  if (priorBudgetsError) {
    console.error("carryForward read failed:", priorBudgetsError);
    return "Could not read the previous budget. Try again.";
  }

  const previous = (priorBudgets ?? [])
    .map((budget) => ({
      id: budget.id,
      selection_id: budget.selection_id,
      revision_no: (budget.selections as { revision_no: number } | null)?.revision_no ?? -1,
    }))
    .filter((budget) => budget.revision_no >= 0 && budget.revision_no < revisionNo)
    .sort((a, b) => b.revision_no - a.revision_no)[0];

  // A first budget for the unit. Nothing to carry, and not an error.
  if (!previous) return null;

  // Read to COMPLETION, not to PostgREST's silent 1,000-row cap. A
  // truncated read here doesn't fail — it quietly hands the budget team a
  // blank sheet for lines they already priced, which is the single most
  // likely reason they'd abandon the tool for a spreadsheet.
  // fetchAll raises rather than handing back a partial list; caught here
  // because this feeds a Server Action, which answers with a message.
  let previousBudgetLines: Awaited<ReturnType<typeof readPreviousBudgetLines>>;
  let previousSelectionLines: Awaited<ReturnType<typeof readSelectionQuantities>>;
  let currentSelectionLines: Awaited<ReturnType<typeof readSelectionQuantities>>;
  try {
    [previousBudgetLines, previousSelectionLines, currentSelectionLines] = await Promise.all([
      readPreviousBudgetLines(supabase, previous.id),
      readSelectionQuantities(supabase, previous.selection_id),
      readSelectionQuantities(supabase, selectionId),
    ]);
  } catch (error) {
    console.error("carryForward read failed:", error);
    return "Could not read the previous budget. Try again.";
  }

  const plan = planCarryForward({
    previousBudgetLines: previousBudgetLines.map((line) => ({
      line_key: line.line_key,
      quantity: Number(line.quantity),
      expected_vendor_id: line.expected_vendor_id,
      unit_cost: line.unit_cost === null ? null : Number(line.unit_cost),
      margin_pct: line.margin_pct === null ? null : Number(line.margin_pct),
      notes: line.notes,
    })),
    previousSelectionLines: previousSelectionLines.map((line) => ({
      line_key: line.line_key,
      quantity: Number(line.quantity),
    })),
    currentSelectionLines: currentSelectionLines.map((line) => ({
      line_key: line.line_key,
      quantity: Number(line.quantity),
    })),
  });

  if (plan.lines.length === 0) return null;

  const { error } = await supabase.from("budget_lines").insert(
    plan.lines.map((line) => ({
      budget_id: budgetId,
      selection_id: selectionId,
      line_key: line.line_key,
      quantity: line.quantity,
      expected_vendor_id: line.expected_vendor_id,
      unit_cost: line.unit_cost,
      margin_pct: line.margin_pct,
      notes: line.notes,
      needs_review: line.needs_review,
      // priced_by stays null: nobody priced these in this budget. The
      // budget they came from still records who did.
    })),
  );

  if (error) {
    console.error("carryForward insert failed:", error);
    return "Could not carry the previous pricing forward. Try again.";
  }

  return null;
}

// ---------------------------------------------------------------------
// Pricing a line
// ---------------------------------------------------------------------

export type LineInput = {
  quantity: number;
  expectedVendorId: string | null;
  unitCost: number | null;
  marginPct: number | null;
  notes: string | null;
};

/**
 * Saves one line's pricing, creating its budget row if this is the first
 * time anyone has touched it.
 *
 * `client_rate` is deliberately absent: it is a generated column in the
 * database (migration 0011), so the internal budget sheet and the client
 * quote cannot drift apart, and nothing the app sends could disagree with
 * it. lib/budgets/math.ts computes the same figure only so the screen can
 * show it live before saving.
 *
 * No revalidatePath, following the Selections line grid: the row on screen
 * already shows what was typed, and revalidating would re-run every query
 * on the page each time someone tabs out of a field. Totals update from
 * local state and are re-read from the database on the next full load.
 */
export async function saveLine(
  budgetId: string,
  selectionId: string,
  lineKey: string,
  input: LineInput,
): Promise<ActionState> {
  const user = await requireTool("/budgets");

  if (!(input.quantity > 0)) return { error: "Quantity must be more than zero." };
  if (input.unitCost !== null && input.unitCost < 0) return { error: "Cost cannot be negative." };
  if (input.marginPct !== null && input.marginPct < 0)
    return { error: "Margin cannot be negative." };

  const supabase = await createClient();
  const { error } = await supabase.from("budget_lines").upsert(
    {
      budget_id: budgetId,
      selection_id: selectionId,
      line_key: lineKey,
      quantity: input.quantity,
      expected_vendor_id: input.expectedVendorId,
      unit_cost: input.unitCost,
      // A blank margin on a priced line means 0% — charged exactly cost,
      // and said so. Migration 0017 forbids the ambiguous state (a cost
      // with a NULL margin printed an empty rate on the client quote while
      // its at-cost value hid inside the total); the coalesce here is what
      // keeps clearing the margin field a valid way to say "no markup".
      margin_pct: input.unitCost === null ? input.marginPct : (input.marginPct ?? 0),
      notes: input.notes?.trim() || null,
      // Clearing the flag is the point of editing a carried-forward line:
      // someone has now looked at it.
      needs_review: false,
      priced_by: user.id,
      priced_at: new Date().toISOString(),
      // updated_at is the set_updated_at trigger's job (migration 0016).
    },
    { onConflict: "budget_id,line_key" },
  );

  if (error) {
    // Raised by budget_lines_pricing_only() when the budget is approved.
    if (error.message.includes("re-open it before changing prices")) {
      return { error: "This budget is approved. Re-open it before changing prices." };
    }
    console.error("saveLine failed:", error);
    return { error: "Could not save that line. Try again." };
  }

  return undefined;
}

// ---------------------------------------------------------------------
// Approval
// ---------------------------------------------------------------------

/**
 * Locks the budget's prices.
 *
 * The "every line priced" rule is checked twice on purpose. Here, so an
 * incomplete budget gets a message that says how many lines are missing;
 * and in budgets_guard() (migration 0017), which compares the budget's
 * row count against the revision's line count under the row lock — the
 * backstop that holds even for a write this function never sees.
 */
export async function approveBudget(budgetId: string): Promise<ActionState> {
  const user = await requireTool("/budgets");
  const supabase = await createClient();

  const { data: budget } = await supabase
    .from("budgets")
    .select("id, selection_id, status")
    .eq("id", budgetId)
    .maybeSingle();
  if (!budget) return { error: "Could not find that budget." };
  if (budget.status === "approved") return { error: "This budget is already approved." };

  // Exact database counts, never rows.length — an un-ranged read caps at
  // 1,000 rows, and deriving this check from one could approve a budget
  // with unpriced lines and then lock the trigger against fixing them.
  // Every priced budget line references a line of this same revision
  // (composite FK, migration 0011), so priced is a subset of total and
  // the subtraction is safe.
  const [totalResult, pricedResult] = await Promise.all([
    supabase
      .from("selection_lines")
      .select("id", { count: "exact", head: true })
      .eq("selection_id", budget.selection_id),
    supabase
      .from("budget_lines")
      .select("id", { count: "exact", head: true })
      .eq("budget_id", budgetId)
      .eq("budget_status", "priced"),
  ]);
  if (totalResult.error || pricedResult.error) {
    console.error("approveBudget count failed:", totalResult.error ?? pricedResult.error);
    return { error: "Could not check this budget's lines. Try again." };
  }

  const total = totalResult.count ?? 0;
  if (total === 0) return { error: "There is nothing to approve — this revision has no items." };

  const missing = total - (pricedResult.count ?? 0);
  if (missing > 0) {
    return {
      error: `${missing} of ${total} ${missing === 1 ? "line still needs" : "lines still need"} a cost before this can be approved.`,
    };
  }

  const { error } = await supabase
    .from("budgets")
    .update({
      status: "approved",
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    })
    .eq("id", budgetId);

  if (error) {
    console.error("approveBudget failed:", error);
    return { error: "Could not approve this budget. Try again." };
  }

  revalidatePath("/budgets", "layout");
  return undefined;
}

/**
 * Unlocks an approved budget so a genuine pricing error can be corrected,
 * and starts the next version of it.
 *
 * Deliberately possible, unlike un-issuing a design revision: a cost
 * estimate is fallible in a way a specification is not, and the
 * alternative — a whole new revision to fix one wrong rate — would be
 * worse. The version bump is what keeps that from being lossy: the
 * quotation already sent stays identified as v1, and everything priced
 * from here becomes v2.
 *
 * Runs as a database function because the version increments from its own
 * current value; doing that as a read-then-write would let two people
 * re-opening at once both produce v2. See migration 0012.
 */
export async function reopenBudget(budgetId: string): Promise<ActionState> {
  await requireTool("/budgets");
  const supabase = await createClient();

  const { error } = await supabase.rpc("reopen_budget", { p_budget_id: budgetId });

  if (error) {
    console.error("reopenBudget failed:", error);
    // Written for a person to read by the RAISE EXCEPTION in the function.
    return { error: error.message.replace(/^.*?:\s*/, "") || "Could not re-open this budget." };
  }

  revalidatePath("/budgets", "layout");
  return undefined;
}

// ---------------------------------------------------------------------
// Per-product margins
// ---------------------------------------------------------------------

/**
 * Sets a product's default margin.
 *
 * Only ever affects future pricing: a budget line copies the margin when
 * it is priced and keeps its own copy, so changing this never re-prices
 * work that has already been done — least of all an approved budget.
 */
export async function setItemMargin(
  itemId: string,
  marginPct: number | null,
): Promise<ActionState> {
  const user = await requireTool("/budgets");
  const supabase = await createClient();

  // Clearing a margin means "no default", which is not the same as 0%.
  if (marginPct === null) {
    const { error } = await supabase.from("item_margins").delete().eq("item_id", itemId);
    if (error) {
      console.error("setItemMargin delete failed:", error);
      return { error: "Could not clear that margin. Try again." };
    }
    return undefined;
  }

  if (!Number.isFinite(marginPct) || marginPct < 0) {
    return { error: "Margin must be zero or more." };
  }

  const { error } = await supabase.from("item_margins").upsert(
    {
      item_id: itemId,
      margin_pct: marginPct,
      updated_by: user.id,
    },
    { onConflict: "item_id" },
  );

  if (error) {
    console.error("setItemMargin failed:", error);
    return { error: "Could not save that margin. Try again." };
  }

  return undefined;
}
