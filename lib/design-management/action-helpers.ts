import "server-only";

import { dbErrorMessage } from "@/lib/db-error";
import { readWorkDriveFolder } from "@/lib/design-management/workdrive";
import { createClient } from "@/lib/supabase/server";

// Shared by the stage, revision and transmittal action files; not "use server", so it may export constants and types.

export const NAME_LIMIT = 120;

export type DesignClient = Awaited<ReturnType<typeof createClient>>;

/** Replaces the draft's kept list with the folder's contents (0124: delete, then insert, no UPDATE policy). A failed read touches nothing. Not an action: callers gate and revalidate. */
export async function keepFolderList(
  supabase: DesignClient,
  userId: string,
  revisionId: string,
  linkId: string,
): Promise<{ error?: string }> {
  const read = await readWorkDriveFolder(linkId);
  if (!read.ok) return { error: read.reason };

  // Read first, so a failed insert puts the last list back rather than leaving none.
  const { data: kept, error: keptError } = await supabase
    .from("drawing_revision_folder_sheets")
    .select("workdrive_id, name, size_bytes, modified_at, sort_order, created_by")
    .eq("drawing_revision_id", revisionId);
  if (keptError) {
    console.error("keepFolderList read failed:", keptError);
    return { error: "Could not keep the folder's list. Try again." };
  }

  const { error: clearError } = await supabase
    .from("drawing_revision_folder_sheets")
    .delete()
    .eq("drawing_revision_id", revisionId);
  if (clearError) {
    console.error("keepFolderList clear failed:", clearError);
    return { error: dbErrorMessage(clearError, "Could not keep the folder's list. Try again.") };
  }
  if (read.sheets.length === 0) {
    return {
      error:
        read.skippedFolders.length > 0
          ? `The folder holds only other folders (${read.skippedFolders.join(", ")}). Share the folder the sheets are in.`
          : "The folder is empty. Put the sheets in it, then read it again.",
    };
  }

  const { error } = await supabase.from("drawing_revision_folder_sheets").insert(
    read.sheets.map((sheet, index) => ({
      drawing_revision_id: revisionId,
      workdrive_id: sheet.workdriveId,
      name: sheet.name,
      size_bytes: sheet.sizeBytes,
      modified_at: sheet.modifiedAt,
      sort_order: index,
      created_by: userId,
    })),
  );
  if (error) {
    console.error("keepFolderList insert failed:", error);
    if (kept.length > 0) {
      const { error: restoreError } = await supabase
        .from("drawing_revision_folder_sheets")
        .insert(kept.map((sheet) => ({ ...sheet, drawing_revision_id: revisionId })));
      if (restoreError) console.error("keepFolderList restore failed:", restoreError);
    }
    return { error: dbErrorMessage(error, "Could not keep the folder's list. Try again.") };
  }
  return {};
}
