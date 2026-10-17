"use server";

// Type-only import, never re-exported from a "use server" file — the
// 2026-08-03 outage rule, enforced by npm run check:actions.
import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { dbErrorMessage } from "@/lib/db-error";
import { GRANT } from "@/lib/design-management/shared";
import { normaliseStageCode } from "@/lib/drawings/sheet-name";
import { DRAWINGS_BUCKET } from "@/lib/design-management/storage";
import { readWorkDriveFolder } from "@/lib/design-management/workdrive";
import { parseWorkDriveLink } from "@/lib/design-management/workdrive-link";
import { text } from "@/lib/form-data";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const NAME_LIMIT = 120;
const NOTE_LIMIT = 1000;

/**
 * Writes for the Design Management app: design stages (its one master),
 * a villa's drawing revisions and the sheets on them, the drawing sets
 * those revisions belong to — which are born inside a transmittal, never
 * in a master screen — and the transmittals that send it all to site.
 * Every action opens with
 * requireTool and ends by revalidating the layout — an exact-path call
 * would leave the welcome counts stale while the moved list refreshes
 * (the exact-path trap in CLAUDE.md). Nothing here writes another
 * tool's table.
 */

// ---------------------------------------------------------------------
// Design stages
// ---------------------------------------------------------------------

export async function addDesignStage(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const name = text(formData, "name");
  if (!name) return { error: "Give the stage a name." };
  if (name.length > NAME_LIMIT) return { error: `Keep the name under ${NAME_LIMIT} characters.` };

  const supabase = await createClient();
  const { data: last, error: lastError } = await supabase
    .from("design_stages")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastError) {
    console.error("design_stages next sort_order read failed:", lastError);
    return { error: "Could not work out where to add it. Try again." };
  }

  // Steps of 10, the construction_stages/work_items convention — room
  // to slot one between two later without renumbering everything.
  const { error } = await supabase.from("design_stages").insert({
    name,
    sort_order: (last?.sort_order ?? 0) + 10,
    created_by: user.id,
    updated_by: user.id,
  });
  if (error) {
    if (error.code === "23505") return { error: "That stage is already on the list." };
    console.error("addDesignStage failed:", error);
    return { error: "Could not add the stage. Try again." };
  }

  revalidatePath("/design-management", "layout");
  return undefined;
}

/** A rename follows through to every transmittal carrying the stage. */
export async function renameDesignStage(id: string, name: string): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const trimmed = name.trim();
  if (!trimmed) return { error: "Give the stage a name." };
  if (trimmed.length > NAME_LIMIT) {
    return { error: `Keep the name under ${NAME_LIMIT} characters.` };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("design_stages")
    .update({ name: trimmed, updated_by: user.id })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") return { error: "Another stage already has that name." };
    console.error("renameDesignStage failed:", error);
    return { error: "Could not rename the stage. Try again." };
  }

  revalidatePath("/design-management", "layout");
  return undefined;
}

/**
 * The short code a stage puts into every sheet's file name (WD, STR, …).
 * Changing it renames every sheet of that stage on its next download —
 * names are built then, never stored (lib/drawings/sheet-name.ts).
 */
export async function setDesignStageCode(id: string, input: string): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const code = normaliseStageCode(input);
  if (!code) return { error: "Give the stage a short code — letters or digits, up to six." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("design_stages")
    .update({ code, updated_by: user.id })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") return { error: `Another stage already uses ${code}.` };
    console.error("setDesignStageCode failed:", error);
    return { error: "Could not save the code. Try again." };
  }

  revalidatePath("/design-management", "layout");
  return undefined;
}

export async function setDesignStageActive(id: string, isActive: boolean): Promise<ActionState> {
  const user = await requireTool(GRANT);

  const supabase = await createClient();
  const { error } = await supabase
    .from("design_stages")
    .update({ is_active: isActive, updated_by: user.id })
    .eq("id", id);
  if (error) {
    console.error("setDesignStageActive failed:", error);
    return { error: "Could not update the stage. Try again." };
  }

  revalidatePath("/design-management", "layout");
  return undefined;
}

/**
 * Whether a stage is a column on the design board (0126). Switching one
 * off hides its column and leaves every step on it, and its history, as
 * it was — switched back on, the villas are where they were.
 */
