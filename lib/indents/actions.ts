"use server";

import { requireTool } from "@/lib/auth/access";
import { dbErrorMessage, guardError } from "@/lib/db-error";
import { isActiveUom } from "@/lib/masters/uoms";
import { notifyAfter } from "@/lib/push/send";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import { approvalBlocker } from "./workflow";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// Type-only and not re-exported: `export type { X }` in a "use server" file crashes the chunk at load.
import type { ActionState } from "@/lib/action-state";

// The status machine lives in the database (indents_guard, indent_lines_draft_only, 0019); actions pre-check so refusals read as sentences.

/** The guard raises human-readable messages; surface the known ones. */
const INDENT_GUARD_PHRASES = [
  "draft",
  "permanent",
  "no longer be edited",
  "before submitting",
  "short code",
  // 0113: the estimate anchor and the estimator's hold.
  "official estimate",
  "outside the estimate",
  "estimator",
  // 0143: cancelling.
  "cancel",
  "Cancel",
] as const;

const REASON_LIMIT = 500;

export type CreateIndentInput = {
  projectId: string;
  plotId: string | null;
  unitId: string | null;
  /** An older indent's one work; a new one names its stage instead (0158). Never both. */
  workItemId: string | null;
  workGroupId?: string | null;
  requiredBy: string | null;
  note: string | null;
  /** An emergency request: sorted first for the approver (0132). */
  isUrgent: boolean;
};

export async function createIndent(input: CreateIndentInput): Promise<ActionState> {
  const user = await requireTool("/indents");

  if (!input.projectId) return { error: "Pick a project first." };
  if (input.workItemId && input.workGroupId) {
    return { error: "An indent is for a stage or one work, not both." };
  }

  const supabase = await createClient();

  // Pre-checked for a readable message; the RPC raises the same refusal.
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

  // The casts paper over typegen typing every RPC argument non-null; PostgREST passes null through.
  const { data: indentId, error } = await supabase.rpc("create_indent", {
    p_project_id: input.projectId,
    p_plot_id: (input.plotId || null) as unknown as string,
    p_unit_id: (input.unitId || null) as unknown as string,
    // p_stage stays for the legacy column; new indents carry the work instead.
    p_stage: null as unknown as string,
    p_required_by: (input.requiredBy || null) as unknown as string,
    p_note: (input.note?.trim() || null) as unknown as string,
  });
  if (error) {
    console.error("createIndent failed:", error);
    return guardError(error, "Could not create the indent. Try again.", INDENT_GUARD_PHRASES);
  }
  if (!indentId) return { error: "Could not create the indent. Try again." };

  // create_indent()'s signature predates works and the urgent mark (additive-only), so they ride a second write; a failure leaves a visible, fixable draft.
  if (input.workItemId || input.workGroupId || input.isUrgent) {
    const { error: workError } = await supabase
      .from("indents")
      .update({
        work_item_id: input.workItemId || null,
        work_group_id: input.workGroupId || null,
        is_urgent: input.isUrgent,
        updated_by: user.id,
      })
      .eq("id", indentId);
    if (workError) console.error("createIndent work update failed:", workError);
  }

  revalidatePath("/indents", "layout");
  redirect(`/indents/${indentId}`);
}

export type DirectLineInput = {
  itemId: string;
  quantity: number;
};

