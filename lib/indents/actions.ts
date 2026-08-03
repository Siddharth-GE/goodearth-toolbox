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

  revalidatePath("/indents");
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
        .update({ quantity: current.quantity + line.quantity })
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

/** Save-on-blur target for a row. No revalidate — the values are
 * already on screen (the saveLine pattern). */
export async function updateLine(
  lineId: string,
  input: { quantity: number; uom: string; note: string | null },
): Promise<ActionState> {
  await requireTool("/indents");

  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    return { error: "Quantity must be more than 0" };
  }
  if (!isUom(input.uom)) return { error: "Pick a unit from the list" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("indent_lines")
    .update({ quantity: input.quantity, uom: input.uom, note: input.note?.trim() || null })
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
  await requireTool("/indents");

  const supabase = await createClient();
  const { error } = await supabase
    .from("indents")
    .update({
      stage: input.stage?.trim() || null,
      required_by: input.requiredBy || null,
      note: input.note?.trim() || null,
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
  revalidatePath("/indents");
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

  revalidatePath("/indents");
  redirect("/indents");
}
