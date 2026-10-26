"use server";

import { requireTool } from "@/lib/auth/access";
import { dbErrorMessage } from "@/lib/db-error";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// carry-forward.ts is pure and imports nothing, so it is safe to import as a value from a "use server" file.
import { planCarryForward } from "./carry-forward";

// Type-only import, deliberately NOT re-exported: a type re-export from a "use server" file kills every action at module load. Import ActionState from "@/lib/action-state".
import type { ActionState } from "@/lib/action-state";

/**
 * Opens a budget against an issued revision. Budgets creates the row itself; Selections never knows Budgets exists.
 * A first revision writes only the header (lines appear when priced); R+1 also carries pricing forward from the previous budget.
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
    // 23505: selection_id is unique, so a double Start pricing lands the loser on the winning budget.
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
    // Remove the budget on failure: leaving it would look like an unpriced revision. Makes this retryable.
    const { error: cleanupError } = await supabase.from("budgets").delete().eq("id", data.id);
    if (cleanupError) {
      // If cleanup fails the budget survives and retries would fail on the duplicate key; say so instead of swallowing it.
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
 * Copies pricing from the previous revision, matched on line_key (carried by create_next_revision(), migration 0007).
 * The rules live in carry-forward.ts; this only fetches and writes.
 */
type BudgetsClient = Awaited<ReturnType<typeof createClient>>;

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
  // Filtered and sorted here: ordering by an embedded column is more trouble in PostgREST.
  const { data: priorBudgets, error: priorBudgetsError } = await supabase
    .from("budgets")
    .select("id, selection_id, selections(revision_no)")
    .eq("unit_id", unitId);

  // Checked: an empty list means "first budget" and returns null, so an unchecked failure would hand over a blank sheet for lines already priced.
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

  if (!previous) return null;

  // Read to COMPLETION (PostgREST caps at 1,000): a truncated read would silently drop carried-forward pricing.
  // fetchAll raises; caught here because this feeds a Server Action.
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
      // priced_by stays null: nobody priced these in this budget.
    })),
  );

  if (error) {
    console.error("carryForward insert failed:", error);
    return "Could not carry the previous pricing forward. Try again.";
  }

  return null;
}

export type LineInput = {
  quantity: number;
  expectedVendorId: string | null;
  unitCost: number | null;
  marginPct: number | null;
  notes: string | null;
};

/**
 * client_rate is a generated column (migration 0011), so the sheet and the quote cannot drift; math.ts mirrors it for the live screen.
 * No revalidatePath, as with the Selections grid: the row already shows what was typed.
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
      // A blank margin on a priced line means 0%, charged at cost (migration 0017 forbids a cost with a NULL margin).
      margin_pct: input.unitCost === null ? input.marginPct : (input.marginPct ?? 0),
      notes: input.notes?.trim() || null,
      // Clearing the flag: someone has now looked at the line.
      needs_review: false,
      priced_by: user.id,
      priced_at: new Date().toISOString(),
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

/** "Every line priced" is checked twice: here, for a message with the missing count, and in budgets_guard() (0017) as the backstop. */
export async function approveBudget(budgetId: string): Promise<ActionState> {
  const user = await requireTool("/budgets");
  const supabase = await createClient();

  const { data: budget, error: budgetError } = await supabase
    .from("budgets")
    .select("id, selection_id, status")
    .eq("id", budgetId)
    .maybeSingle();
  if (budgetError) {
    console.error("approveBudget read failed:", budgetError);
    return { error: "Could not check this budget. Try again." };
  }
  if (!budget) return { error: "Could not find that budget." };
  if (budget.status === "approved") return { error: "This budget is already approved." };

  // Exact database counts, never rows.length: a capped read could approve a budget with unpriced lines.
  // Priced is a subset of total (composite FK, 0011), so the subtraction is safe.
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
 * Unlocks an approved budget to fix a pricing error and starts the next version (the sent quote stays v1). Deliberate, unlike un-issuing a design revision.
 * A database function, so two people re-opening at once can't both produce v2 (migration 0012).
 */
export async function reopenBudget(budgetId: string): Promise<ActionState> {
  await requireTool("/budgets");
  const supabase = await createClient();

  const { error } = await supabase.rpc("reopen_budget", { p_budget_id: budgetId });

  if (error) {
    console.error("reopenBudget failed:", error);
    // Written for a person to read by the RAISE EXCEPTION in the function.
    return { error: dbErrorMessage(error, "Could not re-open this budget.") };
  }

  revalidatePath("/budgets", "layout");
  return undefined;
}

/** Affects future pricing only: a budget line copies the margin when priced, so this never re-prices approved work. */
export async function setItemMargin(
  itemId: string,
  marginPct: number | null,
): Promise<ActionState> {
  const user = await requireTool("/budgets");
  const supabase = await createClient();

  // Clearing means "no default", not 0%.
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

// Only a first pricing goes: delete_pricing_budget (0143) refuses a re-opened budget, which indents may rest on.
export async function deleteBudget(budgetId: string): Promise<ActionState> {
  await requireTool("/budgets");
  const supabase = await createClient();

  const { error } = await supabase.rpc("delete_pricing_budget", { p_budget_id: budgetId });
  if (error) {
    console.error("deleteBudget failed:", error);
    return { error: dbErrorMessage(error, "Could not delete this budget.") };
  }

  revalidatePath("/budgets", "layout");
  redirect("/budgets/interiors");
}