// A pick on the villa's official estimate is an ESTIMATE line (0113); anything else is a direct line needing a reason and the estimator's yes.
// The estimate is read here, never trusted from the client; uom comes from the item master.
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
  const itemIds = [...new Set(lines.map((line) => line.itemId))];

  const { data: indent, error: indentError } = await supabase
    .from("indents")
    .select("unit_id, plot_id")
    .eq("id", indentId)
    .maybeSingle();
  if (indentError) {
    console.error("addDirectLines indent read failed:", indentError);
    return { error: "Could not add those items. Try again." };
  }
  if (!indent) return { error: "That indent no longer exists." };

  // Official estimate via the money-free window; a failed read refuses rather than filing every pick as outside it.
  let unitId = indent.unit_id;
  if (!unitId && indent.plot_id) {
    const { data: unit, error: unitError } = await supabase
      .from("units")
      .select("id")
      .eq("plot_id", indent.plot_id)
      .maybeSingle();
    if (unitError) {
      console.error("addDirectLines unit read failed:", unitError);
      return { error: "Could not check the estimate. Try again." };
    }
    unitId = unit?.id ?? null;
  }
  let estimateId: string | null = null;
  const listed = new Set<string>();
  if (unitId) {
    const villaUnit = unitId;
    try {
      const facts = await fetchAll<{ estimate_id: string | null; item_id: string | null }>(
        (from, to) =>
          supabase
            .from("estimate_takeoff_facts")
            .select("estimate_id, item_id")
            .eq("unit_id", villaUnit)
            .in("item_id", itemIds)
            .order("estimate_id")
            .order("item_id")
            .range(from, to),
      );
      for (const fact of facts) {
        if (!fact.estimate_id || !fact.item_id) continue;
        estimateId = fact.estimate_id;
        listed.add(fact.item_id);
      }
    } catch (error) {
      console.error("addDirectLines estimate read failed:", error);
      return { error: "Could not check the estimate. Try again." };
    }
  }

  // Merge only lines of the same kind; pulled lines keep their provenance.
  const [{ data: items, error: itemsError }, { data: existing, error: existingError }] =
    await Promise.all([
      supabase.from("items").select("id, default_uom").in("id", itemIds),
      supabase
        .from("indent_lines")
        .select("id, item_id, quantity, estimate_id")
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
  const anchorFor = (itemId: string) => (listed.has(itemId) ? estimateId : null);
  const already = new Map(
    (existing ?? [])
      .filter((line) => line.estimate_id === anchorFor(line.item_id))
      .map((line) => [line.item_id, line]),
  );

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
        return guardError(error, "Could not add those items. Try again.", INDENT_GUARD_PHRASES);
      }
    } else {
      inserts.push({
        indent_id: indentId,
        item_id: line.itemId,
        quantity: line.quantity,
        uom: uoms.get(line.itemId) ?? "each",
        estimate_id: anchorFor(line.itemId),
        created_by: user.id,
        updated_by: user.id,
      });
    }
  }

  if (inserts.length > 0) {
    const { error } = await supabase.from("indent_lines").insert(inserts);
    if (error) {
      console.error("addDirectLines insert failed:", error);
      return guardError(error, "Could not add those items. Try again.", INDENT_GUARD_PHRASES);
    }
  }

  revalidatePath("/indents", "layout");
  return undefined;
}

export type PullLineInput = {
  sourceId: string;
  quantity: number;
};

// Anchor is the composite (budget_id, line_key); item and uom are re-read from the selection line, never the client.
// Only the approved_* views are read, so no cost, margin or rate is reachable.
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

  // Only the current revision may be requested against (the 0028 trigger backstops).
  const [{ data: revision, error: revisionError }, { data: indent, error: indentReadError }] =
    await Promise.all([
      supabase.from("selections").select("status").eq("id", budget.selection_id).maybeSingle(),
      supabase.from("indents").select("unit_id").eq("id", indentId).maybeSingle(),
    ]);
  // Checked apart: a failed read and a superseded revision both leave `revision` null.
  if (revisionError || indentReadError) {
    console.error("addBudgetPullLines revision check failed:", revisionError ?? indentReadError);
    return { error: "Could not check that budget just now. Try again." };
  }
  if (revision?.status !== "issued") {
    return {
      error:
        "That budget belongs to a superseded design revision. Pull from the latest issued revision instead.",
    };
  }
  if (indent?.unit_id && indent.unit_id !== budget.unit_id) {
    return { error: "That budget belongs to a different unit than this indent." };
  }

  // Dedupe across ALL the unit's budgets: line_key is stable across revisions (the double-buy bug).
  const { data: siblingBudgets, error: siblingBudgetsError } = await supabase
    .from("approved_budgets")
    .select("id")
    .eq("unit_id", budget.unit_id);
  // A failed read would narrow the dedupe and double-order, so refuse the pull.
  if (siblingBudgetsError) {
    console.error("addBudgetPullLines sibling budgets read failed:", siblingBudgetsError);
    return { error: "Could not check what has already been requested. Try again." };
  }
  const siblingIds = (siblingBudgets ?? [])
    .map((row) => row.id)
    .filter((id): id is string => id != null);

  const [{ data: valid, error: validError }, { data: design, error: designError }, existingResult] =
    await Promise.all([
      // The approved view is the filter: a key from elsewhere isn't here.
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
    return guardError(error, "Could not add those lines. Try again.", INDENT_GUARD_PHRASES);
  }

  revalidatePath("/indents", "layout");
  if (skipped > 0) {
    // The screen disables what is already here, so this only fires on a race.
    return {
      error: `Added ${inserts.length}. ${skipped} ${skipped === 1 ? "line was" : "lines were"} already on this indent and ${skipped === 1 ? "was" : "were"} not added again.`,
    };
  }
  return undefined;
}

