"use server";

import { requireTool } from "@/lib/auth/access";
import { dbErrorMessage } from "@/lib/db-error";
// constants.ts is import-free, so it is safe as VALUES in this "use server" module; a "server-only" import would break the client bundle.
import { isActiveUom } from "@/lib/masters/uoms";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// Type-only import, deliberately NOT re-exported (see lib/budgets/actions.ts).
import type { ActionState } from "@/lib/action-state";

/** One draft per unit is a partial unique index: a double submission surfaces as a duplicate-key error, caught below. */
export async function startFirstRevision(unitId: string): Promise<ActionState> {
  const user = await requireTool("/selections");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("selections")
    .insert({ unit_id: unitId, revision_no: 0, status: "draft", created_by: user.id })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { error: "This unit already has an open draft." };
    console.error("startFirstRevision failed:", error);
    return { error: "Could not start a revision. Try again." };
  }

  // "layout": the list page and open editors both derive from a revision's status, so the whole segment revalidates.
  revalidatePath("/selections", "layout");
  redirect(`/selections/${data.id}`);
}

/** issue_selection() does the two-row update (issue this, supersede the previous) in the database, so a unit never has two live issued revisions. */
export async function issueSelection(
  selectionId: string,
  notes: string | null,
): Promise<ActionState> {
  await requireTool("/selections");
  const supabase = await createClient();

  // Written while still a draft: the guard trigger refuses edits to anything issued.
  if (notes?.trim()) {
    const { error: notesError } = await supabase
      .from("selections")
      .update({ notes: notes.trim() })
      .eq("id", selectionId);
    if (notesError) {
      console.error("issueSelection notes failed:", notesError);
      return { error: "Could not save the note. Try again." };
    }
  }

  const { error } = await supabase.rpc("issue_selection", { p_selection_id: selectionId });
  if (error) {
    console.error("issueSelection failed:", error);
    // From RAISE EXCEPTION in the function, already written for a person.
    return { error: dbErrorMessage(error, "Could not issue this revision.") };
  }

  revalidatePath("/selections", "layout");
  return undefined;
}

/** Line keys are carried over by the database function, which lets Budgets keep pricing unchanged lines. */
export async function createNextRevision(fromSelectionId: string): Promise<ActionState> {
  await requireTool("/selections");
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("create_next_revision", {
    p_from_selection_id: fromSelectionId,
  });
  if (error) {
    console.error("createNextRevision failed:", error);
    return { error: dbErrorMessage(error, "Could not create the next revision.") };
  }

  revalidatePath("/selections", "layout");
  redirect(`/selections/${data}`);
}

export type NewSpace = { spaceTypeId: string; label: string };

/** Labels arrive already resolved from the client, so what the designer approved is exactly what is written. */
export async function addSpaces(unitId: string, spaces: NewSpace[]): Promise<ActionState> {
  await requireTool("/selections");

  const cleaned = spaces
    .map((space) => ({ spaceTypeId: space.spaceTypeId, label: space.label.trim() }))
    .filter((space) => space.spaceTypeId && space.label);
  if (cleaned.length === 0) return { error: "Choose at least one space." };

  // Catch collisions within the batch before the database does; the unique constraint reports only the first.
  const seen = new Set<string>();
  for (const space of cleaned) {
    const key = space.label.toLowerCase();
    if (seen.has(key))
      return { error: `Two spaces are both called “${space.label}”. Names must differ.` };
    seen.add(key);
  }

  const supabase = await createClient();

  const { data: last, error: lastError } = await supabase
    .from("spaces")
    .select("sort_order")
    .eq("unit_id", unitId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastError) {
    console.error("spaces next sort_order read failed:", lastError);
    return { error: "Could not work out where to add it. Try again." };
  }

  let sortOrder = (last?.sort_order ?? -1) + 1;
  const { error } = await supabase.from("spaces").insert(
    cleaned.map((space) => ({
      unit_id: unitId,
      space_type_id: space.spaceTypeId,
      label: space.label,
      sort_order: sortOrder++,
    })),
  );

  if (error) {
    if (error.code === "23505") {
      return { error: "One of those names is already used in this unit. Rename it and try again." };
    }
    console.error("addSpaces failed:", error);
    return { error: "Could not add the spaces. Try again." };
  }

  revalidatePath("/selections", "layout");
  return undefined;
}

export type BasketEntry = { itemId: string; quantity: number };

/**
 * Batched: Server Actions dispatch one at a time and a revalidating action re-renders the route.
 * `uom` and `indicative_rate_snapshot` are copied from the item master now on purpose: a later price edit must not rewrite an issued revision.
 */
