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
    return { error: dbErrorMessage(error, "Could not keep the folder's list. Try again.") };
  }
  return {};
}
