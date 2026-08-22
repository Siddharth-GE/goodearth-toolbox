"use server";

// Type-only import, never re-exported from a "use server" file — the
// 2026-08-03 outage rule, enforced by npm run check:actions.
import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { DRAWINGS_BUCKET } from "@/lib/design-management/storage";
import { designView } from "@/lib/pdf/theme";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
// sharp is imported LAZILY inside the one branch that resizes an image —
// never at module level. A top-level import means a missing native
// binary on the deployed runtime kills EVERY action in this file at
// load, including ones that never touch an image (2026-08-22: "Add a
// drawing" died this way on staging). Lazy, the blast radius is one
// upload branch with its own error message.

const GRANT = "/design-management";
const NAME_LIMIT = 120;
const CODE_LIMIT = 30;
const DESCRIPTION_LIMIT = 500;
const NOTE_LIMIT = 1000;

// The server-action body cap (next.config.ts) and the `drawings` bucket's
// own `file_size_limit` (0091) — stated again here so a file that slips
// past this check is still refused by the database, not silently
// truncated.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const ACCEPTED_FILE_TYPES = ["application/pdf", "image/jpeg", "image/png"];

/** RAISE EXCEPTION text is already written for a person to read; strip
 * whatever PostgREST prefixes it with (the lib/selections/actions.ts:85
 * pattern). */
function friendlyDbError(error: { message: string }, fallback: string): string {
  return error.message.replace(/^.*?:\s*/, "") || fallback;
}

/**
 * Writes for the Design Management app: its own masters (drawing sets,
 * their default work links, design stages), a villa's drawing revisions
 * and the sheets on them, and the transmittals that send those drawings
 * to site. Every action opens with
 * requireTool and ends by revalidating the layout — an exact-path call
 * would leave the welcome counts stale while the moved list refreshes
 * (the exact-path trap in CLAUDE.md). Nothing here writes another
 * tool's table.
 */

function text(formData: FormData, field: string): string {
  return String(formData.get(field) ?? "").trim();
}

// ---------------------------------------------------------------------
// Drawing sets
// ---------------------------------------------------------------------

function readDrawingSetForm(
  formData: FormData,
): { name: string; code: string | null; description: string | null } | { error: string } {
  const name = text(formData, "name");
  const code = text(formData, "code");
  const description = text(formData, "description");

  if (!name) return { error: "Give the drawing set a name." };
  if (name.length > NAME_LIMIT) return { error: `Keep the name under ${NAME_LIMIT} characters.` };
  if (code.length > CODE_LIMIT) return { error: `Keep the code under ${CODE_LIMIT} characters.` };
  if (description.length > DESCRIPTION_LIMIT) {
    return { error: `Keep the description under ${DESCRIPTION_LIMIT} characters.` };
  }

  return { name, code: code || null, description: description || null };
}

export async function createDrawingSet(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const fields = readDrawingSetForm(formData);
  if ("error" in fields) return fields;

  const supabase = await createClient();
  const { data: last } = await supabase
    .from("drawing_sets")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  // New sets land at the end of the sequence; steps of 10 leave room to
  // slot one between two later by editing sort_order in the database.
  const { error } = await supabase.from("drawing_sets").insert({
    ...fields,
    sort_order: (last?.sort_order ?? 0) + 10,
    created_by: user.id,
    updated_by: user.id,
  });
  if (error) {
    if (error.code === "23505") return { error: "That code is already used by another set." };
    console.error("createDrawingSet failed:", error);
    return { error: "Could not add the drawing set. Try again." };
  }

  revalidatePath("/design-management", "layout");
  return undefined;
}

export async function updateDrawingSet(
  id: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const fields = readDrawingSetForm(formData);
  if ("error" in fields) return fields;

  const supabase = await createClient();
  const { error } = await supabase
    .from("drawing_sets")
    .update({ ...fields, updated_by: user.id })
    .eq("id", id);
  if (error) {
    if (error.code === "23505") return { error: "That code is already used by another set." };
    console.error("updateDrawingSet failed:", error);
    return { error: "Could not update the drawing set. Try again." };
  }

  revalidatePath("/design-management", "layout");
  return undefined;
}