// No revalidate: the values are already on screen.
// A material moves in its Masters unit through PO, receipt and stock; only an interiors line keeps a chosen unit, the rest are saved in the item's default_uom.
export async function updateLine(
  lineId: string,
  input: {
    quantity: number;
    uom: string;
    note: string | null;
    /** Why a line outside the estimate is needed (0113); the database asks for it at submit. */
    reason: string | null;
  },
): Promise<ActionState> {
  const user = await requireTool("/indents");

  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    return { error: "Quantity must be more than 0" };
  }
  const reason = input.reason?.trim() || null;
  if (reason && reason.length > REASON_LIMIT) {
    return { error: `Keep the reason under ${REASON_LIMIT} characters.` };
  }

  const supabase = await createClient();
  const { data: existing, error: readError } = await supabase
    .from("indent_lines")
    .select("budget_id, construction_line_id, estimate_id, items(default_uom)")
    .eq("id", lineId)
    .maybeSingle();
  if (readError) {
    console.error("updateLine read failed:", readError);
    return { error: "Could not save. Try again." };
  }
  if (!existing) return { error: "That line is no longer on this indent." };

  let uom: string;
  if (existing.budget_id != null) {
    if (!(await isActiveUom(input.uom))) return { error: "Pick a unit from the list" };
    uom = input.uom;
  } else {
    const masterUom = (existing.items as { default_uom: string | null } | null)?.default_uom;
    if (!masterUom) {
      return { error: "This item has no unit in Masters. Set one there first." };
    }
    uom = masterUom;
  }

  // A change empties an earlier estimator's answer (indent_lines_draft_only).
  const outside =
    existing.budget_id == null &&
    existing.construction_line_id == null &&
    existing.estimate_id == null;
  const { error } = await supabase
    .from("indent_lines")
    .update({
      quantity: input.quantity,
      uom,
      note: input.note?.trim() || null,
      ...(outside ? { off_estimate_reason: reason } : {}),
      updated_by: user.id,
    })
    .eq("id", lineId);
  if (error) {
    console.error("updateLine failed:", error);
    return guardError(error, "Could not save. Try again.", INDENT_GUARD_PHRASES);
  }
  return undefined;
}

export async function removeLine(indentId: string, lineId: string): Promise<ActionState> {
  await requireTool("/indents");

  const supabase = await createClient();
  const { error } = await supabase.from("indent_lines").delete().eq("id", lineId);
  if (error) {
    console.error("removeLine failed:", error);
    return guardError(error, "Could not remove that line. Try again.", INDENT_GUARD_PHRASES);
  }

  revalidatePath("/indents", "layout");
  return undefined;
}

export async function updateIndentHeader(
  indentId: string,
  input: {
    workItemId: string | null;
    /** Picking a stage replaces an older indent's one work (0158); left out, the stage stays as it is. */
    workGroupId?: string | null;
    requiredBy: string | null;
    note: string | null;
    isUrgent: boolean;
  },
): Promise<ActionState> {
  const user = await requireTool("/indents");
  if (input.workItemId && input.workGroupId) {
    return { error: "An indent is for a stage or one work, not both." };
  }

  const supabase = await createClient();
  // `stage` is absent on purpose: an old indent keeps its legacy stage.
  const { error } = await supabase
    .from("indents")
    .update({
      work_item_id: input.workItemId || null,
      // A work given replaces a stage; a stage left out stays as it is.
      ...(input.workGroupId === undefined
        ? input.workItemId
          ? { work_group_id: null }
          : {}
        : { work_group_id: input.workGroupId || null }),
      required_by: input.requiredBy || null,
      note: input.note?.trim() || null,
      is_urgent: input.isUrgent,
      updated_by: user.id,
    })
    .eq("id", indentId);
  if (error) {
    console.error("updateIndentHeader failed:", error);
    return guardError(error, "Could not save. Try again.", INDENT_GUARD_PHRASES);
  }
  return undefined;
}

