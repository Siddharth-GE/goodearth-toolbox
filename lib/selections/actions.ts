"use server";

import { requireTool } from "@/lib/auth/access";
// constants.ts is import-free, which is what makes it safe to use as
// VALUES from this file-level "use server" module — importing them from
// a "server-only" module instead would drag that chain into the client
// bundle and break the production build (see CLAUDE.md, "Shared masters").
import { isUom } from "@/lib/masters/constants";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { ActionState } from "@/lib/action-state";
export type { ActionState };

// ---------------------------------------------------------------------
// Revisions
// ---------------------------------------------------------------------

/**
 * Starts revision 0 for a unit that has never been designed.
 *
 * The database enforces one draft per unit (partial unique index), so a
 * double submission surfaces as a duplicate-key error rather than two
 * competing drafts — caught below and reported plainly.
 */
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

  // "layout" everywhere a revision's status or structure changes: the
  // list page and any open editor screen both derive from it, so the
  // whole segment revalidates — same rule Budgets follows.
  revalidatePath("/selections", "layout");
  redirect(`/selections/${data.id}`);
}

/**
 * Locks a revision and hands it to the budget team.
 *
 * The two-row update (this revision issued, the previous superseded) runs
 * inside issue_selection() in the database so it cannot half-happen —
 * a unit must never end up with two live issued revisions.
 */
export async function issueSelection(
  selectionId: string,
  notes: string | null,
): Promise<ActionState> {
  await requireTool("/selections");
  const supabase = await createClient();

  // Written before issuing, while the row is still a draft — the guard
  // trigger refuses edits to anything already issued.
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
    // These come from RAISE EXCEPTION in the function and are already
    // written for a person to read.
    return { error: error.message.replace(/^.*?:\s*/, "") || "Could not issue this revision." };
  }

  revalidatePath("/selections", "layout");
  return undefined;
}

/**
 * Opens R+1 as a draft, copied forward from an issued revision.
 * Line keys are carried over by the database function — that is what lets
 * Budgets keep pricing on lines that didn't change.
 */
export async function createNextRevision(fromSelectionId: string): Promise<ActionState> {
  await requireTool("/selections");
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("create_next_revision", {
    p_from_selection_id: fromSelectionId,
  });
  if (error) {
    console.error("createNextRevision failed:", error);
    return {
      error: error.message.replace(/^.*?:\s*/, "") || "Could not create the next revision.",
    };
  }

  revalidatePath("/selections", "layout");
  redirect(`/selections/${data}`);
}

export async function deleteDraft(selectionId: string): Promise<ActionState> {
  await requireTool("/selections");
  const supabase = await createClient();

  // One database function, one transaction (migration 0017). This used
  // to be two requests — delete the lines, then the draft — and a
  // failure between them (someone issuing the draft at that moment)
  // stranded a draft with every line permanently gone.
  const { error } = await supabase.rpc("delete_draft_selection", {
    p_selection_id: selectionId,
  });
  if (error) {
    console.error("deleteDraft failed:", error);
    return {
      error: error.message.replace(/^.*?:\s*/, "") || "Could not discard this draft. Try again.",
    };
  }

  revalidatePath("/selections", "layout");
  redirect("/selections");
}

// ---------------------------------------------------------------------
// Spaces
// ---------------------------------------------------------------------

export type NewSpace = { spaceTypeId: string; label: string };

/**
 * Creates a unit's spaces in one call.
 *
 * Setting up a villa means eight or nine spaces, and doing that as eight
 * separate dialogs was the slowest part of starting a design. Labels
 * arrive already resolved from the client (auto-suggested, then editable
 * before committing) rather than being generated here, so what the
 * designer approved on screen is exactly what gets written.
 */
