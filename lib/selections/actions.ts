"use server";

import { requireApp } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// Re-declared rather than imported from queries.ts: that module is
// "server-only", and importing a *value* from it into this file-level
// "use server" module drags the server-only chain into the client bundle
// and breaks the production build (see CLAUDE.md, "Shared masters").
const UOMS = ["each", "rft", "sqft", "lumpsum", "bag", "kg", "litre", "cft"];

export type ActionState = { error?: string } | undefined;

/** Every mutation here needs the same two lines first. */
async function authorize() {
  const user = await requireUser();
  await requireApp(user, "/selections");
  return user;
}

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
  const user = await authorize();
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

  revalidatePath("/selections");
  redirect(`/selections/${data.id}`);
}

export async function deleteDraft(selectionId: string): Promise<ActionState> {
  await authorize();
  const supabase = await createClient();

  // Lines first: the immutability trigger checks the parent's status, and
  // the parent must still exist and still be a draft when it does.
  const { error: linesError } = await supabase
    .from("selection_lines")
    .delete()
    .eq("selection_id", selectionId);
  if (linesError) {
    console.error("deleteDraft lines failed:", linesError);
    return { error: "Could not discard this draft. Try again." };
  }

  const { error } = await supabase.from("selections").delete().eq("id", selectionId);
  if (error) {
    console.error("deleteDraft failed:", error);
    return { error: "Could not discard this draft. Try again." };
  }

  revalidatePath("/selections");
  redirect("/selections");
}

// ---------------------------------------------------------------------
// Spaces
// ---------------------------------------------------------------------

export async function addSpace(
  unitId: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await authorize();

  const spaceTypeId = String(formData.get("space_type_id") ?? "");
  const label = String(formData.get("label") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  if (!spaceTypeId) return { error: "Choose a space type." };
  if (!label) return { error: "Give this space a name, e.g. “Bedroom 1”." };

  const supabase = await createClient();

  // Append to the end of the unit's existing spaces.
  const { data: last } = await supabase
    .from("spaces")
    .select("sort_order")
    .eq("unit_id", unitId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("spaces").insert({
    unit_id: unitId,
    space_type_id: spaceTypeId,
    label,
    description,
    sort_order: (last?.sort_order ?? -1) + 1,
  });

  if (error) {
    if (error.code === "23505") return { error: `This unit already has a space called “${label}”.` };
    console.error("addSpace failed:", error);
    return { error: "Could not add the space. Try again." };
  }

  revalidatePath("/selections", "layout");
  return undefined;
}

export async function removeSpace(spaceId: string): Promise<ActionState> {
  await authorize();
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
  const user = await authorize();

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

  // Existing sort_order high-water mark per space, so new lines append
  // rather than interleave with what's already there.
  const { data: existing } = await supabase
    .from("selection_lines")
    .select("unit_space_id, sort_order")
    .eq("selection_id", selectionId)
    .in("unit_space_id", spaceIds);

  const nextSort = new Map<string, number>();
  for (const spaceId of spaceIds) nextSort.set(spaceId, 0);
  for (const line of existing ?? []) {
    nextSort.set(line.unit_space_id, Math.max(nextSort.get(line.unit_space_id) ?? 0, line.sort_order + 1));
  }

  const rows = [];
  for (const spaceId of spaceIds) {
    for (const entry of wanted) {
      const item = itemById.get(entry.itemId);
      if (!item) continue;
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

  const { error } = await supabase.from("selection_lines").insert(rows);
  if (error) {
    console.error("addLines failed:", error);
    return { error: "Could not add those items. Try again." };
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
  await authorize();
  if (!(quantity > 0)) return { error: "Quantity must be more than zero." };
  if (!UOMS.includes(uom)) return { error: "Choose a valid unit of measure." };

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
  await authorize();
  const supabase = await createClient();

  const { error } = await supabase.from("selection_lines").delete().eq("id", lineId);
  if (error) {
    console.error("removeLine failed:", error);
    return { error: "Could not remove the item. Try again." };
  }

  revalidatePath(`/selections/${selectionId}`);
  return undefined;
}

// Catalogue search deliberately lives in app/api/catalogue/route.ts, not
// here. It is a read, and Server Actions are the wrong tool for reads:
// they dispatch one at a time per client (so keystrokes queue) and a
// revalidating action re-renders the whole route. See that file.
