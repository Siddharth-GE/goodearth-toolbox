import "server-only";

import { revalidatePath } from "next/cache";

import type { ActionState } from "@/lib/action-state";
import type { getCurrentUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

import { deleteRefusal } from "./delete-refusal";

type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export type MasterTable =
  | "projects"
  | "plots"
  | "units"
  | "clients"
  | "vendors"
  | "items"
  | "stores"
  | "companies"
  | "document_terms"
  | "item_categories"
  | "brands"
  | "construction_stages"
  | "progress_stages"
  | "uoms"
  | "work_categories"
  | "work_groups"
  | "work_items";

/**
 * The one delete every master shares (0150): an admin's, only while nothing uses it. The caller has passed requireTool;
 * the policy admits admins alone and the keys and guards refuse anything in use, so this only words the answer.
 */
export async function deleteMaster(
  user: CurrentUser,
  table: MasterTable,
  id: string,
  { noun, retire, paths }: { noun: string; retire: boolean; paths: string[] },
): Promise<ActionState> {
  if (user.profile?.role !== "admin") return { error: `Only an admin can delete a ${noun}.` };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from(table as "vendors")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) {
    const message = deleteRefusal(error, noun, retire);
    if (message.startsWith("Could not")) console.error(`delete ${table} failed:`, error);
    return { error: message };
  }
  // Nothing came back: gone already, or a session missing its emailed code (is_admin() wants both).
  if (!data?.length) {
    return {
      error: `That ${noun} could not be deleted. Reload the page; if it is still there, sign in again.`,
    };
  }

  for (const path of paths) revalidatePath(path, "layout");
  return undefined;
}
