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

/**
 * Adds a catalogue item to a space.
 *
 * `uom` and `indicative_rate_snapshot` are copied from the item master at
 * this moment on purpose: a price edited months later must never rewrite
 * what an issued revision was specified against.
 */
export async function addLine(
  selectionId: string,
  unitId: string,
  spaceId: string,
  itemId: string,
  quantity: number,
  note?: string,
): Promise<ActionState> {
  const user = await authorize();
  if (!(quantity > 0)) return { error: "Quantity must be more than zero." };

  const supabase = await createClient();

  const { data: item, error: itemError } = await supabase
    .from("items")
    .select("default_uom, indicative_price")
    .eq("id", itemId)
    .single();
  if (itemError || !item) return { error: "That item no longer exists." };

  const { data: last } = await supabase
    .from("selection_lines")
    .select("sort_order")
    .eq("selection_id", selectionId)
    .eq("unit_space_id", spaceId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("selection_lines").insert({
    selection_id: selectionId,
    unit_id: unitId,
    unit_space_id: spaceId,
    item_id: itemId,
    quantity,
    uom: item.default_uom,
    indicative_rate_snapshot: item.indicative_price,
    designer_note: note?.trim() || null,
    sort_order: (last?.sort_order ?? -1) + 1,
    created_by: user.id,
  });

  if (error) {
    console.error("addLine failed:", error);
    return { error: "Could not add the item. Try again." };
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

  revalidatePath(`/selections/${selectionId}`);
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

// ---------------------------------------------------------------------
// Catalogue search (server action, not a query file)
// ---------------------------------------------------------------------

export type CatalogueItem = {
  id: string;
  code: string | null;
  name: string;
  thumb_url: string | null;
  category_id: string;
  indicative_price: number | null;
  default_uom: string;
  is_provisional: boolean;
};

export type CatalogueSearchResult = { items: CatalogueItem[]; total: number; pageCount: number };

/**
 * Powers the picker. Lives here rather than in queries.ts because the
 * picker is a Client Component that calls it directly as a server action,
 * which a "server-only" module cannot be.
 */
export async function searchCatalogue(params: {
  search?: string;
  categoryId?: string;
  placement?: string;
  page?: number;
}): Promise<CatalogueSearchResult> {
  await authorize();

  const pageSize = 30;
  const page = Math.max(1, Math.floor(params.page ?? 1));
  const supabase = await createClient();

  let query = supabase
    .from("items")
    .select("id, code, name, thumb_url, category_id, indicative_price, default_uom, is_provisional", {
      count: "exact",
    })
    .eq("is_active", true)
    // Names repeat in their hundreds ("Hanging Light"); without a unique
    // tiebreaker the same row shows on two pages and another never shows.
    .order("name")
    .order("id")
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (params.categoryId) query = query.eq("category_id", params.categoryId);
  if (params.placement) query = query.eq("placement", params.placement);
  if (params.search) {
    // `,` `(` `)` delimit PostgREST's or-filter — strip them or a stray
    // comma builds a malformed query.
    const search = params.search.replace(/[,()]/g, " ").trim();
    if (search) query = query.or(`name.ilike.%${search}%,code.ilike.%${search}%`);
  }

  const { data, count, error } = await query;
  if (error) {
    console.error("searchCatalogue failed:", error);
    return { items: [], total: 0, pageCount: 1 };
  }

  const total = count ?? 0;
  return {
    items: (data ?? []) as CatalogueItem[],
    total,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}
