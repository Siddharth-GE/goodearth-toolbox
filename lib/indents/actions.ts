"use server";

import { requireTool } from "@/lib/auth/access";
import { isUom } from "@/lib/masters/constants";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// Type-only import, and deliberately NOT re-exported — see the note in
// lib/budgets/actions.ts: a bare `export type { X };` in a "use server"
// file crashes every action in its compiled chunk at load time.
import type { ActionState } from "@/lib/action-state";

/**
 * Writes for Indents. The real status machine lives in the database
 * (indents_guard + indent_lines_draft_only, migration 0019) — these
 * actions validate first so refusals arrive as friendly messages, but a
 * write that slips past the UI is still stopped DB-side.
 *
 * M3 covers creating an indent and direct lines; the two pull paths
 * (construction stage, approved interiors budget) land in M4 and
 * approve/reject in M5.
 */

/** The guard raises human-readable messages (written for exactly this).
 * Surface the known ones instead of a generic "try again". */
function guardError(error: { message: string }, fallback: string): ActionState {
  const message = error.message;
  if (
    message.includes("draft") ||
    message.includes("permanent") ||
    message.includes("no longer be edited") ||
    message.includes("before submitting") ||
    message.includes("short code")
  ) {
    return { error: message.replace(/^.*?:\s*/, "") };
  }
  return { error: fallback };
}

export type CreateIndentInput = {
  projectId: string;
  plotId: string | null;
  unitId: string | null;
  stage: string | null;
  requiredBy: string | null;
  note: string | null;
};

export async function createIndent(input: CreateIndentInput): Promise<ActionState> {
  await requireTool("/indents");

  if (!input.projectId) return { error: "Pick a project first." };

  const supabase = await createClient();

  // Pre-checked here so the common case reads well in the form; the RPC
  // raises the same refusal for any caller that skips this action.
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("code")
    .eq("id", input.projectId)
    .maybeSingle();
  if (projectError || !project) {
    console.error("createIndent project lookup failed:", projectError);
    return { error: "Could not find that project." };
  }
  if (!project.code) {
    return {
      error: "This project has no short code yet — set one in Masters before raising indents.",
    };
  }

  // The casts paper over a typegen limitation (the create_item_request
  // precedent): it types every function argument non-null, but these are
  // genuinely optional — "no plot", "no stage" are real inputs, and
  // PostgREST passes the JSON null straight through.
  const { data: indentId, error } = await supabase.rpc("create_indent", {
    p_project_id: input.projectId,
    p_plot_id: (input.plotId || null) as unknown as string,
    p_unit_id: (input.unitId || null) as unknown as string,
    p_stage: (input.stage?.trim() || null) as unknown as string,
    p_required_by: (input.requiredBy || null) as unknown as string,
    p_note: (input.note?.trim() || null) as unknown as string,
  });
  if (error) {
    console.error("createIndent failed:", error);
    return guardError(error, "Could not create the indent. Try again.");
  }
  if (!indentId) return { error: "Could not create the indent. Try again." };

  revalidatePath("/indents", "layout");
  redirect(`/indents/${indentId}`);
}

export type DirectLineInput = {
  itemId: string;
  quantity: number;
};

/**
 * Commits a picker basket as direct lines. An item already requested
 * directly on this indent has its quantity raised rather than gaining a
 * second row — the same behaviour every picker in the app promises.
 *
 * uom comes from the item master server-side, never from the client.
 */