export async function setDesignStageOnBoard(id: string, onBoard: boolean): Promise<ActionState> {
  const user = await requireTool(GRANT);

  const supabase = await createClient();
  const { error } = await supabase
    .from("design_stages")
    .update({ on_board: onBoard, updated_by: user.id })
    .eq("id", id);
  if (error) {
    console.error("setDesignStageOnBoard failed:", error);
    return { error: "Could not update the stage. Try again." };
  }

  revalidatePath("/design-management", "layout");
  return undefined;
}

/**
 * Swaps sort_order with the neighbour in the given direction — two
 * updates, not a rewrite of the whole ordered list, so a reorder costs
 * the same regardless of how many stages exist.
 */
export async function moveDesignStage(id: string, direction: "up" | "down"): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const supabase = await createClient();

  const { data: stages, error: readError } = await supabase
    .from("design_stages")
    .select("id, sort_order")
    .order("sort_order")
    .order("id");
  if (readError) {
    console.error("moveDesignStage read failed:", readError);
    return { error: "Could not reorder the stages. Try again." };
  }

  const list = stages ?? [];
  const index = list.findIndex((stage) => stage.id === id);
  if (index === -1) return { error: "That stage no longer exists." };
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= list.length) return undefined;

  const current = list[index];
  const neighbour = list[swapIndex];

  const [firstUpdate, secondUpdate] = await Promise.all([
    supabase
      .from("design_stages")
      .update({ sort_order: neighbour.sort_order, updated_by: user.id })
      .eq("id", current.id),
    supabase
      .from("design_stages")
      .update({ sort_order: current.sort_order, updated_by: user.id })
      .eq("id", neighbour.id),
  ]);
  if (firstUpdate.error || secondUpdate.error) {
    console.error("moveDesignStage write failed:", firstUpdate.error ?? secondUpdate.error);
    return { error: "Could not reorder the stages. Try again." };
  }

  revalidatePath("/design-management", "layout");
  return undefined;
}

// ---------------------------------------------------------------------
// Drawing revisions — a villa's own workspace on a set
// ---------------------------------------------------------------------

/** The RLS-scoped client, so the helpers below can be handed the one the
 *  action already made rather than each opening another. Declared, never
 *  exported — a "use server" file exports async functions only (the
 *  lib/budgets/actions.ts precedent). */
type DesignClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Starts a draft revision for one (villa, set) and hands back its id.
 *
 * `revision_no` is max + 1 across every status for that pair, or 0 for
 * the first — a number is spent once and never re-used. The new draft
 * copies the set master's default work links, which is the
 * "customisable on release" rule: it starts where the set says and can
 * then differ for this villa alone.
 *
 * The partial unique index (one draft per unit+set) is the real guard;
 * its 23505 comes back as a sentence rather than a code. `seedFailed`
 * is handed back rather than swallowed so the caller can report the
 * partial honestly — the revision exists but its work links did not
 * copy, and silence there would ship an unlabelled empty list.
 *
 * Not an action: no `requireTool`, no `revalidatePath`. Its callers do
 * both, and it is never reachable except through one of them.
 */
async function startDraftRevision(
  supabase: DesignClient,
  userId: string,
  unitId: string,
  setId: string,
): Promise<{ revisionId: string; revisionNo: number; seedFailed: boolean } | { error: string }> {
  const { data: last, error: readError } = await supabase
    .from("drawing_revisions")
    .select("revision_no")
    .eq("unit_id", unitId)
    .eq("drawing_set_id", setId)
    .order("revision_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (readError) {
    console.error("startDraftRevision read failed:", readError);
    return { error: "Could not start the revision. Try again." };
  }
  const revisionNo = (last?.revision_no ?? -1) + 1;

  const { data: revision, error } = await supabase
    .from("drawing_revisions")
    .insert({
      unit_id: unitId,
      drawing_set_id: setId,
      revision_no: revisionNo,
      created_by: userId,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      return {
        error:
          "A draft already exists for this set on this villa — it is on another transmittal. Finish or delete that one first.",
      };
    }
    console.error("startDraftRevision insert failed:", error);
    return { error: "Could not start the revision. Try again." };
  }

  const { data: defaults, error: defaultsError } = await supabase
    .from("drawing_set_works")
    .select("work_item_id")
    .eq("drawing_set_id", setId);
  let seedFailed = defaultsError !== null;
  if (defaultsError) {
    console.error("startDraftRevision defaults read failed:", defaultsError);
  } else if (defaults && defaults.length > 0) {
    const { error: seedError } = await supabase.from("drawing_revision_works").insert(
      defaults.map((link) => ({
        drawing_revision_id: revision.id,
        work_item_id: link.work_item_id,
        created_by: userId,
      })),
    );
    if (seedError) {
      console.error("startDraftRevision seed failed:", seedError);
      seedFailed = true;
    }
  }

  return { revisionId: revision.id, revisionNo, seedFailed };
}