export async function submitIndent(indentId: string): Promise<ActionState> {
  const user = await requireTool("/indents");
  const supabase = await createClient();

  // Also checked in indents_guard() under the row lock; this is for the friendly message.
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

  // 0113: lines outside the estimate need a reason. Read the database, not the page's count (the reason saves on blur).
  const { count: noReason, error: reasonError } = await supabase
    .from("indent_lines")
    .select("id", { count: "exact", head: true })
    .eq("indent_id", indentId)
    .is("budget_id", null)
    .is("construction_line_id", null)
    .is("estimate_id", null)
    .is("off_estimate_reason", null);
  if (reasonError) {
    console.error("submitIndent reason count failed:", reasonError);
    return { error: "Could not submit. Try again." };
  }
  if ((noReason ?? 0) > 0) {
    return {
      error: `${noReason} ${noReason === 1 ? "line is" : "lines are"} outside the estimate — say why ${noReason === 1 ? "it is" : "each is"} needed, then submit.`,
    };
  }

  const { error } = await supabase
    .from("indents")
    .update({
      status: "submitted",
      submitted_by: user.id,
      submitted_at: new Date().toISOString(),
      rejection_note: null,
    })
    // No status filter: filtering to drafts would make a submit on a locked indent match zero rows and "succeed".
    .eq("id", indentId);
  if (error) {
    console.error("submitIndent failed:", error);
    return guardError(error, "Could not submit. Try again.", INDENT_GUARD_PHRASES);
  }

  revalidatePath("/indents", "layout");
  revalidatePath("/indents", "layout");
  return undefined;
}

// indents_guard() checks approvers under the row lock; this check only makes the refusal a sentence.
export async function approveIndent(indentId: string): Promise<ActionState> {
  const user = await requireTool("/indents");
  const supabase = await createClient();

  // 0113: a line outside the estimate waits for the estimator's yes; the guard refuses it too.
  const { data: held, error: heldError } = await supabase
    .from("indent_lines")
    .select("estimator_decision")
    .eq("indent_id", indentId)
    .is("budget_id", null)
    .is("construction_line_id", null)
    .is("estimate_id", null)
    .or("estimator_decision.is.null,estimator_decision.neq.approved");
  if (heldError) {
    console.error("approveIndent hold read failed:", heldError);
    return { error: "Could not approve this indent. Try again." };
  }
  const blocker = approvalBlocker({
    needReason: 0,
    waiting: held.filter((line) => line.estimator_decision !== "refused").length,
    refused: held.filter((line) => line.estimator_decision === "refused").length,
  });
  if (blocker) return { error: blocker };

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
    return guardError(error, "Could not approve this indent. Try again.", INDENT_GUARD_PHRASES);
  }

  // Whoever raised it hears, on their phone; the approval stands whatever happens to the notice.
  const { data: approved, error: readError } = await supabase
    .from("indents")
    .select("reference, created_by, submitted_by")
    .eq("id", indentId)
    .maybeSingle();
  if (readError) console.error("approveIndent notice read failed:", readError);
  else if (approved) {
    notifyAfter([approved.created_by, approved.submitted_by], user.id, {
      title: "Indent approved",
      body: `${approved.reference} is approved.`,
      url: `/indents/${indentId}`,
    });
  }

  revalidatePath("/indents", "layout");
  revalidatePath("/indents", "layout");
  return undefined;
}

// The note is mandatory (the guard refuses without one); submitting again clears it.
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
    return guardError(error, "Could not send this indent back. Try again.", INDENT_GUARD_PHRASES);
  }

  revalidatePath("/indents", "layout");
  revalidatePath("/indents", "layout");
  return undefined;
}