export async function addDirectLines(
  indentId: string,
  lines: DirectLineInput[],
): Promise<ActionState> {
  const user = await requireTool("/indents");

  if (lines.length === 0) return { error: "Pick at least one item." };
  if (lines.some((line) => !Number.isFinite(line.quantity) || line.quantity <= 0)) {
    return { error: "Quantities must be more than 0." };
  }

  const supabase = await createClient();
  const itemIds = lines.map((line) => line.itemId);

  // Merging only considers direct lines — a line pulled from a budget or
  // a construction stage keeps its provenance untouched.
  const [{ data: items, error: itemsError }, { data: existing, error: existingError }] =
    await Promise.all([
      supabase.from("items").select("id, default_uom").in("id", itemIds),
      supabase
        .from("indent_lines")
        .select("id, item_id, quantity")
        .eq("indent_id", indentId)
        .is("budget_id", null)
        .is("construction_line_id", null)
        .in("item_id", itemIds),
    ]);
  if (itemsError || existingError) {
    console.error("addDirectLines lookup failed:", itemsError ?? existingError);
    return { error: "Could not add those items. Try again." };
  }

  const uoms = new Map((items ?? []).map((item) => [item.id, item.default_uom]));
  const already = new Map((existing ?? []).map((line) => [line.item_id, line]));

  const inserts = [];
  for (const line of lines) {
    const current = already.get(line.itemId);
    if (current) {
      const { error } = await supabase
        .from("indent_lines")
        .update({ quantity: current.quantity + line.quantity, updated_by: user.id })
        .eq("id", current.id);
      if (error) {
        console.error("addDirectLines merge failed:", error);
        return guardError(error, "Could not add those items. Try again.");
      }
    } else {
      inserts.push({
        indent_id: indentId,
        item_id: line.itemId,
        quantity: line.quantity,
        uom: uoms.get(line.itemId) ?? "each",
        created_by: user.id,
        updated_by: user.id,
      });
    }
  }

  if (inserts.length > 0) {
    const { error } = await supabase.from("indent_lines").insert(inserts);
    if (error) {
      console.error("addDirectLines insert failed:", error);
      return guardError(error, "Could not add those items. Try again.");
    }
  }

  revalidatePath(`/indents/${indentId}`);
  return undefined;
}

export type PullLineInput = {
  /** construction_budget_lines.id, or the budget's line_key. */
  sourceId: string;
  quantity: number;
};

/**
 * Pulls lines from a construction plan stage — the site path.
 *
 * Everything except which lines and how many is re-read server-side:
 * the item, the uom and the stage name all come from the plan, never
 * from the client. Lines already on this indent are skipped rather than
 * merged (the unique (indent_id, construction_line_id) pair means one
 * row per plan line, and silently doubling a quantity is how a site
 * ends up with twice the cement).
 */
export async function addConstructionPullLines(
  indentId: string,
  lines: PullLineInput[],
): Promise<ActionState> {
  const user = await requireTool("/indents");

  if (lines.length === 0) return { error: "Pick at least one line." };
  if (lines.some((line) => !Number.isFinite(line.quantity) || line.quantity <= 0)) {
    return { error: "Quantities must be more than 0." };
  }

  const supabase = await createClient();
  const sourceIds = lines.map((line) => line.sourceId);

  const [{ data: sources, error: sourcesError }, { data: existing, error: existingError }] =
    await Promise.all([
      supabase
        .from("construction_budget_lines")
        .select("id, stage, item_id, uom")
        .in("id", sourceIds),
      supabase
        .from("indent_lines")
        .select("construction_line_id")
        .eq("indent_id", indentId)
        .in("construction_line_id", sourceIds),
    ]);
  if (sourcesError || existingError) {
    console.error("addConstructionPullLines lookup failed:", sourcesError ?? existingError);
    return { error: "Could not add those lines. Try again." };
  }

  const byId = new Map((sources ?? []).map((source) => [source.id, source]));
  const already = new Set(
    (existing ?? [])
      .map((line) => line.construction_line_id)
      .filter((id): id is string => id != null),
  );

  const inserts = [];
  for (const line of lines) {
    const source = byId.get(line.sourceId);
    if (!source || already.has(line.sourceId)) continue;
    inserts.push({
      indent_id: indentId,
      item_id: source.item_id,
      quantity: line.quantity,
      uom: source.uom,
      construction_line_id: source.id,
      created_by: user.id,
      updated_by: user.id,
    });
  }

  const skipped = lines.length - inserts.length;
  if (inserts.length === 0) {
    return { error: "Every one of those lines is already on this indent." };
  }

  const { error } = await supabase.from("indent_lines").insert(inserts);
  if (error) {
    console.error("addConstructionPullLines insert failed:", error);
    return guardError(error, "Could not add those lines. Try again.");
  }

  // The indent takes the stage it was raised against, so a site request
  // says which part of the build it belongs to. Only stamped when the
  // pull is from a single stage and the indent doesn't already say.
  const stages = new Set(inserts.map((row) => byId.get(row.construction_line_id)?.stage));
  if (stages.size === 1) {
    const [stage] = [...stages];
    if (stage) {
      const { data: indent } = await supabase
        .from("indents")
        .select("stage, status")
        .eq("id", indentId)
        .maybeSingle();
      if (indent?.status === "draft" && !indent.stage) {
        const { error: stampError } = await supabase
          .from("indents")
          .update({ stage })
          .eq("id", indentId);
        // A failed stamp is cosmetic — the lines are in, and the stage
        // is editable on the indent. Logged, not surfaced.
        if (stampError) console.error("addConstructionPullLines stage stamp failed:", stampError);
      }
    }
  }

  revalidatePath(`/indents/${indentId}`);
  revalidatePath(`/indents/${indentId}/pull`);
  if (skipped > 0) {
    // Only reachable if the indent changed underneath (another tab, a
    // colleague): the screen disables lines it already holds. Said out
    // loud rather than silently adding fewer lines than were ticked.
    return {
      error: `Added ${inserts.length}. ${skipped} ${skipped === 1 ? "line was" : "lines were"} already on this indent and ${skipped === 1 ? "was" : "were"} not added again.`,
    };
  }
  return undefined;
}