/**
 * Deletes a draft revision's rows and then its files in storage.
 *
 * ROWS FIRST, THEN OBJECTS — a failure part-way leaves an orphaned file
 * nobody can see, never a row pointing at a file that isn't there. The
 * paths are read BEFORE the RPC, because the RPC deletes
 * `drawing_revision_files` itself. `delete_draft_revision` (0091 §10)
 * refuses while the revision still sits on a transmittal line, so the
 * caller takes the line off first.
 */
async function discardDraftRevision(
  supabase: DesignClient,
  revisionId: string,
): Promise<{ error?: string }> {
  const { data: files, error: filesError } = await supabase
    .from("drawing_revision_files")
    .select("storage_path")
    .eq("drawing_revision_id", revisionId);
  if (filesError) {
    console.error("discardDraftRevision files read failed:", filesError);
    return { error: "Could not delete this draft. Try again." };
  }

  const { error } = await supabase.rpc("delete_draft_revision", { p_revision_id: revisionId });
  if (error) {
    console.error("discardDraftRevision failed:", error);
    return { error: dbErrorMessage(error, "Could not delete this draft. Try again.") };
  }

  const paths = (files ?? []).map((file) => file.storage_path);
  if (paths.length > 0) {
    const { error: removeError } = await supabase.storage.from(DRAWINGS_BUCKET).remove(paths);
    if (removeError) console.error("discardDraftRevision storage cleanup failed:", removeError);
  }

  return {};
}

/** The note is the designer's own words on what changed — editable while draft. */
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

/**
 * A revision's own work links, written as one whole-list diff — the same
 * shape as the set-level diff that used to exist, one level finer —
 * and now the only place work links are ticked at all. The draft-only
 * trigger
 * refuses this once the revision has gone to site; that refusal is
 * surfaced here rather than thrown.
 */
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
 * The revision number, the designer's while the revision is a draft
 * (0124; founder, 2026-10-17): a set the team had at R2 in Excel starts
 * here at R3. The guard refuses a number at or below one the set already
 * used on this villa, and any change once it has gone to site — its
 * sentence ("Pick a number above R2 …") is passed through.
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
 * The drawings, as a WorkDrive share link (0124; founder, 2026-10-17:
 * "lets not get into file handling … they paste a link of our drive").
 * Saving it reads the folder straight away, so the designer sees the
 * count and the names before anything else. An empty link takes the link
 * and its list off the draft.
 *
 * The link is stored as rebuilt from its id (`parseWorkDriveLink`), never
 * as typed. A folder that cannot be read still keeps its link — the
 * transmittal can go with the link alone — and says why.
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

/** Reads the draft's folder again — after a sheet was added in WorkDrive. */
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

/**
 * Reads the folder and replaces the draft's kept list with what it holds
 * (0124: delete, then insert — the table has no UPDATE policy). On a
 * failed read nothing is touched, so the last good list stays. Not an
 * action: its callers gate and revalidate.
 */