export async function setDrawingSetActive(id: string, isActive: boolean): Promise<ActionState> {
  const user = await requireTool(GRANT);

  const supabase = await createClient();
  const { error } = await supabase
    .from("drawing_sets")
    .update({ is_active: isActive, updated_by: user.id })
    .eq("id", id);
  if (error) {
    console.error("setDrawingSetActive failed:", error);
    return { error: "Could not update the drawing set. Try again." };
  }

  revalidatePath("/design-management", "layout");
  return undefined;
}

/**
 * Only succeeds when nothing references the set. A villa's revision
 * history is exactly that kind of reference and is meant to be
 * permanent, so the FK refuses rather than cascades (CLAUDE.md's line
 * chain rule) — surfaced here as a friendly nudge toward deactivating
 * instead, never a thrown error.
 */
export async function deleteDrawingSet(id: string): Promise<ActionState> {
  await requireTool(GRANT);

  const supabase = await createClient();
  const { error } = await supabase.from("drawing_sets").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") {
      return {
        error:
          "This drawing set has revisions against a villa and can't be deleted — deactivate it instead.",
      };
    }
    console.error("deleteDrawingSet failed:", error);
    return { error: "Could not delete the drawing set. Try again." };
  }

  revalidatePath("/design-management", "layout");
  return undefined;
}

/**
 * The set's default work links, written as one whole-list diff — insert
 * what's newly checked, delete what's newly unchecked — so a toggle
 * can't half-save. There is no update; a link either exists or it
 * doesn't (the Relay `setTrailSetActivities` shape).
 */
export async function setDrawingSetWorks(
  setId: string,
  workItemIds: string[],
): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const supabase = await createClient();

  const { data: existingRows, error: readError } = await supabase
    .from("drawing_set_works")
    .select("work_item_id")
    .eq("drawing_set_id", setId);
  if (readError) {
    console.error("setDrawingSetWorks read failed:", readError);
    return { error: "Could not load the current work links. Try again." };
  }

  const existing = new Set((existingRows ?? []).map((row) => row.work_item_id));
  const next = new Set(workItemIds);
  const toAdd = [...next].filter((workItemId) => !existing.has(workItemId));
  const toRemove = [...existing].filter((workItemId) => !next.has(workItemId));

  if (toAdd.length > 0) {
    const { error } = await supabase.from("drawing_set_works").insert(
      toAdd.map((workItemId) => ({
        drawing_set_id: setId,
        work_item_id: workItemId,
        created_by: user.id,
      })),
    );
    if (error) {
      console.error("setDrawingSetWorks insert failed:", error);
      return { error: "Could not save the work links. Try again." };
    }
  }

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("drawing_set_works")
      .delete()
      .eq("drawing_set_id", setId)
      .in("work_item_id", toRemove);
    if (error) {
      console.error("setDrawingSetWorks delete failed:", error);
      return { error: "Could not save the work links. Try again." };
    }
  }

  revalidatePath("/design-management", "layout");
  return undefined;
}

// ---------------------------------------------------------------------
// Design stages
// ---------------------------------------------------------------------