export async function addLines(
  selectionId: string,
  unitId: string,
  spaceIds: string[],
  entries: BasketEntry[],
): Promise<ActionState> {
  const user = await requireTool("/selections");

  const wanted = entries.filter((entry) => entry.quantity > 0);
  if (spaceIds.length === 0) return { error: "Choose at least one space." };
  if (wanted.length === 0) return { error: "Add at least one item." };

  const supabase = await createClient();

  const { data: items, error: itemsError } = await supabase
    .from("items")
    .select("id, default_uom, indicative_price")
    .in(
      "id",
      wanted.map((entry) => entry.itemId),
    );
  if (itemsError || !items) {
    console.error("addLines item lookup failed:", itemsError);
    return { error: "Could not read those items. Try again." };
  }
  const itemById = new Map(items.map((item) => [item.id, item]));

  // Read to completion (fetchAll), caught for the ActionState: a partial view of existing lines would duplicate lines instead of raising their quantity.
  let existing: {
    id: string;
    unit_space_id: string;
    item_id: string;
    quantity: number;
    sort_order: number;
  }[];
  try {
    existing = await fetchAll((from, to) =>
      supabase
        .from("selection_lines")
        .select("id, unit_space_id, item_id, quantity, sort_order")
        .eq("selection_id", selectionId)
        .in("unit_space_id", spaceIds)
        .order("id")
        .range(from, to),
    );
  } catch (error) {
    console.error("addLines existing read failed:", error);
    return { error: "Could not read the current lines. Try again." };
  }

  const nextSort = new Map<string, number>();
  for (const spaceId of spaceIds) nextSort.set(spaceId, 0);
  // The same item in the same space is one line: adding it again raises the quantity. Keyed on item id, so only an identical product merges.
  const currentLine = new Map<string, { id: string; quantity: number }>();
  for (const line of existing ?? []) {
    nextSort.set(
      line.unit_space_id,
      Math.max(nextSort.get(line.unit_space_id) ?? 0, line.sort_order + 1),
    );
    currentLine.set(`${line.unit_space_id}:${line.item_id}`, {
      id: line.id,
      quantity: Number(line.quantity),
    });
  }

  const rows = [];
  const merges: { id: string; quantity: number }[] = [];

  for (const spaceId of spaceIds) {
    for (const entry of wanted) {
      const item = itemById.get(entry.itemId);
      if (!item) continue;

      const already = currentLine.get(`${spaceId}:${entry.itemId}`);
      if (already) {
        merges.push({ id: already.id, quantity: already.quantity + entry.quantity });
        continue;
      }

      const sort = nextSort.get(spaceId) ?? 0;
      nextSort.set(spaceId, sort + 1);
      rows.push({
        selection_id: selectionId,
        unit_id: unitId,
        unit_space_id: spaceId,
        item_id: entry.itemId,
        quantity: entry.quantity,
        uom: item.default_uom,
        indicative_rate_snapshot: item.indicative_price,
        sort_order: sort,
        created_by: user.id,
      });
    }
  }

  if (rows.length > 0) {
    const { error } = await supabase.from("selection_lines").insert(rows);
    if (error) {
      console.error("addLines insert failed:", error);
      return { error: "Could not add those items. Try again." };
    }
  }

  // Each merge is a different quantity on a different row, so they can't be one statement; independent, so parallel.
  if (merges.length > 0) {
    const results = await Promise.all(
      merges.map((merge) =>
        supabase.from("selection_lines").update({ quantity: merge.quantity }).eq("id", merge.id),
      ),
    );
    const failed = results.find((result) => result.error);
    if (failed?.error) {
      console.error("addLines merge failed:", failed.error);
      return {
        error: "Some items were added, but a quantity could not be updated. Check the list.",
      };
    }
  }

  revalidatePath("/selections", "layout");
  return undefined;
}

export async function updateLine(
  selectionId: string,
  lineId: string,
  quantity: number,
  uom: string,
  note: string | null,
): Promise<ActionState> {
  await requireTool("/selections");
  if (!(quantity > 0)) return { error: "Quantity must be more than zero." };
  if (!(await isActiveUom(uom))) return { error: "Choose a valid unit of measure." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("selection_lines")
    .update({ quantity, uom, designer_note: note?.trim() || null })
    .eq("id", lineId);

  if (error) {
    console.error("updateLine failed:", error);
    return { error: "Could not save the change. Try again." };
  }

  // No revalidatePath on purpose: the row already shows the value and nothing else derives from a quantity.
  void selectionId;
  return undefined;
}

export async function removeLine(selectionId: string, lineId: string): Promise<ActionState> {
  await requireTool("/selections");
  const supabase = await createClient();

  const { error } = await supabase.from("selection_lines").delete().eq("id", lineId);
  if (error) {
    console.error("removeLine failed:", error);
    return { error: "Could not remove the item. Try again." };
  }

  revalidatePath("/selections", "layout");
  return undefined;
}

/** The provisional item lands in `items` flagged provisional so the line has a real FK; approval is Masters' tidying, never a gate. */
export async function requestItem(input: {
  name: string;
  categoryId: string;
  brandId: string | null;
  specNote: string | null;
  uom: string;
}): Promise<{ error?: string; itemId?: string }> {
  await requireTool("/selections");

  const name = input.name.trim();
  if (!name) return { error: "Give the item a name." };
  if (!input.categoryId) return { error: "Choose a category." };
  if (!(await isActiveUom(input.uom))) return { error: "Choose a unit of measure." };

  const supabase = await createClient();

  // One database function, one transaction (migration 0017): two inserts left an orphan item when the second failed, and designers can't delete items.
  // No code is set; Masters assigns it on accept.
  const { data: itemId, error } = await supabase.rpc("create_item_request", {
    p_name: name,
    p_category_id: input.categoryId,
    // The casts paper over typegen typing every argument non-null; these two columns are nullable and the function handles null.
    p_brand_id: input.brandId as unknown as string,
    p_spec_note: (input.specNote?.trim() || null) as unknown as string,
    p_uom: input.uom,
  });

  if (error || !itemId) {
    console.error("requestItem failed:", error);
    return { error: "Could not create the item. Try again." };
  }

  return { itemId };
}

// Catalogue search lives in app/api/catalogue/route.ts: Server Actions dispatch one at a time (keystrokes queue) and revalidating re-renders the route.
