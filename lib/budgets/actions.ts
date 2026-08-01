"use server";

import { requireApp } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type ActionState = { error?: string } | undefined;

async function authorize() {
  const user = await requireUser();
  await requireApp(user, "/budgets");
  return user;
}

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
 * Only the header is written. Budget lines are created the moment someone
 * actually prices a line (see saveLine), because the pricing screen takes
 * its spine from the revision's own lines: every line shows up whether or
 * not it has a budget row yet. That means there is no half-created state
 * to clean up if this is interrupted.
 */
export async function startPricing(selectionId: string): Promise<ActionState> {
  const user = await authorize();
  const supabase = await createClient();

  const { data: selection, error: selectionError } = await supabase
    .from("selections")
    .select("id, unit_id, status")
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
      const { data: existing } = await supabase
        .from("budgets")
        .select("id")
        .eq("selection_id", selectionId)
        .single();
      if (existing) redirect(`/budgets/${existing.id}`);
    }
    console.error("startPricing failed:", error);
    return { error: "Could not start this budget. Try again." };
  }

  revalidatePath("/budgets");
  redirect(`/budgets/${data.id}`);
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
  const user = await authorize();

  if (!(input.quantity > 0)) return { error: "Quantity must be more than zero." };
  if (input.unitCost !== null && input.unitCost < 0) return { error: "Cost cannot be negative." };
  if (input.marginPct !== null && input.marginPct < 0) return { error: "Margin cannot be negative." };

  const supabase = await createClient();
  const { error } = await supabase.from("budget_lines").upsert(
    {
      budget_id: budgetId,
      selection_id: selectionId,
      line_key: lineKey,
      quantity: input.quantity,
      expected_vendor_id: input.expectedVendorId,
      unit_cost: input.unitCost,
      margin_pct: input.marginPct,
      notes: input.notes?.trim() || null,
      // Clearing the flag is the point of editing a carried-forward line:
      // someone has now looked at it.
      needs_review: false,
      priced_by: user.id,
      priced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
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
 * The "every line priced" rule is checked here rather than in the database
 * because it is a question about lines that may not exist yet — an
 * untouched line has no budget row at all, so no constraint could see it.
 * The database still enforces the consequence: once approved, its trigger
 * refuses every write to the lines.
 */
export async function approveBudget(budgetId: string): Promise<ActionState> {
  const user = await authorize();
  const supabase = await createClient();

  const { data: budget } = await supabase
    .from("budgets")
    .select("id, selection_id, status")
    .eq("id", budgetId)
    .maybeSingle();
  if (!budget) return { error: "Could not find that budget." };
  if (budget.status === "approved") return { error: "This budget is already approved." };

  const [{ data: selectionLines }, { data: budgetLines }] = await Promise.all([
    supabase.from("selection_lines").select("line_key").eq("selection_id", budget.selection_id),
    supabase.from("budget_lines").select("line_key, budget_status").eq("budget_id", budgetId),
  ]);

  const priced = new Set(
    (budgetLines ?? []).filter((line) => line.budget_status === "priced").map((line) => line.line_key),
  );
  const total = (selectionLines ?? []).length;
  if (total === 0) return { error: "There is nothing to approve — this revision has no items." };

  const missing = (selectionLines ?? []).filter((line) => !priced.has(line.line_key)).length;
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
      updated_at: new Date().toISOString(),
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
 * Unlocks an approved budget so a genuine pricing error can be corrected.
 *
 * Deliberately possible, unlike un-issuing a design revision: a cost
 * estimate is fallible in a way a specification is not, and the
 * alternative — a whole new revision to fix one wrong rate — would be
 * worse. Every re-opening is recorded in the audit log by the trigger in
 * migration 0011.
 */
export async function reopenBudget(budgetId: string): Promise<ActionState> {
  await authorize();
  const supabase = await createClient();

  const { error } = await supabase
    .from("budgets")
    .update({
      status: "pricing",
      approved_by: null,
      approved_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", budgetId);

  if (error) {
    console.error("reopenBudget failed:", error);
    return { error: "Could not re-open this budget. Try again." };
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
export async function setItemMargin(itemId: string, marginPct: number | null): Promise<ActionState> {
  const user = await authorize();
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
      updated_at: new Date().toISOString(),
    },
    { onConflict: "item_id" },
  );

  if (error) {
    console.error("setItemMargin failed:", error);
    return { error: "Could not save that margin. Try again." };
  }

  return undefined;
}