export async function addDesignStage(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const name = text(formData, "name");
  if (!name) return { error: "Give the stage a name." };
  if (name.length > NAME_LIMIT) return { error: `Keep the name under ${NAME_LIMIT} characters.` };

  const supabase = await createClient();
  const { data: last } = await supabase
    .from("design_stages")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

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

/**
 * Starts a new draft: revision_no is max+1 for this (unit, set), or 0 for
 * the first. Seeds drawing_revision_works from the set's current default
 * links — the "customizable on release" the plan asks for, editable from
 * here while the revision stays a draft. The partial unique index
 * (one draft per unit+set) is the real guard; its violation comes back as
 * a friendly message rather than a raw 23505.
 */
export async function createDraftRevision(unitId: string, setId: string): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const supabase = await createClient();

  const { data: last, error: readError } = await supabase
    .from("drawing_revisions")
    .select("revision_no")
    .eq("unit_id", unitId)
    .eq("drawing_set_id", setId)
    .order("revision_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (readError) {
    console.error("createDraftRevision read failed:", readError);
    return { error: "Could not start the revision. Try again." };
  }
  const revisionNo = (last?.revision_no ?? -1) + 1;

  const { data: revision, error } = await supabase
    .from("drawing_revisions")
    .insert({
      unit_id: unitId,
      drawing_set_id: setId,
      revision_no: revisionNo,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      return {
        error: "A draft already exists for this set on this villa — finish or delete it first.",
      };
    }
    console.error("createDraftRevision insert failed:", error);
    return { error: "Could not start the revision. Try again." };
  }

  const { data: defaults, error: defaultsError } = await supabase
    .from("drawing_set_works")
    .select("work_item_id")
    .eq("drawing_set_id", setId);
  let seedFailed = defaultsError !== null;
  if (defaultsError) {
    console.error("createDraftRevision defaults read failed:", defaultsError);
  } else if (defaults && defaults.length > 0) {
    const { error: seedError } = await supabase.from("drawing_revision_works").insert(
      defaults.map((link) => ({
        drawing_revision_id: revision.id,
        work_item_id: link.work_item_id,
        created_by: user.id,
      })),
    );
    if (seedError) {
      console.error("createDraftRevision seed failed:", seedError);
      seedFailed = true;
    }
  }

  revalidatePath("/design-management", "layout");
  // Partial success is reported honestly (the line-pull doctrine): the
  // revision exists — the refreshed page shows it — but its work links
  // did not copy, and silence here would ship an unlabelled empty list.
  if (seedFailed) {
    return {
      error:
        "The revision was started, but the set's usual work links could not be copied onto it — tick them by hand.",
    };
  }
  return undefined;
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
    return { error: friendlyDbError(error, "Could not save the note. Try again.") };
  }

  revalidatePath("/design-management", "layout");
  return undefined;
}

/**
 * A revision's own work links, written as one whole-list diff — the same
 * shape as setDrawingSetWorks, one level finer. The draft-only trigger
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
      return { error: friendlyDbError(error, "Could not save the work links. Try again.") };
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
      return { error: friendlyDbError(error, "Could not save the work links. Try again.") };
    }
  }

  revalidatePath("/design-management", "layout");
  return undefined;
}

/**
 * A draft raised by mistake, gone entirely. `delete_draft_revision` (0091)
 * removes the rows atomically and refuses if the revision is already on a
 * transmittal; the storage objects are the caller's job, and only after
 * the rows are confirmed gone — so a failure here leaves an orphaned file,
 * never a row pointing at nothing. The file paths are read BEFORE the RPC
 * runs, since the RPC deletes drawing_revision_files itself.
 */
export async function deleteDraftRevision(revisionId: string): Promise<ActionState> {
  await requireTool(GRANT);
  const supabase = await createClient();

  const { data: files, error: filesError } = await supabase
    .from("drawing_revision_files")
    .select("storage_path")
    .eq("drawing_revision_id", revisionId);
  if (filesError) {
    console.error("deleteDraftRevision files read failed:", filesError);
    return { error: "Could not delete this draft. Try again." };
  }

  const { error } = await supabase.rpc("delete_draft_revision", { p_revision_id: revisionId });
  if (error) {
    console.error("deleteDraftRevision failed:", error);
    return { error: friendlyDbError(error, "Could not delete this draft. Try again.") };
  }

  const paths = (files ?? []).map((file) => file.storage_path);
  if (paths.length > 0) {
    const { error: removeError } = await supabase.storage.from(DRAWINGS_BUCKET).remove(paths);
    if (removeError) {
      console.error("deleteDraftRevision storage cleanup failed:", removeError);
    }
  }

  revalidatePath("/design-management", "layout");
  return undefined;
}

