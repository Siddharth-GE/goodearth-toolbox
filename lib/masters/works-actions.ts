"use server";

import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type WorksFormState = ActionState;

/**
 * Groups and items share one numbering space per category on the site
 * team's sheet (FD.3 is a group, FD.4 an item) but live in two tables,
 * so the per-table UNIQUEs cannot see a cross-table clash. This check
 * is that boundary (0073's header says so); the import script enforces
 * the same rule on the first load.
 */
async function codeInUse(
  supabase: Supabase,
  code: string,
  exclude?: { table: "work_groups" | "work_items"; id: string },
): Promise<boolean | null> {
  for (const table of ["work_groups", "work_items"] as const) {
    let query = supabase.from(table).select("id").eq("code", code).limit(1);
    if (exclude && exclude.table === table) query = query.neq("id", exclude.id);
    const { data, error } = await query;
    if (error) {
      console.error(`codeInUse read of ${table} failed:`, error);
      return null;
    }
    if (data && data.length > 0) return true;
  }
  return false;
}

/**
 * Sheet codes end in a number (FD.4 → 4), and the screen shows each
 * level in code order — so sort_order follows the code, ×10 to leave
 * room to slot something between two later. A code with no number
 * lands at the end.
 */
function sortOrderFromCode(code: string, fallback: number): number {
  const match = code.match(/(\d+)\s*$/);
  return match ? Number(match[1]) * 10 : fallback;
}

function readWorksForm(formData: FormData) {
  return {
    code: String(formData.get("code") ?? "")
      .trim()
      .toUpperCase(),
    name: String(formData.get("name") ?? "").trim(),
    category_id: String(formData.get("category_id") ?? "").trim(),
    group_id: String(formData.get("group_id") ?? "").trim() || null,
    // Checkbox convention (vendors): checked posts "1", unchecked posts
    // nothing — only the edit dialogs carry the checkbox, and only the
    // update actions read this field.
    is_active: formData.get("is_active") === "1",
  };
}

// ---------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------

export async function addWorkCategory(
  _state: WorksFormState,
  formData: FormData,
): Promise<WorksFormState> {
  const user = await requireTool("/masters");

  const { code, name } = readWorksForm(formData);
  if (!code) return { error: "Give the category a code, like FD." };
  if (code.length > 10) return { error: "Keep the code under 10 characters." };
  if (!name) return { error: "Give the category a name." };
  if (name.length > 80) return { error: "Keep the name under 80 characters." };

  const supabase = await createClient();
  const { data: last } = await supabase
    .from("work_categories")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("work_categories").insert({
    code,
    name,
    sort_order: (last?.sort_order ?? 0) + 10,
    created_by: user.id,
    updated_by: user.id,
  });
  if (error) {
    if (error.code === "23505") return { error: "That category code is already on the list." };
    console.error("addWorkCategory failed:", error);
    return { error: "Could not add the category. Try again." };
  }

  revalidatePath("/masters/works");
  return undefined;
}

export async function updateWorkCategory(
  id: string,
  _state: WorksFormState,
  formData: FormData,
): Promise<WorksFormState> {
  const user = await requireTool("/masters");

  const { code, name, is_active } = readWorksForm(formData);
  if (!code) return { error: "Give the category a code, like FD." };
  if (!name) return { error: "Give the category a name." };
  if (name.length > 80) return { error: "Keep the name under 80 characters." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("work_categories")
    .update({ code, name, is_active, updated_by: user.id })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") return { error: "Another category already has that code." };
    console.error("updateWorkCategory failed:", error);
    return { error: "Could not update the category. Try again." };
  }

  revalidatePath("/masters/works");
  return undefined;
}

export async function setWorkCategoryActive(
  id: string,
  isActive: boolean,
): Promise<WorksFormState> {
  const user = await requireTool("/masters");

  const supabase = await createClient();
  const { error } = await supabase
    .from("work_categories")
    .update({ is_active: isActive, updated_by: user.id })
    .eq("id", id);
  if (error) {
    console.error("setWorkCategoryActive failed:", error);
    return { error: "Could not update the category. Try again." };
  }

  revalidatePath("/masters/works");
  return undefined;
}

// ---------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------

export async function addWorkGroup(
  _state: WorksFormState,
  formData: FormData,
): Promise<WorksFormState> {
  const user = await requireTool("/masters");

  const { code, name, category_id } = readWorksForm(formData);
  if (!category_id) return { error: "Pick the category the group belongs to." };
  if (!code) return { error: "Give the group a code, like FD.3." };
  if (code.length > 20) return { error: "Keep the code under 20 characters." };
  if (!name) return { error: "Give the group a name." };
  if (name.length > 120) return { error: "Keep the name under 120 characters." };

  const supabase = await createClient();

  const taken = await codeInUse(supabase, code);
  if (taken === null) return { error: "Could not check the code. Try again." };
  if (taken) return { error: `${code} is already used by another group or work item.` };

  const { error } = await supabase.from("work_groups").insert({
    category_id,
    code,
    name,
    sort_order: sortOrderFromCode(code, 9990),
    created_by: user.id,
    updated_by: user.id,
  });
  if (error) {
    if (error.code === "23505") return { error: `${code} is already used.` };
    console.error("addWorkGroup failed:", error);
    return { error: "Could not add the group. Try again." };
  }

  revalidatePath("/masters/works");
  return undefined;
}