async function keepFolderList(
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

// ---------------------------------------------------------------------
// Transmittals — the formal record of what went to site
// ---------------------------------------------------------------------

/**
 * Starts a transmittal: one villa, one stage, one drawing set — that
 * set's next revision, whose full set of sheets goes to site together
 * (founder, 2026-09-27: "one transmittal contains only one stage … so
 * each time a full set gets to site"), since 0124 as a WorkDrive link.
 *
 * The person picks the stage, then either a set of THAT stage already on
 * this villa or a new name. 0099 refuses a set of another stage and a
 * second set on one transmittal, so the screen can only offer what the
 * database would take anyway.
 *
 * Order: the revision (and, for a new name, the set) first, then the
 * header, then the line. A failure after the revision was started here
 * takes it back out, and a failure after the header takes that out too:
 * pressing Start gives a transmittal to work on, or leaves no draft
 * behind. A new set whose revision is taken back out stays as an empty
 * row nobody sees — a set surfaces only where it has revisions. The
 * number is minted on Issue, never here.
 */
export async function startTransmittal(
  unitId: string,
  stageId: string,
  choice: { setId: string } | { newSetName: string },
): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const supabase = await createClient();

  const { data: stage, error: stageError } = await supabase
    .from("design_stages")
    .select("is_active")
    .eq("id", stageId)
    .maybeSingle();
  if (stageError) {
    console.error("startTransmittal stage read failed:", stageError);
    return { error: "Could not start the transmittal. Try again." };
  }
  if (!stage?.is_active) return { error: "Pick a design stage that is still in use." };

  let setId: string;
  if ("newSetName" in choice) {
    const name = choice.newSetName.trim();
    if (!name) return { error: "Give the drawing set a name." };
    if (name.length > NAME_LIMIT) {
      return { error: `Keep the name under ${NAME_LIMIT} characters.` };
    }

    const { data: last, error: lastError } = await supabase
      .from("drawing_sets")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastError) {
      console.error("drawing_sets next sort_order read failed:", lastError);
      return { error: "Could not add the drawing set. Try again." };
    }

    const { data: set, error: setInsertError } = await supabase
      .from("drawing_sets")
      .insert({
        name,
        design_stage_id: stageId,
        sort_order: (last?.sort_order ?? 0) + 10,
        created_by: user.id,
        updated_by: user.id,
      })
      .select("id")
      .single();
    if (setInsertError) {
      console.error("startTransmittal set insert failed:", setInsertError);
      return { error: dbErrorMessage(setInsertError, "Could not add the drawing set. Try again.") };
    }
    setId = set.id;
  } else {
    const { data: set, error: setError } = await supabase
      .from("drawing_sets")
      .select("design_stage_id")
      .eq("id", choice.setId)
      .maybeSingle();
    if (setError) {
      console.error("startTransmittal set read failed:", setError);
      return { error: "Could not start the transmittal. Try again." };
    }
    if (!set) return { error: "That drawing set no longer exists." };
    if (set.design_stage_id !== stageId) {
      return { error: "That drawing set belongs to another stage." };
    }
    setId = choice.setId;
  }

  // An open draft is continued, never duplicated (one per villa and set,
  // by a partial unique index). One already on a transmittal is that
  // transmittal's to finish.
  const { data: openDraft, error: draftError } = await supabase
    .from("drawing_revisions")
    .select("id")
    .eq("unit_id", unitId)
    .eq("drawing_set_id", setId)
    .eq("status", "draft")
    .maybeSingle();
  if (draftError) {
    console.error("startTransmittal draft read failed:", draftError);
    return { error: "Could not start the transmittal. Try again." };
  }

  let revisionId: string;
  let startedHere = false;
  if (openDraft) {
    const { data: onLine, error: lineReadError } = await supabase
      .from("transmittal_lines")
      .select("transmittal_id")
      .eq("drawing_revision_id", openDraft.id)
      .limit(1)
      .maybeSingle();
    if (lineReadError) {
      console.error("startTransmittal line read failed:", lineReadError);
      return { error: "Could not start the transmittal. Try again." };
    }
    if (onLine) {
      return {
        error: "This set already has a draft on another transmittal. Open that one to finish it.",
      };
    }
    revisionId = openDraft.id;
  } else {
    const started = await startDraftRevision(supabase, user.id, unitId, setId);
    if ("error" in started) return started;
    if (started.seedFailed) {
      // Only an old set carries default works; they are ticked on the
      // transmittal either way, so this is logged rather than blocking.
      console.error("startTransmittal: the set's default works did not copy", started.revisionId);
    }
    revisionId = started.revisionId;
    startedHere = true;
  }

  const { data: transmittal, error: insertError } = await supabase
    .from("transmittals")
    .insert({ unit_id: unitId, design_stage_id: stageId, created_by: user.id })
    .select("id")
    .single();
  if (insertError) {
    console.error("startTransmittal insert failed:", insertError);
    if (startedHere) await discardDraftRevision(supabase, revisionId);
    revalidatePath("/design-management", "layout");
    return { error: dbErrorMessage(insertError, "Could not start the transmittal. Try again.") };
  }

  const lineError = await appendTransmittalLine(
    supabase,
    user.id,
    transmittal.id,
    unitId,
    revisionId,
  );
  if (lineError) {
    const { error: undoError } = await supabase.rpc("delete_draft_transmittal", {
      p_transmittal_id: transmittal.id,
    });
    if (undoError) console.error("startTransmittal could not take the header back:", undoError);
    if (startedHere) await discardDraftRevision(supabase, revisionId);
    revalidatePath("/design-management", "layout");
    return { error: lineError };
  }

  revalidatePath("/design-management", "layout");
  redirect(`/design-management/transmittals/${transmittal.id}`);
}