// Only a draft can go; the RPC re-checks under a row lock and the number stays burnt.
export async function deleteIndent(indentId: string): Promise<ActionState> {
  await requireTool("/indents");
  const supabase = await createClient();

  const { error } = await supabase.rpc("delete_draft_indent", { p_indent_id: indentId });
  if (error) {
    console.error("deleteIndent failed:", error);
    // The function's RAISE EXCEPTION text is written for people.
    return { error: dbErrorMessage(error, "Could not delete this indent.") };
  }

  revalidatePath("/indents", "layout");
  redirect("/indents/list");
}

// indents_guard (0143) refuses while a live PO orders from it, stamps who and when, and makes it final.
export async function cancelIndent(indentId: string, reason: string): Promise<ActionState> {
  await requireTool("/indents");

  const why = reason.trim();
  if (!why) return { error: "Say why this indent is cancelled." };
  if (why.length > REASON_LIMIT) {
    return { error: `Keep the reason under ${REASON_LIMIT} characters.` };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("indents")
    .update({ status: "cancelled", cancel_reason: why })
    .eq("id", indentId);
  if (error) {
    console.error("cancelIndent failed:", error);
    // The guard locks the indent's lines against a PO being written to them at the same moment.
    if (error.code === "40P01") {
      return { error: "A purchase order was being made from this indent just then. Try again." };
    }
    return guardError(error, "Could not cancel this indent. Try again.", INDENT_GUARD_PHRASES);
  }

  revalidatePath("/indents", "layout");
  return undefined;
}

export type EstimatePullInput = {
  itemId: string;
  quantity: number;
};

// The client sends item and quantity only; that the item is on the official estimate, and its unit, are re-read server-side.
// Items already on the indent are skipped (the unique (indent, estimate, item) anchor backstops).
export async function addEstimatePullLines(
  indentId: string,
  estimateId: string,
  lines: EstimatePullInput[],
): Promise<ActionState> {
  const user = await requireTool("/indents");

  if (lines.length === 0) return { error: "Pick at least one material." };
  if (lines.some((line) => !Number.isFinite(line.quantity) || line.quantity <= 0)) {
    return { error: "Quantities must be more than 0." };
  }

  const supabase = await createClient();
  const itemIds = [...new Set(lines.map((line) => line.itemId))];

  const [{ data: facts, error: factsError }, { data: existing, error: existingError }] =
    await Promise.all([
      supabase
        .from("estimate_takeoff_facts")
        .select("item_id")
        .eq("estimate_id", estimateId)
        .in("item_id", itemIds),
      supabase
        .from("indent_lines")
        .select("item_id")
        .eq("indent_id", indentId)
        .eq("estimate_id", estimateId),
    ]);
  if (factsError || existingError) {
    console.error("addEstimatePullLines lookup failed:", factsError ?? existingError);
    return { error: "Could not add those materials. Try again." };
  }
  // The view reads official estimates only: a missing item means the estimate was superseded.
  const onEstimate = new Set((facts ?? []).map((fact) => fact.item_id));
  if (itemIds.some((id) => !onEstimate.has(id))) {
    return { error: "That estimate is no longer the official one — reload and look again." };
  }

  const { data: items, error: itemsError } = await supabase
    .from("items")
    .select("id, default_uom")
    .in("id", itemIds);
  if (itemsError) {
    console.error("addEstimatePullLines items failed:", itemsError);
    return { error: "Could not add those materials. Try again." };
  }
  const uomByItem = new Map((items ?? []).map((item) => [item.id, item.default_uom]));
  const already = new Set((existing ?? []).map((line) => line.item_id));

  const inserts = [];
  for (const line of lines) {
    const itemId = line.itemId;
    if (already.has(itemId)) continue;
    const uom = uomByItem.get(itemId);
    if (!uom) continue;
    inserts.push({
      indent_id: indentId,
      item_id: itemId,
      quantity: line.quantity,
      uom,
      estimate_id: estimateId,
      created_by: user.id,
      updated_by: user.id,
    });
    already.add(itemId);
  }

  if (inserts.length === 0) {
    return { error: "Every one of those materials is already on this indent." };
  }

  const { error } = await supabase.from("indent_lines").insert(inserts);
  if (error) {
    console.error("addEstimatePullLines insert failed:", error);
    return guardError(error, "Could not add those materials. Try again.", INDENT_GUARD_PHRASES);
  }

  revalidatePath("/indents", "layout");
  return undefined;
}