/**
 * Pulls lines from an approved interiors budget.
 *
 * The anchor is the composite (budget_id, line_key) — the CLAUDE.md
 * rule — and the item/uom are re-read from the selection line, never
 * trusted from the client. Reads go through the approved_* views only:
 * this action never touches budgets or budget_lines directly, so it
 * cannot see (or accidentally copy) a cost, a margin or a client rate.
 */
export async function addBudgetPullLines(
  indentId: string,
  budgetId: string,
  lines: PullLineInput[],
): Promise<ActionState> {
  const user = await requireTool("/indents");

  if (lines.length === 0) return { error: "Pick at least one line." };
  if (lines.some((line) => !Number.isFinite(line.quantity) || line.quantity <= 0)) {
    return { error: "Quantities must be more than 0." };
  }

  const supabase = await createClient();
  const lineKeys = lines.map((line) => line.sourceId);

  const { data: budget, error: budgetError } = await supabase
    .from("approved_budgets")
    .select("id, selection_id, unit_id")
    .eq("id", budgetId)
    .maybeSingle();
  if (budgetError || !budget?.selection_id || !budget.unit_id) {
    console.error("addBudgetPullLines budget lookup failed:", budgetError);
    return { error: "That budget is no longer available to pull from." };
  }

  // Only the current design revision may be requested against — a stale
  // tab or pasted URL lands here after the screens have filtered, and
  // the 0028 trigger backstops the insert itself.
  const [{ data: revision }, { data: indent }] = await Promise.all([
    supabase.from("selections").select("status").eq("id", budget.selection_id).maybeSingle(),
    supabase.from("indents").select("unit_id").eq("id", indentId).maybeSingle(),
  ]);
  if (revision?.status !== "issued") {
    return {
      error:
        "That budget belongs to a superseded design revision. Pull from the latest issued revision instead.",
    };
  }
  if (indent?.unit_id && indent.unit_id !== budget.unit_id) {
    return { error: "That budget belongs to a different unit than this indent." };
  }

  // A line pulled from ANY of this unit's budgets is the same line —
  // line_key is stable across revisions, so the dedupe must span them
  // all, not just the budget on screen (the double-buy bug).
  const { data: siblingBudgets, error: siblingBudgetsError } = await supabase
    .from("approved_budgets")
    .select("id")
    .eq("unit_id", budget.unit_id);
  // The dedupe below is only as wide as this list. A failed read narrows
  // it to nothing, every line looks unrequested, and the same quantity
  // gets ordered twice — so refuse the pull rather than write it.
  if (siblingBudgetsError) {
    console.error("addBudgetPullLines sibling budgets read failed:", siblingBudgetsError);
    return { error: "Could not check what has already been requested. Try again." };
  }
  const siblingIds = (siblingBudgets ?? [])
    .map((row) => row.id)
    .filter((id): id is string => id != null);

  const [{ data: valid, error: validError }, { data: design, error: designError }, existingResult] =
    await Promise.all([
      // Confirms each key really belongs to this APPROVED budget — the
      // view is the filter, so a key from anywhere else simply isn't here.
      supabase
        .from("approved_budget_lines")
        .select("line_key")
        .eq("budget_id", budgetId)
        .in("line_key", lineKeys),
      supabase
        .from("selection_lines")
        .select("line_key, item_id, uom")
        .eq("selection_id", budget.selection_id)
        .in("line_key", lineKeys),
      supabase
        .from("indent_lines")
        .select("line_key")
        .eq("indent_id", indentId)
        .in("budget_id", siblingIds)
        .in("line_key", lineKeys),
    ]);
  if (validError || designError || existingResult.error) {
    console.error(
      "addBudgetPullLines lookup failed:",
      validError ?? designError ?? existingResult.error,
    );
    return { error: "Could not add those lines. Try again." };
  }

  const allowed = new Set(
    (valid ?? []).map((row) => row.line_key).filter((key): key is string => key != null),
  );
  const designByKey = new Map((design ?? []).map((row) => [row.line_key, row]));
  const already = new Set(
    (existingResult.data ?? [])
      .map((row) => row.line_key)
      .filter((key): key is string => key != null),
  );

  const inserts = [];
  for (const line of lines) {
    const source = designByKey.get(line.sourceId);
    if (!allowed.has(line.sourceId) || !source || already.has(line.sourceId)) continue;
    inserts.push({
      indent_id: indentId,
      item_id: source.item_id,
      quantity: line.quantity,
      uom: source.uom,
      budget_id: budgetId,
      line_key: line.sourceId,
      created_by: user.id,
      updated_by: user.id,
    });
  }

  const skipped = lines.length - inserts.length;
  if (inserts.length === 0) {
    return { error: "Every one of those lines is already on this indent." };
  }

  const { error } = await supabase.from("indent_lines").insert(inserts);
  if (error) {
    console.error("addBudgetPullLines insert failed:", error);
    return guardError(error, "Could not add those lines. Try again.");
  }

  revalidatePath(`/indents/${indentId}`);
  revalidatePath(`/indents/${indentId}/pull-interiors`);
  if (skipped > 0) {
    // Same as the construction pull: the screen disables what's already
    // here, so this only fires on a genuine race — and says so.
    return {
      error: `Added ${inserts.length}. ${skipped} ${skipped === 1 ? "line was" : "lines were"} already on this indent and ${skipped === 1 ? "was" : "were"} not added again.`,
    };
  }
  return undefined;
}