// ---------------------------------------------------------------------
// Drawing revision files — the sheets themselves
// ---------------------------------------------------------------------

/**
 * Uploads one sheet to a draft revision. Copied step-for-step from
 * `uploadMyPhoto` (lib/directory/actions.ts:158-259): size and MIME
 * checked before anything touches storage; a PDF is stored byte-for-byte,
 * an image is re-normalised to the shared designView spec (never
 * cropped — `fit: "contain"` on white); the upload hands Storage a
 * `Blob`, never a raw `Buffer` (BUGCATCHER #1); what actually landed is
 * read back and size-checked before the row is written; a failed row
 * write removes the object it would otherwise orphan.
 */
export async function uploadDrawingRevisionFile(
  revisionId: string,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireTool(GRANT);

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file to upload." };
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      error: "That file is too large — the limit is 4 MB. Split a big set into several sheets.",
    };
  }
  if (!ACCEPTED_FILE_TYPES.includes(file.type)) {
    return { error: "Upload a PDF, JPG or PNG." };
  }

  let bytes: Buffer;
  let contentType: string;
  let extension: string;

  if (file.type === "application/pdf") {
    bytes = Buffer.from(await file.arrayBuffer());
    contentType = "application/pdf";
    extension = "pdf";
  } else {
    try {
      const { default: sharp } = await import("sharp");
      bytes = await sharp(Buffer.from(await file.arrayBuffer()))
        // `contain` keeps the whole drawing and pads to the shared
        // spec's 16:9 — `cover` would give the same consistency while
        // quietly cropping a corner off a drawing, the worse failure.
        .resize(designView.width, designView.height, {
          fit: "contain",
          background: { r: 255, g: 255, b: 255 },
        })
        .jpeg({ quality: designView.quality })
        .toBuffer();
    } catch (error) {
      console.error("uploadDrawingRevisionFile resize failed:", error);
      return { error: "That file could not be read as an image." };
    }
    contentType = designView.contentType;
    extension = designView.extension;
  }

  const supabase = await createClient();
  const path = `revisions/${revisionId}/${crypto.randomUUID()}.${extension}`;

  // A BLOB, NOT THE RAW Buffer, AND THIS IS NOT STYLE — BUGCATCHER #1.
  // supabase-js only builds a multipart body when handed a Blob; a raw
  // Buffer goes to Next's patched fetch as a raw body and comes back
  // text-decoded, every non-UTF-8 byte replaced with EF BF BD. Storage
  // still reports the wrong bytes as the right content type; nothing
  // errors anywhere, and the only symptom is a drawing that won't open.
  const blob = new Blob([new Uint8Array(bytes)], { type: contentType });

  const { error: uploadError } = await supabase.storage
    .from(DRAWINGS_BUCKET)
    .upload(path, blob, { contentType });
  if (uploadError) {
    console.error("uploadDrawingRevisionFile upload failed:", uploadError);
    return { error: "Could not save the file. Try again." };
  }

  // Confirm what landed is what was sent — the same check uploadMyPhoto
  // makes, for the same reason: a silent binary corruption is invisible
  // until someone opens the file months later.
  const folder = path.slice(0, path.lastIndexOf("/"));
  const filename = path.slice(path.lastIndexOf("/") + 1);
  const { data: stored } = await supabase.storage
    .from(DRAWINGS_BUCKET)
    .list(folder, { search: filename });
  const storedSize = stored?.[0]?.metadata?.size as number | undefined;

  if (storedSize !== undefined && storedSize !== bytes.length) {
    await supabase.storage.from(DRAWINGS_BUCKET).remove([path]);
    console.error(
      `uploadDrawingRevisionFile stored ${storedSize} bytes but sent ${bytes.length} — binary was mangled in transit`,
    );
    return { error: "The file did not save correctly. Try again." };
  }

  const { data: last } = await supabase
    .from("drawing_revision_files")
    .select("sort_order")
    .eq("drawing_revision_id", revisionId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("drawing_revision_files").insert({
    drawing_revision_id: revisionId,
    storage_path: path,
    file_name: file.name,
    content_type: contentType,
    sort_order: (last?.sort_order ?? -1) + 1,
    uploaded_by: user.id,
  });
  if (error) {
    // Object first, then row — a failed row write leaves an invisible
    // orphan rather than a row pointing at nothing.
    await supabase.storage.from(DRAWINGS_BUCKET).remove([path]);
    console.error("uploadDrawingRevisionFile row write failed:", error);
    return { error: friendlyDbError(error, "Could not save the file. Try again.") };
  }

  revalidatePath("/design-management", "layout");
  return undefined;
}

