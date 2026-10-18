"use server";

// Type-only and never re-exported from a "use server" file (check:actions).
import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { dbErrorMessage } from "@/lib/db-error";
import { DRAWINGS_BUCKET } from "@/lib/design-management/storage";
import { GRANT } from "@/lib/design-management/shared";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// Sheets uploaded before 0124 stay (opened through files/[fileId]/route.ts); one on a draft can still be taken off.

/** Row first, then the object — a failure leaves an orphan file, never a row pointing at nothing. */
export async function deleteDrawingRevisionFile(fileId: string): Promise<ActionState> {
  await requireTool(GRANT);
  const supabase = await createClient();

  const { data: file, error: readError } = await supabase
    .from("drawing_revision_files")
    .select("storage_path")
    .eq("id", fileId)
    .maybeSingle();
  if (readError) {
    console.error("deleteDrawingRevisionFile read failed:", readError);
    return { error: "Could not remove the file. Try again." };
  }
  if (!file) return undefined; // Already gone.

  const { error } = await supabase.from("drawing_revision_files").delete().eq("id", fileId);
  if (error) {
    console.error("deleteDrawingRevisionFile delete failed:", error);
    return { error: dbErrorMessage(error, "Could not remove the file. Try again.") };
  }

  const { error: removeError } = await supabase.storage
    .from(DRAWINGS_BUCKET)
    .remove([file.storage_path]);
  if (removeError) console.error("deleteDrawingRevisionFile storage cleanup failed:", removeError);

  revalidatePath("/design-management", "layout");
  return undefined;
}