/** Save-on-blur target for a row. No revalidate — the values are
 * already on screen (the saveLine pattern). */
export async function updateLine(
  lineId: string,
  input: { quantity: number; uom: string; note: string | null },
): Promise<ActionState> {
  const user = await requireTool("/indents");

  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    return { error: "Quantity must be more than 0" };
  }
  if (!isUom(input.uom)) return { error: "Pick a unit from the list" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("indent_lines")
    .update({
      quantity: input.quantity,
      uom: input.uom,
      note: input.note?.trim() || null,
      updated_by: user.id,
    })
    .eq("id", lineId);
  if (error) {
    console.error("updateLine failed:", error);
    return guardError(error, "Could not save. Try again.");
  }
  return undefined;
}

export async function removeLine(indentId: string, lineId: string): Promise<ActionState> {
  await requireTool("/indents");

  const supabase = await createClient();
  const { error } = await supabase.from("indent_lines").delete().eq("id", lineId);
  if (error) {
    console.error("removeLine failed:", error);
    return guardError(error, "Could not remove that line. Try again.");
  }

  revalidatePath(`/indents/${indentId}`);
  return undefined;
}

/** Save-on-blur target for the header fields editable in draft. No
 * revalidate for the same reason as updateLine. */
export async function updateIndentHeader(
  indentId: string,
  input: { stage: string | null; requiredBy: string | null; note: string | null },
): Promise<ActionState> {
  const user = await requireTool("/indents");

  const supabase = await createClient();
  const { error } = await supabase
    .from("indents")
    .update({
      stage: input.stage?.trim() || null,
      required_by: input.requiredBy || null,
      note: input.note?.trim() || null,
      updated_by: user.id,
    })
    .eq("id", indentId);
  if (error) {
    console.error("updateIndentHeader failed:", error);
    return guardError(error, "Could not save. Try again.");
  }
  return undefined;
}