/** Row first, then the object — the reverse of upload, same reasoning. */
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
    return { error: friendlyDbError(error, "Could not remove the file. Try again.") };
  }

  const { error: removeError } = await supabase.storage
    .from(DRAWINGS_BUCKET)
    .remove([file.storage_path]);
  if (removeError) console.error("deleteDrawingRevisionFile storage cleanup failed:", removeError);

  revalidatePath("/design-management", "layout");
  return undefined;
}

// ---------------------------------------------------------------------
// Transmittals — the formal record of what went to site
// ---------------------------------------------------------------------

/**
 * Raises a draft transmittal and its lines in one go.
 *
 * The header carries no number: 0091's CHECK ties `number`, `issued_at`
 * and `issued_by` to the issued status both ways, so a draft holding a
 * number is refused by the database. The number is minted on Issue and
 * nowhere else, which is why an abandoned draft cannot burn TR-0003.
 *
 * The lines denormalise `unit_id` on purpose — the composite FKs then
 * make a line carrying another villa's drawing impossible. `sort_order`
 * follows the order of the pick list, which is the drawing sets' own
 * master order, so the screen and the PDF read in the same sequence.
 */
export async function createTransmittal(
  unitId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireTool(GRANT);

  const stageId = text(formData, "design_stage_id");
  if (!stageId) return { error: "Pick the design stage this goes out at." };

  const note = text(formData, "note");
  if (note.length > NOTE_LIMIT) return { error: `Keep the note under ${NOTE_LIMIT} characters.` };

  const revisionIds = formData
    .getAll("revision_id")
    .map((value) => String(value))
    .filter(Boolean);
  if (revisionIds.length === 0) return { error: "Tick at least one drawing to send." };

  const supabase = await createClient();
  const { data: transmittal, error } = await supabase
    .from("transmittals")
    .insert({
      unit_id: unitId,
      design_stage_id: stageId,
      note: note || null,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) {
    console.error("createTransmittal insert failed:", error);
    return { error: friendlyDbError(error, "Could not start the transmittal. Try again.") };
  }

  const { error: linesError } = await supabase.from("transmittal_lines").insert(
    revisionIds.map((revisionId, index) => ({
      transmittal_id: transmittal.id,
      unit_id: unitId,
      drawing_revision_id: revisionId,
      sort_order: index,
      created_by: user.id,
    })),
  );
  if (linesError) {
    console.error("createTransmittal lines failed:", linesError);
    // Nothing landed under the header, so take the header away too
    // rather than leave an empty draft nobody asked for. It is still a
    // draft with no lines, which both the delete policy and the guard
    // allow; if even that fails the draft is visible on the list and
    // can be deleted by hand, which is why the failure is only logged.
    const { error: cleanupError } = await supabase
      .from("transmittals")
      .delete()
      .eq("id", transmittal.id);
    if (cleanupError) console.error("createTransmittal cleanup failed:", cleanupError);
    return { error: friendlyDbError(linesError, "Could not add those drawings. Try again.") };
  }

  revalidatePath("/design-management", "layout");
  redirect(`/design-management/transmittals/${transmittal.id}`);
}

/** Note and stage, editable only while the transmittal is a draft — the
 *  guard trigger refuses both once it has been issued, and that refusal
 *  is shown rather than swallowed. */
export async function updateDraftTransmittal(
  transmittalId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireTool(GRANT);

  const stageId = text(formData, "design_stage_id");
  if (!stageId) return { error: "Pick the design stage this goes out at." };

  const note = text(formData, "note");
  if (note.length > NOTE_LIMIT) return { error: `Keep the note under ${NOTE_LIMIT} characters.` };

  const supabase = await createClient();
  const { error } = await supabase
    .from("transmittals")
    .update({ design_stage_id: stageId, note: note || null })
    .eq("id", transmittalId);
  if (error) {
    console.error("updateDraftTransmittal failed:", error);
    return { error: friendlyDbError(error, "Could not save this transmittal. Try again.") };
  }

  revalidatePath("/design-management", "layout");
  return undefined;
}

/**
 * Adds one drawing to a draft. `unit_id` is read from the header rather
 * than passed in from the browser — the composite FK would refuse a
 * mismatched pair anyway, and reading it here means the screen can never
 * be the thing that decides which villa a line belongs to.
 */
export async function addTransmittalLine(
  transmittalId: string,
  revisionId: string,
): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const supabase = await createClient();

  const { data: transmittal, error: readError } = await supabase
    .from("transmittals")
    .select("unit_id")
    .eq("id", transmittalId)
    .maybeSingle();
  if (readError) {
    console.error("addTransmittalLine read failed:", readError);
    return { error: "Could not add that drawing. Try again." };
  }
  if (!transmittal) return { error: "That transmittal no longer exists." };

  const { data: last } = await supabase
    .from("transmittal_lines")
    .select("sort_order")
    .eq("transmittal_id", transmittalId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("transmittal_lines").insert({
    transmittal_id: transmittalId,
    unit_id: transmittal.unit_id,
    drawing_revision_id: revisionId,
    sort_order: (last?.sort_order ?? -1) + 1,
    created_by: user.id,
  });
  if (error) {
    if (error.code === "23505") return { error: "That drawing is already on this transmittal." };
    if (error.code === "23503") {
      return { error: "That drawing belongs to another villa and can't go on this transmittal." };
    }
    console.error("addTransmittalLine insert failed:", error);
    return { error: friendlyDbError(error, "Could not add that drawing. Try again.") };
  }

  revalidatePath("/design-management", "layout");
  return undefined;
}

export async function removeTransmittalLine(lineId: string): Promise<ActionState> {
  await requireTool(GRANT);
  const supabase = await createClient();

  const { error } = await supabase.from("transmittal_lines").delete().eq("id", lineId);
  if (error) {
    console.error("removeTransmittalLine failed:", error);
    return { error: friendlyDbError(error, "Could not take that drawing off. Try again.") };
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
  await requireTool(GRANT);
  const supabase = await createClient();

  const { data: number, error } = await supabase.rpc("issue_transmittal", {
    p_transmittal_id: transmittalId,
  });
  if (error) {
    console.error("issueTransmittal failed:", error);
    return { error: friendlyDbError(error, "Could not issue this transmittal. Try again.") };
  }

  revalidatePath("/design-management", "layout");
  redirect(
    `/design-management/transmittals/${transmittalId}?issued=${encodeURIComponent(number ?? "")}`,
  );
}

/**
 * A draft raised by mistake, gone entirely — header and lines in one
 * transaction (`delete_draft_transmittal`, 0091 §10), because two
 * requests can fail in between and strand a header with its lines gone.
 * An issued transmittal is refused by the function and by the guard: it
 * is the answer to "what did site have on the 22nd".
 */
export async function deleteDraftTransmittal(transmittalId: string): Promise<ActionState> {
  await requireTool(GRANT);
  const supabase = await createClient();

  const { error } = await supabase.rpc("delete_draft_transmittal", {
    p_transmittal_id: transmittalId,
  });
  if (error) {
    console.error("deleteDraftTransmittal failed:", error);
    return { error: friendlyDbError(error, "Could not delete this draft. Try again.") };
  }

  revalidatePath("/design-management", "layout");
  redirect("/design-management/transmittals");
}
