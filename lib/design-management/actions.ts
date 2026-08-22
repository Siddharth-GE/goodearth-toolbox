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

function text(formData: FormData, field: string): string {
  return String(formData.get(field) ?? "").trim();
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
    return { error: friendlyDbError(error, "Could not delete this draft. Try again.") };
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
    return { error: friendlyDbError(error, "Could not save the note. Try again.") };
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
 * Raises an EMPTY draft transmittal and opens it.
 *
 * The founder redirected the flow on the staging vet (2026-08-22):
 * "press new transmittal, upload the docs and issue to site". So this
 * asks only what a transmittal is _for_ — the villa it belongs to, the
 * design stage it goes out at, and an optional note — and the drawings
 * are assembled on the transmittal itself, which is now the workspace.
 *
 * The header carries no number: 0091's CHECK ties `number`, `issued_at`
 * and `issued_by` to the issued status both ways, so a draft holding a
 * number is refused by the database. The number is minted on Issue and
 * nowhere else, which is why an abandoned draft cannot burn TR-0003.
 *
 * "At least one drawing" is not checked here any more — it is enforced
 * where it belongs, at Issue, by `issue_transmittal` itself.
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

  revalidatePath("/design-management", "layout");
  redirect(`/design-management/transmittals/${transmittal.id}`);
}

/**
 * Creates a drawing set INSIDE a transmittal, with its first drawings
 * already started: the set row, its R0 draft on this villa, and the
 * transmittal line, in that order.
 *
 * Founder, 2026-08-22 evening: "dont make a new drawing set outside …
 * there maybe a list of all drawing sets released within a plot … not a
 * master set for the whole damn project." So there is no master screen
 * left to create one from, and a set only ever surfaces on the villa
 * whose revisions it carries.
 *
 * A set born here has **no code and no default work links** — the code
 * belonged to a company-wide catalogue that no longer exists, and the
 * works are ticked on the revision itself, one level down, where they
 * were always editable. `startDraftRevision` copies whatever defaults
 * the set has, which for a set one statement old is none; that is the
 * intended zero, not a failure.
 *
 * Two villas both making a "Working Drawings" make two rows. That is
 * the point: `drawing_sets` stays one global table, and the scoping is
 * "has a revision on this unit" rather than a column.
 */
export async function createSetOnTransmittal(
  transmittalId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireTool(GRANT);

  const name = text(formData, "name");
  if (!name) return { error: "Give the drawing set a name." };
  if (name.length > NAME_LIMIT) return { error: `Keep the name under ${NAME_LIMIT} characters.` };

  const supabase = await createClient();

  const { data: transmittal, error: readError } = await supabase
    .from("transmittals")
    .select("unit_id, status")
    .eq("id", transmittalId)
    .maybeSingle();
  if (readError) {
    console.error("createSetOnTransmittal read failed:", readError);
    return { error: "Could not add the drawing set. Try again." };
  }
  if (!transmittal) return { error: "That transmittal no longer exists." };
  if (transmittal.status !== "draft") {
    return { error: "This transmittal has been issued — what was sent cannot be changed." };
  }

  const { data: last } = await supabase
    .from("drawing_sets")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: set, error } = await supabase
    .from("drawing_sets")
    .insert({
      name,
      sort_order: (last?.sort_order ?? 0) + 10,
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id")
    .single();
  if (error) {
    console.error("createSetOnTransmittal insert failed:", error);
    return { error: friendlyDbError(error, "Could not add the drawing set. Try again.") };
  }

  const started = await startDraftRevision(supabase, user.id, transmittal.unit_id, set.id);
  if ("error" in started) {
    // The set exists but has nothing on it — invisible either way, since
    // a set only surfaces where it has a revision. Said out loud rather
    // than shown as a success over a screen that hasn't changed.
    revalidatePath("/design-management", "layout");
    return started;
  }

  const lineError = await appendTransmittalLine(
    supabase,
    user.id,
    transmittalId,
    transmittal.unit_id,
    started.revisionId,
  );

  revalidatePath("/design-management", "layout");
  return lineError ? { error: lineError } : undefined;
}

/**
 * Puts a drawing set on this transmittal, starting a draft revision for
 * it if one isn't already open.
 *
 * This is the "Add drawings" board's one action, and it covers all three
 * of the founder's cases with the same press:
 *
 *   - the set has a draft open on this villa → that draft goes on the
 *     transmittal, nothing new is created ("Continue draft R2");
 *   - the set has only released revisions → R+1 is started and goes on
 *     ("Revise — starts R3");
 *   - the set has nothing here at all → R0 is started and goes on
 *     ("Upload first drawings — R0").
 *
 * The numbering and the default-work-links copy are `startDraftRevision`,
 * the same code path the whole tool uses; nothing is duplicated here.
 * Only a draft transmittal reaches this — the line trigger would refuse
 * anyway, but refusing early gives a sentence instead of a raise.
 */
export async function createRevisionOnTransmittal(
  transmittalId: string,
  setId: string,
): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const supabase = await createClient();

  const { data: transmittal, error: readError } = await supabase
    .from("transmittals")
    .select("unit_id, status")
    .eq("id", transmittalId)
    .maybeSingle();
  if (readError) {
    console.error("createRevisionOnTransmittal read failed:", readError);
    return { error: "Could not add that drawing. Try again." };
  }
  if (!transmittal) return { error: "That transmittal no longer exists." };
  if (transmittal.status !== "draft") {
    return { error: "This transmittal has been issued — what was sent cannot be changed." };
  }

  // An open draft is continued, never duplicated: the partial unique
  // index allows exactly one per (villa, set), so starting a second is
  // not a thing that can happen even by racing.
  const { data: openDraft, error: draftError } = await supabase
    .from("drawing_revisions")
    .select("id")
    .eq("unit_id", transmittal.unit_id)
    .eq("drawing_set_id", setId)
    .eq("status", "draft")
    .maybeSingle();
  if (draftError) {
    console.error("createRevisionOnTransmittal draft read failed:", draftError);
    return { error: "Could not add that drawing. Try again." };
  }

  let revisionId = openDraft?.id;
  let seedFailed = false;
  if (!revisionId) {
    const started = await startDraftRevision(supabase, user.id, transmittal.unit_id, setId);
    if ("error" in started) return started;
    revisionId = started.revisionId;
    seedFailed = started.seedFailed;
  }

  const lineError = await appendTransmittalLine(
    supabase,
    user.id,
    transmittalId,
    transmittal.unit_id,
    revisionId,
  );

  revalidatePath("/design-management", "layout");
  // Both partials are said out loud rather than shown as a plain
  // success over a screen that doesn't match (the line-pull doctrine).
  if (lineError) return { error: lineError };
  if (seedFailed) {
    return {
      error:
        "The revision was started, but the set's usual work links could not be copied onto it — tick them by hand.",
    };
  }
  return undefined;
}

