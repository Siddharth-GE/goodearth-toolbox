"use server";

import { checked, optionalText, text } from "@/lib/form-data";
import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { isWorkFamily } from "@/lib/masters/work-families";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { deleteMaster } from "./delete-master";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Groups and items share one numbering space per category but live in two tables, so per-table UNIQUEs miss cross-table clashes; this check covers it. */
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

/** sort_order follows the code's number ×10, leaving room between; no number sorts last. */
function sortOrderFromCode(code: string, fallback: number): number {
  const match = code.match(/(\d+)\s*$/);
  return match ? Number(match[1]) * 10 : fallback;
}

function readWorksForm(formData: FormData) {
  return {
    code: text(formData, "code").toUpperCase(),
    name: text(formData, "name"),
    family: text(formData, "family"),
    category_id: text(formData, "category_id"),
    group_id: optionalText(formData, "group_id"),
    // Checkbox: checked posts "1", unchecked posts nothing; only update actions read it.
    is_active: checked(formData, "is_active", "1"),
  };
}

export async function addWorkCategory(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireTool("/masters");

  const { code, name, family } = readWorksForm(formData);
  if (!code) return { error: "Give the category a code, like FD." };
  if (!isWorkFamily(family)) return { error: "Choose what the category is part of." };
  if (code.length > 10) return { error: "Keep the code under 10 characters." };
  if (!name) return { error: "Give the category a name." };
  if (name.length > 80) return { error: "Keep the name under 80 characters." };

  const supabase = await createClient();
  const { data: last, error: lastError } = await supabase
    .from("work_categories")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastError) {
    console.error("work_categories next sort_order read failed:", lastError);
    return { error: "Could not work out where to add it. Try again." };
  }

  const { error } = await supabase.from("work_categories").insert({
    code,
    name,
    family,
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
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireTool("/masters");

  const { code, name, family, is_active } = readWorksForm(formData);
  if (!code) return { error: "Give the category a code, like FD." };
  if (!isWorkFamily(family)) return { error: "Choose what the category is part of." };
  if (!name) return { error: "Give the category a name." };
  if (name.length > 80) return { error: "Keep the name under 80 characters." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("work_categories")
    .update({ code, name, family, is_active, updated_by: user.id })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") return { error: "Another category already has that code." };
    console.error("updateWorkCategory failed:", error);
    return { error: "Could not update the category. Try again." };
  }

  revalidatePath("/masters/works");
  return undefined;
}

export async function setWorkCategoryActive(id: string, isActive: boolean): Promise<ActionState> {
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

export async function addWorkGroup(_state: ActionState, formData: FormData): Promise<ActionState> {
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
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
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

export async function setWorkGroupActive(id: string, isActive: boolean): Promise<ActionState> {
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

export async function addWorkItem(_state: ActionState, formData: FormData): Promise<ActionState> {
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
    // The picked group belongs to a different category (composite FK).
    if (error.code === "23503") return { error: "That group belongs to a different category." };
    console.error("addWorkItem failed:", error);
    return { error: "Could not add the work item. Try again." };
  }

  revalidatePath("/masters/works");
  return undefined;
}

export async function updateWorkItem(
  id: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
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

export async function setWorkItemActive(id: string, isActive: boolean): Promise<ActionState> {
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

/** Only while nothing uses it, and only by an admin (0150); anything in use is retired with Active instead. */
export async function deleteWorkCategory(id: string): Promise<ActionState> {
  const user = await requireTool("/masters");
  return deleteMaster(user, "work_categories", id, {
    noun: "work category",
    retire: true,
    paths: ["/masters/works"],
  });
}

/** Only while nothing uses it, and only by an admin (0150); anything in use is retired with Active instead. */
export async function deleteWorkGroup(id: string): Promise<ActionState> {
  const user = await requireTool("/masters");
  return deleteMaster(user, "work_groups", id, {
    noun: "work group",
    retire: true,
    paths: ["/masters/works"],
  });
}

/** Only while nothing uses it, and only by an admin (0150); anything in use is retired with Active instead. */
export async function deleteWorkItem(id: string): Promise<ActionState> {
  const user = await requireTool("/masters");
  return deleteMaster(user, "work_items", id, {
    noun: "work",
    retire: true,
    paths: ["/masters/works"],
  });
}