/** The one line a transmittal carries: `unit_id` from the header (never
 *  from the browser). 0099 allows exactly one line per transmittal. */
async function appendTransmittalLine(
  supabase: DesignClient,
  userId: string,
  transmittalId: string,
  unitId: string,
  revisionId: string,
): Promise<string | undefined> {
  const { error } = await supabase.from("transmittal_lines").insert({
    transmittal_id: transmittalId,
    unit_id: unitId,
    drawing_revision_id: revisionId,
    sort_order: 0,
    created_by: userId,
  });
  if (!error) return undefined;

  if (error.code === "23505") return "This transmittal already carries a drawing set.";
  if (error.code === "23503") {
    return "That drawing belongs to another villa and can't go on this transmittal.";
  }
  console.error("appendTransmittalLine failed:", error);
  return dbErrorMessage(error, "Could not add that drawing set. Try again.");
}

/**
 * The note for site, saved when the person leaves the field — editable
 * only while the transmittal is a draft. The guard trigger refuses it
 * once issued, and that refusal is shown rather than swallowed. The
 * stage is not editable here: it came with the set (0099).
 */
export async function setDraftTransmittalNote(
  transmittalId: string,
  note: string,
): Promise<ActionState> {
  await requireTool(GRANT);
  const trimmed = note.trim();
  if (trimmed.length > NOTE_LIMIT) {
    return { error: `Keep the note under ${NOTE_LIMIT} characters.` };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("transmittals")
    .update({ note: trimmed || null })
    .eq("id", transmittalId);
  if (error) {
    console.error("setDraftTransmittalNote failed:", error);
    return { error: dbErrorMessage(error, "Could not save the note. Try again.") };
  }

  revalidatePath("/design-management", "layout");
  return undefined;
}

/**
 * The one act that puts a drawing in front of site.
 *
 * `issue_transmittal` (0091 §10) does the whole thing in one
 * transaction: it refuses an empty transmittal, releases every draft
 * revision on it, supersedes whatever that set had released before, and
 * mints the number — which it returns. The number goes into the URL so
 * the refreshed page can say it in words; the header shows it too, but
 * "Issued as TR-0001" is the sentence the person pressing the button is
 * waiting for.
 *
 * Every refusal in that function is a RAISE written for a person to
 * read, so it is passed through rather than replaced — including "Add at
 * least one drawing before issuing this transmittal", which is why the
 * button stays pressable on an empty draft instead of quietly hiding.
 */
export async function issueTransmittal(transmittalId: string): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const supabase = await createClient();

  // 0124: the folder is read once more, so the list kept with the record
  // is what the folder held when it went to site. A read that fails keeps
  // the last good list (or none) and never stops the issue — the link
  // itself is the drawings.
  const { data: lines, error: linesError } = await supabase
    .from("transmittal_lines")
    .select("drawing_revision_id")
    .eq("transmittal_id", transmittalId);
  if (linesError) {
    console.error("issueTransmittal lines read failed:", linesError);
    return { error: "Could not issue this transmittal. Try again." };
  }
  const revisionIds = (lines ?? []).map((line) => line.drawing_revision_id);
  if (revisionIds.length > 0) {
    const { data: drafts, error: draftsError } = await supabase
      .from("drawing_revisions")
      .select("id, drawings_url")
      .in("id", revisionIds)
      .eq("status", "draft");
    if (draftsError) {
      console.error("issueTransmittal revisions read failed:", draftsError);
      return { error: "Could not issue this transmittal. Try again." };
    }
    for (const draft of drafts ?? []) {
      const parsed = draft.drawings_url ? parseWorkDriveLink(draft.drawings_url) : null;
      if (!parsed?.ok) continue;
      const read = await keepFolderList(supabase, user.id, draft.id, parsed.linkId);
      if (read.error) console.error("issueTransmittal kept the last list:", read.error);
    }
  }

  const { data: number, error } = await supabase.rpc("issue_transmittal", {
    p_transmittal_id: transmittalId,
  });
  if (error) {
    console.error("issueTransmittal failed:", error);
    return { error: dbErrorMessage(error, "Could not issue this transmittal. Try again.") };
  }

  revalidatePath("/design-management", "layout");
  redirect(
    `/design-management/transmittals/${transmittalId}?issued=${encodeURIComponent(number ?? "")}`,
  );
}