/** The insert both add-paths share: `unit_id` denormalised from the
 *  header (never from the browser) and `sort_order` at the end. */
async function appendTransmittalLine(
  supabase: DesignClient,
  userId: string,
  transmittalId: string,
  unitId: string,
  revisionId: string,
): Promise<string | undefined> {
  const { data: last } = await supabase
    .from("transmittal_lines")
    .select("sort_order")
    .eq("transmittal_id", transmittalId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("transmittal_lines").insert({
    transmittal_id: transmittalId,
    unit_id: unitId,
    drawing_revision_id: revisionId,
    sort_order: (last?.sort_order ?? -1) + 1,
    created_by: userId,
  });
  if (!error) return undefined;

  if (error.code === "23505") return "That drawing is already on this transmittal.";
  if (error.code === "23503") {
    return "That drawing belongs to another villa and can't go on this transmittal.";
  }
  console.error("appendTransmittalLine failed:", error);
  return friendlyDbError(error, "Could not add that drawing. Try again.");
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
 * Puts an ALREADY-RELEASED revision on a draft transmittal, unchanged —
 * the same set going out again at a new design stage, which one set
 * serving many activities makes normal. Nothing is revised and nothing
 * is created; `issue_transmittal` leaves an already-released line alone.
 *
 * `unit_id` is read from the header rather than passed in from the
 * browser — the composite FK would refuse a mismatched pair anyway, and
 * reading it here means the screen can never be the thing that decides
 * which villa a line belongs to.
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

  const lineError = await appendTransmittalLine(
    supabase,
    user.id,
    transmittalId,
    transmittal.unit_id,
    revisionId,
  );

  revalidatePath("/design-management", "layout");
  return lineError ? { error: lineError } : undefined;
}

/**
 * Takes a drawing off a draft transmittal.
 *
 * `discardDraft` is the second half of the choice the screen offers on a
 * draft line: taking it off this transmittal is not the same act as
 * throwing the drawing away, and guessing between them would either
 * strand a draft nobody can find or destroy work nobody meant to lose.
 *
 * The ORDER is the whole point when both are asked for. The line goes
 * first, because `delete_draft_revision` refuses while the revision is
 * still sitting on a transmittal; then the rows; then the storage
 * objects. If the second half fails, the first half is still reported as
 * having happened — the drawing is off the transmittal and the draft is
 * still there to be dealt with.
 */
export async function removeTransmittalLine(
  lineId: string,
  discardDraft = false,
): Promise<ActionState> {
  await requireTool(GRANT);
  const supabase = await createClient();

  // Read the revision before the line goes, or there is nothing left
  // pointing at what to discard.
  const { data: line, error: readError } = await supabase
    .from("transmittal_lines")
    .select("drawing_revision_id")
    .eq("id", lineId)
    .maybeSingle();
  if (readError) {
    console.error("removeTransmittalLine read failed:", readError);
    return { error: "Could not take that drawing off. Try again." };
  }
  if (!line) return undefined; // Already gone.

  const { error } = await supabase.from("transmittal_lines").delete().eq("id", lineId);
  if (error) {
    console.error("removeTransmittalLine failed:", error);
    return { error: friendlyDbError(error, "Could not take that drawing off. Try again.") };
  }

  if (discardDraft) {
    const discarded = await discardDraftRevision(supabase, line.drawing_revision_id);
    if (discarded.error) {
      revalidatePath("/design-management", "layout");
      return {
        error: `The drawing is off this transmittal, but its draft could not be deleted: ${discarded.error}`,
      };
    }
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

  // Read the villa BEFORE the row goes: there is no company-wide
  // transmittals list to land on any more, and one step back from a
  // transmittal is its plot.
  const { data: transmittal } = await supabase
    .from("transmittals")
    .select("unit_id")
    .eq("id", transmittalId)
    .maybeSingle();

  const { error } = await supabase.rpc("delete_draft_transmittal", {
    p_transmittal_id: transmittalId,
  });
  if (error) {
    console.error("deleteDraftTransmittal failed:", error);
    return { error: friendlyDbError(error, "Could not delete this draft. Try again.") };
  }

  revalidatePath("/design-management", "layout");
  redirect(
    transmittal ? `/design-management/villas/${transmittal.unit_id}` : "/design-management/villas",
  );
}