export async function addSpaces(unitId: string, spaces: NewSpace[]): Promise<ActionState> {
  await requireTool("/selections");

  const cleaned = spaces
    .map((space) => ({ spaceTypeId: space.spaceTypeId, label: space.label.trim() }))
    .filter((space) => space.spaceTypeId && space.label);
  if (cleaned.length === 0) return { error: "Choose at least one space." };

  // Catch collisions within the batch itself before the database does —
  // the unique constraint would report only the first one.
  const seen = new Set<string>();
  for (const space of cleaned) {
    const key = space.label.toLowerCase();
    if (seen.has(key))
      return { error: `Two spaces are both called “${space.label}”. Names must differ.` };
    seen.add(key);
  }

  const supabase = await createClient();

  const { data: last } = await supabase
    .from("spaces")
    .select("sort_order")
    .eq("unit_id", unitId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

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

export async function removeSpace(spaceId: string): Promise<ActionState> {
  await requireTool("/selections");
  const supabase = await createClient();

  const { error } = await supabase.from("spaces").delete().eq("id", spaceId);
  if (error) {
    // 23503 = still referenced by selection_lines. That's the FK doing its
    // job, not a bug — a space holding lines must not silently vanish.
    if (error.code === "23503") {
      return { error: "This space still has items in it. Remove them first." };
    }
    console.error("removeSpace failed:", error);
    return { error: "Could not remove the space. Try again." };
  }

  revalidatePath("/selections", "layout");
  return undefined;
}

// ---------------------------------------------------------------------
// Lines
// ---------------------------------------------------------------------

export type BasketEntry = { itemId: string; quantity: number };

/**
 * Adds a whole basket of items to one or more spaces in a single call.
 *
 * Deliberately batched. Server Actions dispatch one at a time per client
 * and a revalidating action re-renders the entire route server-side, so
 * adding twelve items as twelve calls meant twelve queued round trips,
 * each re-running every query on the page. The designer now assembles the
 * basket locally — which costs nothing — and this writes it in one go.
 *
 * `uom` and `indicative_rate_snapshot` are copied from the item master at
 * this moment on purpose: a price edited months later must never rewrite
 * what an issued revision was specified against.
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

  // One query for every item's uom and price, not one per line.
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

  // What's already in these spaces: needed both to append new lines after
  // the existing ones, and to consolidate rather than duplicate. Read to
  // completion (fetchAll) and never silently on error — a partial or
  // missing view of the existing lines would break exactly the merge
  // promise this function makes, duplicating lines instead of raising
  // their quantity.
  const { data: existing, error: existingError } = await fetchAll((from, to) =>
    supabase
      .from("selection_lines")
      .select("id, unit_space_id, item_id, quantity, sort_order")
      .eq("selection_id", selectionId)
      .in("unit_space_id", spaceIds)
      .order("id")
      .range(from, to),
  );
  if (existingError) {
    console.error("addLines existing read failed:", existingError);
    return { error: "Could not read the current lines. Try again." };
  }

  const nextSort = new Map<string, number>();
  for (const spaceId of spaceIds) nextSort.set(spaceId, 0);
  // The same item in the same space is one line, not two — adding a
  // second Aluminium Profile to the Living raises the quantity on the
  // line already there. Keyed on item id, so it only merges a genuinely
  // identical product, never two similar ones.
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

  // Each merge is a different quantity on a different row, so they can't
  // be one statement. They're independent, so they go in parallel — this
  // is server-side, with none of the client's one-at-a-time dispatch.
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

  revalidatePath(`/selections/${selectionId}`);
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
  if (!isUom(uom)) return { error: "Choose a valid unit of measure." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("selection_lines")
    .update({ quantity, uom, designer_note: note?.trim() || null })
    .eq("id", lineId);

  if (error) {
    console.error("updateLine failed:", error);
    return { error: "Could not save the change. Try again." };
  }

  // No revalidatePath on purpose. The row on screen already shows the new
  // value, and nothing else on the page derives from a quantity — the rail
  // counts lines, not amounts. Revalidating here would re-render the whole
  // route (four queries) after every field a designer tabs out of.
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

  revalidatePath(`/selections/${selectionId}`);
  return undefined;
}

// ---------------------------------------------------------------------
// Item requests
// ---------------------------------------------------------------------

/**
 * Creates a provisional item and raises a request for it, without the
 * designer leaving the editor.
 *
 * The item lands in `items` immediately, flagged provisional, so the
 * selection line has a real foreign key from the start — there is no
 * parallel "custom line" concept to reconcile later. Approval is a
 * tidying step for Masters, never a gate on the designer's work.
 */
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
  if (!isUom(input.uom)) return { error: "Choose a unit of measure." };

  const supabase = await createClient();

  // One database function, one transaction (migration 0017). This used
  // to be two inserts — the provisional item, then the request — and
  // when the second failed, the item survived alone: pickable in the
  // catalogue, invisible to Masters' queue, with each retry minting
  // another orphan. Designers have no delete right on items (correctly),
  // so only a transaction could clean up after itself. No code is set:
  // codes follow the catalogue's own convention and are assigned when
  // Masters accepts the item.
  const { data: itemId, error } = await supabase.rpc("create_item_request", {
    p_name: name,
    p_category_id: input.categoryId,
    // The casts paper over a typegen limitation: it types every function
    // argument non-null, but these two columns are nullable and the
    // function handles null fine — "no brand" and "no note" are real
    // inputs, and PostgREST passes the JSON null straight through.
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

// Catalogue search deliberately lives in app/api/catalogue/route.ts, not
// here. It is a read, and Server Actions are the wrong tool for reads:
// they dispatch one at a time per client (so keystrokes queue) and a
// revalidating action re-renders the whole route. See that file.
