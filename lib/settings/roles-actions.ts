"use server";

import { checked, rawText, text } from "@/lib/form-data";
import { requireAdmin } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { GRANTABLE_TOOLS } from "@/lib/tools";
import { revalidatePath } from "next/cache";

// Type-only import, not re-exported from a "use server" file (npm run check:actions).
import type { ActionState } from "@/lib/action-state";

function isGrantable(app: string) {
  return GRANTABLE_TOOLS.some((tool) => tool.href === app);
}

function readLimit(raw: string): { limit: number | null } | { error: string } {
  const text = raw.trim();
  if (text === "") return { limit: null };
  const parsed = Number(text.replace(/,/g, ""));
  if (!Number.isFinite(parsed)) {
    return { error: "Enter an amount, or leave it blank for no limit." };
  }
  if (parsed <= 0) return { error: "Leave it blank for no limit — zero would approve nothing." };
  return { limit: parsed };
}

export async function createRole(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  await requireAdmin(user);

  const name = text(formData, "name");
  if (!name) return { error: "Give the role a name, e.g. Site Engineer." };
  if (name.length > 60) return { error: "Keep the name under 60 characters." };

  const parsed = readLimit(rawText(formData, "bill_approval_limit"));
  if ("error" in parsed) return { error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase.from("roles").insert({
    name,
    can_approve_indents: checked(formData, "can_approve_indents", "1"),
    can_approve_bills: checked(formData, "can_approve_bills", "1"),
    bill_approval_limit: parsed.limit,
    created_by: user.id,
  });
  if (error) {
    if (error.code === "23505") return { error: "A role with that name already exists." };
    console.error("createRole failed:", error);
    return { error: "Could not create the role. Try again." };
  }

  revalidatePath("/settings", "layout");
  return undefined;
}

export async function updateRole(
  roleId: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  await requireAdmin(user);

  const name = text(formData, "name");
  if (!name) return { error: "Give the role a name, e.g. Site Engineer." };
  if (name.length > 60) return { error: "Keep the name under 60 characters." };

  const parsed = readLimit(rawText(formData, "bill_approval_limit"));
  if ("error" in parsed) return { error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from("roles")
    .update({
      name,
      can_approve_indents: checked(formData, "can_approve_indents", "1"),
      can_approve_bills: checked(formData, "can_approve_bills", "1"),
      bill_approval_limit: parsed.limit,
      updated_by: user.id,
    })
    .eq("id", roleId);
  if (error) {
    if (error.code === "23505") return { error: "A role with that name already exists." };
    console.error("updateRole failed:", error);
    return { error: "Could not save the role. Try again." };
  }

  revalidatePath("/settings", "layout");
  return undefined;
}

/** Deleted only when nobody holds it: the FK is `on delete restrict` (0034) so it can't quietly strip access. 23503 is that refusal. */
export async function deleteRole(roleId: string): Promise<ActionState> {
  const user = await requireUser();
  await requireAdmin(user);

  const supabase = await createClient();
  const { error } = await supabase.from("roles").delete().eq("id", roleId);
  if (error) {
    if (error.code === "23503") {
      return { error: "Some people still hold this role — move them to another one first." };
    }
    console.error("deleteRole failed:", error);
    return { error: "Could not delete the role. Try again." };
  }

  revalidatePath("/settings", "layout");
  return undefined;
}

export async function addRoleApp(roleId: string, app: string): Promise<ActionState> {
  const user = await requireUser();
  await requireAdmin(user);
  if (!isGrantable(app)) return { error: `"${app}" is not an app that can be granted.` };

  const supabase = await createClient();
  const { error } = await supabase.from("role_apps").insert({ role_id: roleId, app });
  if (error && error.code !== "23505") {
    console.error("addRoleApp failed:", error);
    return { error: "Could not add that app to the role. Try again." };
  }

  revalidatePath("/settings", "layout");
  return undefined;
}

export async function removeRoleApp(roleId: string, app: string): Promise<ActionState> {
  const user = await requireUser();
  await requireAdmin(user);

  const supabase = await createClient();
  const { error } = await supabase.from("role_apps").delete().eq("role_id", roleId).eq("app", app);
  if (error) {
    console.error("removeRoleApp failed:", error);
    return { error: "Could not remove that app from the role. Try again." };
  }

  revalidatePath("/settings", "layout");
  return undefined;
}

export async function setPersonRole(userId: string, roleId: string): Promise<ActionState> {
  const user = await requireUser();
  await requireAdmin(user);

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ role_id: roleId || null })
    .eq("id", userId);
  if (error) {
    console.error("setPersonRole failed:", error);
    return { error: "Could not change their role. Try again." };
  }

  revalidatePath("/settings", "layout");
  return undefined;
}