export async function submitIndent(indentId: string): Promise<ActionState> {
  const user = await requireTool("/indents");
  const supabase = await createClient();

  // Checked twice on purpose: here for the friendly message, and in
  // indents_guard() under the row lock — the backstop that holds even
  // for a write this function never sees. Exact count, never a fetch.
  const { count, error: countError } = await supabase
    .from("indent_lines")
    .select("id", { count: "exact", head: true })
    .eq("indent_id", indentId);
  if (countError) {
    console.error("submitIndent count failed:", countError);
    return { error: "Could not submit. Try again." };
  }
  if ((count ?? 0) === 0) {
    return { error: "Add at least one line before submitting." };
  }

  const { error } = await supabase
    .from("indents")
    .update({
      status: "submitted",
      submitted_by: user.id,
      submitted_at: new Date().toISOString(),
      rejection_note: null,
    })
    // No status filter here: filtering to drafts would make a submit on a
    // locked indent match zero rows and "succeed" silently. Let the guard
    // refuse it with a message worth showing.
    .eq("id", indentId);
  if (error) {
    console.error("submitIndent failed:", error);
    return guardError(error, "Could not submit. Try again.");
  }

  revalidatePath(`/indents/${indentId}`);
  revalidatePath("/indents", "layout");
  return undefined;
}

/**
 * Approves a submitted indent — the end of the road for this tool; a
 * Purchase Order (Phase 6) is what happens next.
 *
 * Who may approve is checked in `indents_guard()` against
 * `indent_approvers` (or admin), under the row lock. The check here is
 * only so a refusal reads as a sentence rather than a database error.
 */
export async function approveIndent(indentId: string): Promise<ActionState> {
  const user = await requireTool("/indents");
  const supabase = await createClient();

  const { error } = await supabase
    .from("indents")
    .update({
      status: "approved",
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    })
    .eq("id", indentId);
  if (error) {
    console.error("approveIndent failed:", error);
    if (error.message.includes("approver")) {
      return { error: "Only a named indent approver or an admin can approve an indent." };
    }
    return guardError(error, "Could not approve this indent. Try again.");
  }

  revalidatePath(`/indents/${indentId}`);
  revalidatePath("/indents", "layout");
  return undefined;
}

/**
 * Sends a submitted indent back to draft with a reason.
 *
 * The note is mandatory — the guard refuses a rejection without one,
 * because "rejected" with no explanation is the fastest way to make
 * people stop using a tool. Submitting again clears it.
 */
export async function rejectIndent(indentId: string, note: string): Promise<ActionState> {
  await requireTool("/indents");

  const reason = note.trim();
  if (!reason) return { error: "Say what needs changing — a rejection needs a note." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("indents")
    .update({
      status: "draft",
      rejection_note: reason,
      submitted_by: null,
      submitted_at: null,
      approved_by: null,
      approved_at: null,
    })
    .eq("id", indentId);
  if (error) {
    console.error("rejectIndent failed:", error);
    return guardError(error, "Could not send this indent back. Try again.");
  }

  revalidatePath(`/indents/${indentId}`);
  revalidatePath("/indents", "layout");
  return undefined;
}

/** Only a draft can go — the RPC re-checks under a row lock, and its
 * number stays burnt (gaps in the sequence are accepted and expected). */
export async function deleteIndent(indentId: string): Promise<ActionState> {
  await requireTool("/indents");
  const supabase = await createClient();

  const { error } = await supabase.rpc("delete_draft_indent", { p_indent_id: indentId });
  if (error) {
    console.error("deleteIndent failed:", error);
    // Written for a person to read by the RAISE EXCEPTION in the function.
    return { error: error.message.replace(/^.*?:\s*/, "") || "Could not delete this indent." };
  }

  revalidatePath("/indents", "layout");
  redirect("/indents/list");
}