export async function updateWorkGroup(
  id: string,
  _state: WorksFormState,
  formData: FormData,
): Promise<WorksFormState> {
  const user = await requireTool("/masters");

  const { code, name, is_active } = readWorksForm(formData);
  if (!code) return { error: "Give the group a code, like FD.3." };
  if (!name) return { error: "Give the group a name." };
  if (name.length > 120) return { error: "Keep the name under 120 characters." };

  const supabase = await createClient();

  const taken = await codeInUse(supabase, code, { table: "work_groups", id });
  if (taken === null) return { error: "Could not check the code. Try again." };
  if (taken) return { error: `${code} is already used by another group or work item.` };

  const { error } = await supabase
    .from("work_groups")
    .update({
      code,
      name,
      is_active,
      sort_order: sortOrderFromCode(code, 9990),
      updated_by: user.id,
    })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") return { error: `${code} is already used.` };
    console.error("updateWorkGroup failed:", error);
    return { error: "Could not update the group. Try again." };
  }

  revalidatePath("/masters/works");
  return undefined;
}

export async function setWorkGroupActive(id: string, isActive: boolean): Promise<WorksFormState> {
  const user = await requireTool("/masters");

  const supabase = await createClient();
  const { error } = await supabase
    .from("work_groups")
    .update({ is_active: isActive, updated_by: user.id })
    .eq("id", id);
  if (error) {
    console.error("setWorkGroupActive failed:", error);
    return { error: "Could not update the group. Try again." };
  }

  revalidatePath("/masters/works");
  return undefined;
}

// ---------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------

export async function addWorkItem(
  _state: WorksFormState,
  formData: FormData,
): Promise<WorksFormState> {
  const user = await requireTool("/masters");

  const { code, name, category_id, group_id } = readWorksForm(formData);
  if (!category_id) return { error: "Pick the category the work belongs to." };
  if (!code) return { error: "Give the work a code, like FD.4." };
  if (code.length > 20) return { error: "Keep the code under 20 characters." };
  if (!name) return { error: "Describe the work." };
  if (name.length > 200) return { error: "Keep the description under 200 characters." };

  const supabase = await createClient();

  const taken = await codeInUse(supabase, code);
  if (taken === null) return { error: "Could not check the code. Try again." };
  if (taken) return { error: `${code} is already used by another group or work item.` };

  const { error } = await supabase.from("work_items").insert({
    category_id,
    group_id,
    code,
    name,
    sort_order: sortOrderFromCode(code, 9990),
    created_by: user.id,
    updated_by: user.id,
  });
  if (error) {
    if (error.code === "23505") return { error: `${code} is already used.` };
    // The composite FK: the picked group belongs to a different category.
    if (error.code === "23503") return { error: "That group belongs to a different category." };
    console.error("addWorkItem failed:", error);
    return { error: "Could not add the work item. Try again." };
  }

  revalidatePath("/masters/works");
  return undefined;
}

export async function updateWorkItem(
  id: string,
  _state: WorksFormState,
  formData: FormData,
): Promise<WorksFormState> {
  const user = await requireTool("/masters");

  const { code, name, group_id, is_active } = readWorksForm(formData);
  if (!code) return { error: "Give the work a code, like FD.4." };
  if (!name) return { error: "Describe the work." };
  if (name.length > 200) return { error: "Keep the description under 200 characters." };

  const supabase = await createClient();

  const taken = await codeInUse(supabase, code, { table: "work_items", id });
  if (taken === null) return { error: "Could not check the code. Try again." };
  if (taken) return { error: `${code} is already used by another group or work item.` };

  const { error } = await supabase
    .from("work_items")
    .update({
      code,
      name,
      group_id,
      is_active,
      sort_order: sortOrderFromCode(code, 9990),
      updated_by: user.id,
    })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") return { error: `${code} is already used.` };
    if (error.code === "23503") return { error: "That group belongs to a different category." };
    console.error("updateWorkItem failed:", error);
    return { error: "Could not update the work item. Try again." };
  }

  revalidatePath("/masters/works");
  return undefined;
}

export async function setWorkItemActive(id: string, isActive: boolean): Promise<WorksFormState> {
  const user = await requireTool("/masters");

  const supabase = await createClient();
  const { error } = await supabase
    .from("work_items")
    .update({ is_active: isActive, updated_by: user.id })
    .eq("id", id);
  if (error) {
    console.error("setWorkItemActive failed:", error);
    return { error: "Could not update the work item. Try again." };
  }

  revalidatePath("/masters/works");
  return undefined;
}