/**
 * A draft raised by mistake, gone entirely — and its draft drawings with
 * it. The screen says so before the press.
 *
 * The header and lines go in one transaction (`delete_draft_transmittal`,
 * 0091 §10), because two requests can fail in between and strand a
 * header with its lines gone. THEN each draft revision that was on it,
 * rows before files (`discardDraftRevision`) — a draft left on no
 * transmittal is one nobody can open (2026-09-27 audit). Released
 * drawings that were being re-sent are untouched.
 *
 * An issued transmittal is refused by the function and by the guard: it
 * is the answer to "what did site have on the 22nd".
 */
export async function deleteDraftTransmittal(transmittalId: string): Promise<ActionState> {
  await requireTool(GRANT);
  const supabase = await createClient();

  // Read the villa and the drafts BEFORE the rows go: afterwards there is
  // nothing left pointing at either.
  const { data: header, error: headerError } = await supabase
    .from("transmittals")
    .select("unit_id")
    .eq("id", transmittalId)
    .maybeSingle();
  if (headerError) {
    console.error("deleteDraftTransmittal read failed:", headerError);
    return { error: "Could not delete this draft. Try again." };
  }

  // Complete, not capped: a draft missed here is a draft left behind.
  // fetchAll throws on a failed read; an action answers with a sentence.
  let draftIds: string[];
  try {
    const lines = await fetchAll<{ drawing_revision_id: string }>((from, to) =>
      supabase
        .from("transmittal_lines")
        .select("drawing_revision_id")
        .eq("transmittal_id", transmittalId)
        .order("id")
        .range(from, to),
    );
    const revisionIds = lines.map((line) => line.drawing_revision_id);
    const drafts =
      revisionIds.length > 0
        ? await fetchAll<{ id: string }>((from, to) =>
            supabase
              .from("drawing_revisions")
              .select("id")
              .in("id", revisionIds)
              .eq("status", "draft")
              .order("id")
              .range(from, to),
          )
        : [];
    draftIds = drafts.map((draft) => draft.id);
  } catch (readError) {
    console.error("deleteDraftTransmittal drafts read failed:", readError);
    return { error: "Could not delete this draft. Try again." };
  }

  const { error } = await supabase.rpc("delete_draft_transmittal", {
    p_transmittal_id: transmittalId,
  });
  if (error) {
    console.error("deleteDraftTransmittal failed:", error);
    return { error: dbErrorMessage(error, "Could not delete this draft. Try again.") };
  }

  // The transmittal is already gone, so there is no page to stay on and
  // report from. A draft that would not delete stays on the villa, where
  // the Add drawing dialog offers "Continue draft" for it.
  for (const draftId of draftIds) {
    const discarded = await discardDraftRevision(supabase, draftId);
    if (discarded.error) {
      console.error("deleteDraftTransmittal left a draft behind:", draftId, discarded.error);
    }
  }

  revalidatePath("/design-management", "layout");
  redirect(header ? `/design-management/villas/${header.unit_id}` : "/design-management/villas");
}
