"use server";

// Type-only and never re-exported from a "use server" file (check:actions).
import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { dbErrorMessage } from "@/lib/db-error";
import { keepFolderList } from "@/lib/design-management/action-helpers";
import { GRANT } from "@/lib/design-management/shared";
import { parseWorkDriveLink } from "@/lib/design-management/workdrive-link";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

// Every action opens with requireTool and ends by revalidating the layout.

export async function updateDraftRevisionNote(
  revisionId: string,
  note: string,
): Promise<ActionState> {
  await requireTool(GRANT);
  const supabase = await createClient();

  const { error } = await supabase
    .from("drawing_revisions")
    .update({ note: note.trim() || null })
    .eq("id", revisionId);
  if (error) {
    console.error("updateDraftRevisionNote failed:", error);
    return { error: dbErrorMessage(error, "Could not save the note. Try again.") };
  }

  revalidatePath("/design-management", "layout");
  return undefined;
}

/** Written as one whole-list diff. The draft-only trigger refuses it once the revision has gone to site; that refusal is surfaced, not thrown. */
export async function setDrawingRevisionWorks(
  revisionId: string,
  workItemIds: string[],
): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const supabase = await createClient();

  const { data: existingRows, error: readError } = await supabase
    .from("drawing_revision_works")
    .select("work_item_id")
    .eq("drawing_revision_id", revisionId);
  if (readError) {
    console.error("setDrawingRevisionWorks read failed:", readError);
    return { error: "Could not load the current work links. Try again." };
  }

  const existing = new Set((existingRows ?? []).map((row) => row.work_item_id));
  const next = new Set(workItemIds);
  const toAdd = [...next].filter((workItemId) => !existing.has(workItemId));
  const toRemove = [...existing].filter((workItemId) => !next.has(workItemId));

  if (toAdd.length > 0) {
    const { error } = await supabase.from("drawing_revision_works").insert(
      toAdd.map((workItemId) => ({
        drawing_revision_id: revisionId,
        work_item_id: workItemId,
        created_by: user.id,
      })),
    );
    if (error) {
      console.error("setDrawingRevisionWorks insert failed:", error);
      return { error: dbErrorMessage(error, "Could not save the work links. Try again.") };
    }
  }

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("drawing_revision_works")
      .delete()
      .eq("drawing_revision_id", revisionId)
      .in("work_item_id", toRemove);
    if (error) {
      console.error("setDrawingRevisionWorks delete failed:", error);
      return { error: dbErrorMessage(error, "Could not save the work links. Try again.") };
    }
  }

  revalidatePath("/design-management", "layout");
  return undefined;
}

/**
 * The designer's revision number while a draft (0124): a set the team had at R2 in Excel starts at R3. The guard refuses a number at or below one already used
 * on this villa, and any change once it has gone to site; its sentence is passed through.
 */
export async function setDraftRevisionNumber(
  revisionId: string,
  revisionNo: number,
): Promise<ActionState> {
  await requireTool(GRANT);
  if (!Number.isInteger(revisionNo) || revisionNo < 0 || revisionNo > 99) {
    return { error: "A revision is a whole number from 0 to 99." };
  }
  const supabase = await createClient();

  const { error } = await supabase
    .from("drawing_revisions")
    .update({ revision_no: revisionNo })
    .eq("id", revisionId)
    .eq("status", "draft");
  if (error) {
    if (error.code === "23505") {
      return { error: `R${revisionNo} is already used for this set. Pick a higher number.` };
    }
    console.error("setDraftRevisionNumber failed:", error);
    return { error: dbErrorMessage(error, "Could not change the revision number. Try again.") };
  }

  revalidatePath("/design-management", "layout");
  return undefined;
}

/**
 * The drawings are a WorkDrive share link (0124). Saving reads the folder straight away. An empty link clears the link and list from the draft.
 * The link is stored rebuilt from its id (`parseWorkDriveLink`), never as typed. An unreadable folder keeps its link and says why.
 */
export async function setDraftDrawingsLink(
  revisionId: string,
  input: string,
): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const supabase = await createClient();

  if (!input.trim()) {
    const { error: clearError } = await supabase
      .from("drawing_revision_folder_sheets")
      .delete()
      .eq("drawing_revision_id", revisionId);
    if (clearError) {
      console.error("setDraftDrawingsLink list clear failed:", clearError);
      return { error: dbErrorMessage(clearError, "Could not take the link off. Try again.") };
    }
    const { error } = await supabase
      .from("drawing_revisions")
      .update({ drawings_url: null })
      .eq("id", revisionId)
      .eq("status", "draft");
    if (error) {
      console.error("setDraftDrawingsLink clear failed:", error);
      return { error: dbErrorMessage(error, "Could not take the link off. Try again.") };
    }
    revalidatePath("/design-management", "layout");
    return undefined;
  }

  const parsed = parseWorkDriveLink(input);
  if (!parsed.ok) return { error: parsed.error };

  const { error } = await supabase
    .from("drawing_revisions")
    .update({ drawings_url: parsed.url })
    .eq("id", revisionId)
    .eq("status", "draft");
  if (error) {
    console.error("setDraftDrawingsLink failed:", error);
    return { error: dbErrorMessage(error, "Could not save the link. Try again.") };
  }

  const read = await keepFolderList(supabase, user.id, revisionId, parsed.linkId);
  revalidatePath("/design-management", "layout");
  return read.error
    ? { error: `The link is saved, but the folder could not be read: ${read.error}` }
    : undefined;
}

export async function readDraftFolder(revisionId: string): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const supabase = await createClient();

  const { data: revision, error } = await supabase
    .from("drawing_revisions")
    .select("drawings_url, status")
    .eq("id", revisionId)
    .maybeSingle();
  if (error) {
    console.error("readDraftFolder read failed:", error);
    return { error: "Could not read the folder. Try again." };
  }
  if (!revision || revision.status !== "draft") {
    return { error: "This drawing has gone to site — its list is fixed." };
  }
  const parsed = revision.drawings_url ? parseWorkDriveLink(revision.drawings_url) : null;
  if (!parsed?.ok) return { error: "Paste the folder's WorkDrive share link first." };

  const read = await keepFolderList(supabase, user.id, revisionId, parsed.linkId);
  revalidatePath("/design-management", "layout");
  return read.error ? { error: read.error } : undefined;
}
