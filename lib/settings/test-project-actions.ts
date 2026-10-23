"use server";

import { requireAdmin } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// Type-only import, not re-exported from a "use server" file (npm run check:actions).
import type { ActionState } from "@/lib/action-state";

/**
 * The red button: everything under one test project, gone. The database decides what that is (delete_test_project, 0142) and
 * refuses a project not marked test, or one tangled with real records — its words are shown as they are.
 */
export async function deleteTestProject(projectId: string): Promise<ActionState> {
  const user = await requireUser();
  await requireAdmin(user);
  if (!projectId) return { error: "Which test project?" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_test_project", { p_project: projectId });
  if (error) {
    console.error("deleteTestProject failed:", error);
    if (error.code === "P0001") return { error: error.message };
    return { error: "Could not delete the test project. Nothing was deleted — try again." };
  }
  revalidatePath("/", "layout");
  return undefined;
}
