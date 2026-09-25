"use server";

// Type-only import, never re-exported from a "use server" file — the
// 2026-08-03 outage rule, enforced by npm run check:actions.
import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { dbErrorMessage } from "@/lib/db-error";
import { GRANT } from "@/lib/dexter/shared";
import { newShareToken } from "@/lib/dexter/share";
import { DEXTER_BUCKET, deckFolder } from "@/lib/dexter/storage";
import { contentTypeFor, planZip, type ZipEntry } from "@/lib/dexter/unpack";
import { optionalText, text } from "@/lib/form-data";
import { createClient } from "@/lib/supabase/server";
import { unzipSync } from "fflate";
import { revalidatePath } from "next/cache";

/**
 * Writes for Dexter: projects (a named folder), decks (an uploaded HTML
 * page or zip, and the standalone link it gets), and the file itself in
 * the `dexter` bucket. Every action opens with requireTool and ends by
 * revalidating the layout — an exact-path call would leave the welcome
 * counts stale while the moved list refreshes (the exact-path trap in
 * CLAUDE.md).
 *
 * There is no file table here — `dexter_decks` carries only a summary
 * (entry_path, file_count, total_bytes) and Storage is the list of what
 * actually exists under decks/<id>/. That is why replace and delete both
 * have to list the folder rather than read known paths from a row, the
 * one real difference from lib/design-management/files-actions.ts.
 */

// The server-action body cap (next.config.ts), stated again here so a
// file that slips past this check is still refused, not silently
// truncated.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

const PROJECT_NAME_LIMIT = 120;
const CLIENT_NAME_LIMIT = 120;
const DECK_TITLE_LIMIT = 120;

// Storage pages a folder listing at 100 entries; batches removal the
// same way so neither call is handed an unbounded array.
const STORAGE_PAGE_SIZE = 100;
// Six uploads in flight at once — the drawings/uploadDrawingRevisionFile
// precedent, sized for a Vercel function rather than for raw throughput.
const UPLOAD_CONCURRENCY = 6;

type DexterClient = Awaited<ReturnType<typeof createClient>>;

// ---------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------

export async function createProject(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireTool(GRANT);

  const name = text(formData, "name");
  if (!name) return { error: "Give the project a name." };
  if (name.length > PROJECT_NAME_LIMIT) {
    return { error: `Keep the name under ${PROJECT_NAME_LIMIT} characters.` };
  }
  const clientName = optionalText(formData, "client_name");
  if (clientName && clientName.length > CLIENT_NAME_LIMIT) {
    return { error: `Keep the client name under ${CLIENT_NAME_LIMIT} characters.` };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("dexter_projects").insert({
    name,
    client_name: clientName,
    created_by: user.id,
    updated_by: user.id,
  });
  if (error) {
    if (error.code === "23505") return { error: "A project with that name already exists." };
    console.error("createProject failed:", error);
    return { error: dbErrorMessage(error, "Could not create the project. Try again.") };
  }

  revalidatePath("/dexter", "layout");
  return undefined;
}

export async function renameProject(
  projectId: string,
  name: string,
  clientName: string | null,
): Promise<ActionState> {
  const user = await requireTool(GRANT);

  const trimmedName = name.trim();
  if (!trimmedName) return { error: "Give the project a name." };
  if (trimmedName.length > PROJECT_NAME_LIMIT) {
    return { error: `Keep the name under ${PROJECT_NAME_LIMIT} characters.` };
  }
  const trimmedClient = clientName?.trim() || null;
  if (trimmedClient && trimmedClient.length > CLIENT_NAME_LIMIT) {
    return { error: `Keep the client name under ${CLIENT_NAME_LIMIT} characters.` };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("dexter_projects")
    .update({ name: trimmedName, client_name: trimmedClient, updated_by: user.id })
    .eq("id", projectId);
  if (error) {
    if (error.code === "23505") return { error: "A project with that name already exists." };
    console.error("renameProject failed:", error);
    return { error: dbErrorMessage(error, "Could not rename the project. Try again.") };
  }

  revalidatePath("/dexter", "layout");
  return undefined;
}

/** Refuses in plain English when the project still holds decks — the FK
 *  (RESTRICT) refuses too, but this is the sentence a person reads. */
export async function deleteProject(projectId: string): Promise<ActionState> {
  await requireTool(GRANT);
  const supabase = await createClient();

  const { count, error: countError } = await supabase
    .from("dexter_decks")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);
  if (countError) {
    console.error("deleteProject deck count failed:", countError);
    return { error: "Could not delete the project. Try again." };
  }
  if ((count ?? 0) > 0) return { error: "Delete its decks first." };

  const { error } = await supabase.from("dexter_projects").delete().eq("id", projectId);
  if (error) {
    console.error("deleteProject failed:", error);
    return { error: dbErrorMessage(error, "Could not delete the project. Try again.") };
  }

  revalidatePath("/dexter", "layout");
  return undefined;
}

// ---------------------------------------------------------------------
// Upload validation and planning — shared by uploadDeck and replaceDeckFile
// ---------------------------------------------------------------------

type ValidatedUpload = { kind: "html"; file: File } | { kind: "zip"; file: File };

function validateUploadFile(value: FormDataEntryValue | null): ValidatedUpload | { error: string } {
  if (!(value instanceof File) || value.size === 0) return { error: "Choose a file to upload." };
  if (value.size > MAX_UPLOAD_BYTES) {
    return { error: "That file is too large — the limit is 4 MB." };
  }

  const name = value.name.toLowerCase();
  const isHtml = value.type === "text/html" || name.endsWith(".html") || name.endsWith(".htm");
  // Browsers disagree on what MIME type a zip gets (application/zip,
  // application/x-zip-compressed, or a bare application/octet-stream),
  // so the name is what actually decides it.
  const isZip = name.endsWith(".zip");

  if (isHtml) return { kind: "html", file: value };
  if (isZip) return { kind: "zip", file: value };
  return { error: "Upload an HTML file, or a zip with index.html at its top level." };
}

type PlannedFile = { deckPath: string; contentType: string; bytes: Uint8Array };
type UploadPlan = { entry: string; files: PlannedFile[] };

async function buildUploadPlan(
  validated: ValidatedUpload,
): Promise<UploadPlan | { error: string }> {
  if (validated.kind === "html") {
    const bytes = new Uint8Array(await validated.file.arrayBuffer());
    return {
      entry: "index.html",
      files: [{ deckPath: "index.html", contentType: "text/html; charset=utf-8", bytes }],
    };
  }

  const zipBytes = new Uint8Array(await validated.file.arrayBuffer());

  // TWO PASSES, AND THE ORDER IS THE ZIP-BOMB GUARD. The first reads only
  // the central directory — names and DECLARED sizes — and inflates
  // nothing (the filter says no to every file). planZip enforces the
  // 500-file / 40 MB limits on those declared sizes. Only then does the
  // second pass inflate, and only the planned files. fflate inflates
  // each file into a buffer of exactly its declared size and never grows
  // it (inflt: `resize` is false when an output buffer is supplied), so a
  // zip that lies about its sizes fails to read rather than exhausting
  // the function's memory. Inflating first and checking afterwards —
  // the obvious order — lets a 4 MB upload unpack to gigabytes before
  // any limit is consulted.
  const entries: ZipEntry[] = [];
  let unzipped: Record<string, Uint8Array>;
  try {
    unzipSync(zipBytes, {
      filter: (info) => {
        entries.push({
          name: info.name,
          size: info.originalSize,
          isDirectory: info.name.endsWith("/"),
        });
        return false;
      },
    });
  } catch (error) {
    console.error("buildUploadPlan zip directory read failed:", error);
    return { error: "That zip could not be read. Try re-zipping it." };
  }

  const plan = planZip(entries);
  if ("error" in plan) return plan;

  const wanted = new Set(plan.files.map((planned) => planned.zipName));
  try {
    unzipped = unzipSync(zipBytes, { filter: (info) => wanted.has(info.name) });
  } catch (error) {
    console.error("buildUploadPlan unzip failed:", error);
    return { error: "That zip could not be read. Try re-zipping it." };
  }
  if (plan.files.some((planned) => !unzipped[planned.zipName])) {
    return { error: "That zip could not be read. Try re-zipping it." };
  }

  return {
    entry: plan.entry,
    files: plan.files.map((planned) => ({
      deckPath: planned.deckPath,
      contentType: contentTypeFor(planned.deckPath),
      bytes: unzipped[planned.zipName],
    })),
  };
}

/**
 * Uploads every planned file into `folder`, at most UPLOAD_CONCURRENCY
 * at a time. On the first failure, every object already written by this
 * call is removed before returning — a `Blob`, never a raw `Buffer`
 * (BUGCATCHER #1), same as lib/design-management/files-actions.ts.
 */
async function uploadPlannedFiles(
  supabase: DexterClient,
  folder: string,
  files: PlannedFile[],
): Promise<{ error?: string }> {
  const uploaded: string[] = [];
  let index = 0;
  let failure: string | undefined;

  async function worker() {
    while (index < files.length && !failure) {
      const file = files[index++];
      const path = `${folder}/${file.deckPath}`;
      // A BLOB, NOT THE RAW bytes array, AND THIS IS NOT STYLE —
      // BUGCATCHER #1's rule for supabase-js. `new Uint8Array(file.bytes)`
      // also settles a type mismatch: fflate and `arrayBuffer()` hand
      // back a `Uint8Array<ArrayBufferLike>`, which a `SharedArrayBuffer`
      // could back, and DOM's `BlobPart` only accepts one backed by a
      // concrete `ArrayBuffer` — copying through the constructor gives
      // one of those.
      const blob = new Blob([new Uint8Array(file.bytes)], { type: file.contentType });
      const { error } = await supabase.storage
        .from(DEXTER_BUCKET)
        .upload(path, blob, { contentType: file.contentType });
      if (error) {
        console.error("dexter uploadPlannedFiles upload failed:", error);
        const tooLarge =
          error.statusCode === "413" ||
          error.message.includes("Payload too large") ||
          error.message.includes("413");
        failure = tooLarge
          ? "One file inside the zip is bigger than 10 MB."
          : "Could not save the deck. Try again.";
        return;
      }
      uploaded.push(path);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(UPLOAD_CONCURRENCY, files.length) }, () => worker()),
  );

  if (failure) {
    if (uploaded.length > 0) await removePaths(supabase, uploaded);
    return { error: failure };
  }
  return {};
}

/** Confirms the entry file landed at the size it was sent — the same
 *  read-back check uploadDrawingRevisionFile makes, for the same reason:
 *  a silent binary corruption is invisible until a client opens the link. */
async function verifyEntrySize(
  supabase: DexterClient,
  folder: string,
  entryPath: string,
  expectedBytes: number,
): Promise<{ error?: string }> {
  const { data: stored } = await supabase.storage
    .from(DEXTER_BUCKET)
    .list(folder, { search: entryPath });
  const storedSize = stored?.[0]?.metadata?.size as number | undefined;

  if (storedSize !== undefined && storedSize !== expectedBytes) {
    return { error: "The deck did not save correctly. Try again." };
  }
  return {};
}

/**
 * Every object under `folder`, recursively — Storage's `list` only
 * returns one level, and a deck's assets sit in subfolders, so a
 * "folder" entry (`id: null`) is walked into rather than treated as a
 * file. Pages at 100, the Storage API's own cap.
 */
async function listFolderPaths(supabase: DexterClient, folder: string): Promise<string[]> {
  const paths: string[] = [];
  const stack = [folder];

  while (stack.length > 0) {
    const current = stack.pop() as string;
    let offset = 0;
    for (;;) {
      const { data, error } = await supabase.storage
        .from(DEXTER_BUCKET)
        .list(current, { limit: STORAGE_PAGE_SIZE, offset });
      if (error) throw error;

      const entries = data ?? [];
      for (const entry of entries) {
        const path = `${current}/${entry.name}`;
        if (entry.id === null) stack.push(path);
        else paths.push(path);
      }

      if (entries.length < STORAGE_PAGE_SIZE) break;
      offset += STORAGE_PAGE_SIZE;
    }
  }

  return paths;
}

/** Removes every path, in batches of 100 — the same cap `list` pages at. */
async function removePaths(supabase: DexterClient, paths: string[]): Promise<void> {
  for (let i = 0; i < paths.length; i += STORAGE_PAGE_SIZE) {
    const batch = paths.slice(i, i + STORAGE_PAGE_SIZE);
    const { error } = await supabase.storage.from(DEXTER_BUCKET).remove(batch);
    if (error) console.error("dexter removePaths failed:", error);
  }
}

// ---------------------------------------------------------------------
// Decks
// ---------------------------------------------------------------------

/**
 * Row first, with a freshly minted id and share token, then the objects
 * — a failed upload deletes both the objects that landed and the row,
 * rather than leaving a deck that points at nothing.
 */
export async function uploadDeck(projectId: string, formData: FormData): Promise<ActionState> {
  const user = await requireTool(GRANT);

  const title = text(formData, "title");
  if (!title) return { error: "Give the deck a title." };
  if (title.length > DECK_TITLE_LIMIT) {
    return { error: `Keep the title under ${DECK_TITLE_LIMIT} characters.` };
  }

  const validated = validateUploadFile(formData.get("file"));
  if ("error" in validated) return validated;

  const plan = await buildUploadPlan(validated);
  if ("error" in plan) return plan;

  const supabase = await createClient();
  const deckId = crypto.randomUUID();
  const folder = deckFolder(deckId);
  const totalBytes = plan.files.reduce((sum, file) => sum + file.bytes.length, 0);

  const { error: insertError } = await supabase.from("dexter_decks").insert({
    id: deckId,
    project_id: projectId,
    title,
    entry_path: plan.entry,
    share_token: newShareToken(),
    file_count: plan.files.length,
    total_bytes: totalBytes,
    uploaded_by: user.id,
    created_by: user.id,
    updated_by: user.id,
  });
  if (insertError) {
    console.error("uploadDeck insert failed:", insertError);
    return { error: dbErrorMessage(insertError, "Could not create the deck. Try again.") };
  }

  const uploadResult = await uploadPlannedFiles(supabase, folder, plan.files);
  if (uploadResult.error) {
    await supabase.from("dexter_decks").delete().eq("id", deckId);
    return { error: uploadResult.error };
  }

  const entryBytes = plan.files.find((file) => file.deckPath === plan.entry)?.bytes.length ?? 0;
  const sizeCheck = await verifyEntrySize(supabase, folder, plan.entry, entryBytes);
  if (sizeCheck.error) {
    await removePaths(
      supabase,
      plan.files.map((file) => `${folder}/${file.deckPath}`),
    );
    await supabase.from("dexter_decks").delete().eq("id", deckId);
    return { error: sizeCheck.error };
  }

  revalidatePath("/dexter", "layout");
  return undefined;
}

/**
 * Replaces a deck's file in place — same id, same link. The existing
 * objects are removed BEFORE the new ones are written (there is no file
 * table to diff against, only the folder itself), so a failure partway
 * through leaves the row pointing at whatever landed; the error says so
 * rather than pretending the old file is still there.
 */
export async function replaceDeckFile(deckId: string, formData: FormData): Promise<ActionState> {
  const user = await requireTool(GRANT);

  const validated = validateUploadFile(formData.get("file"));
  if ("error" in validated) return validated;

  const plan = await buildUploadPlan(validated);
  if ("error" in plan) return plan;

  const supabase = await createClient();
  const { data: deck, error: readError } = await supabase
    .from("dexter_decks")
    .select("id")
    .eq("id", deckId)
    .maybeSingle();
  if (readError) {
    console.error("replaceDeckFile read failed:", readError);
    return { error: "Could not replace the file. Try again." };
  }
  if (!deck) return { error: "That deck no longer exists." };

  const folder = deckFolder(deckId);
  let existing: string[];
  try {
    existing = await listFolderPaths(supabase, folder);
  } catch (listError) {
    console.error("replaceDeckFile list failed:", listError);
    return { error: "Could not replace the file. Try again." };
  }
  if (existing.length > 0) await removePaths(supabase, existing);

  const uploadResult = await uploadPlannedFiles(supabase, folder, plan.files);
  if (uploadResult.error) {
    return { error: `${uploadResult.error} The previous file was already removed — try again.` };
  }

  const entryBytes = plan.files.find((file) => file.deckPath === plan.entry)?.bytes.length ?? 0;
  const sizeCheck = await verifyEntrySize(supabase, folder, plan.entry, entryBytes);
  if (sizeCheck.error) {
    await removePaths(
      supabase,
      plan.files.map((file) => `${folder}/${file.deckPath}`),
    );
    return { error: `${sizeCheck.error} The previous file was already removed — try again.` };
  }

  const totalBytes = plan.files.reduce((sum, file) => sum + file.bytes.length, 0);
  const { error: updateError } = await supabase
    .from("dexter_decks")
    .update({
      entry_path: plan.entry,
      file_count: plan.files.length,
      total_bytes: totalBytes,
      uploaded_by: user.id,
      updated_by: user.id,
    })
    .eq("id", deckId);
  if (updateError) {
    console.error("replaceDeckFile update failed:", updateError);
    return {
      error: dbErrorMessage(
        updateError,
        "The file uploaded, but the deck record could not be updated. Try again.",
      ),
    };
  }

  revalidatePath("/dexter", "layout");
  return undefined;
}

export async function renameDeck(deckId: string, title: string): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const trimmed = title.trim();
  if (!trimmed) return { error: "Give the deck a title." };
  if (trimmed.length > DECK_TITLE_LIMIT) {
    return { error: `Keep the title under ${DECK_TITLE_LIMIT} characters.` };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("dexter_decks")
    .update({ title: trimmed, updated_by: user.id })
    .eq("id", deckId);
  if (error) {
    console.error("renameDeck failed:", error);
    return { error: dbErrorMessage(error, "Could not rename the deck. Try again.") };
  }

  revalidatePath("/dexter", "layout");
  return undefined;
}

export async function setDeckSharing(deckId: string, enabled: boolean): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const supabase = await createClient();

  const { error } = await supabase
    .from("dexter_decks")
    .update({ share_enabled: enabled, updated_by: user.id })
    .eq("id", deckId);
  if (error) {
    console.error("setDeckSharing failed:", error);
    return { error: dbErrorMessage(error, "Could not update sharing. Try again.") };
  }

  revalidatePath("/dexter", "layout");
  return undefined;
}

/** A fresh token — the old link stops working the moment this lands. */
export async function reissueDeckLink(deckId: string): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const supabase = await createClient();

  const { error } = await supabase
    .from("dexter_decks")
    .update({ share_token: newShareToken(), updated_by: user.id })
    .eq("id", deckId);
  if (error) {
    console.error("reissueDeckLink failed:", error);
    return { error: dbErrorMessage(error, "Could not create a new link. Try again.") };
  }

  revalidatePath("/dexter", "layout");
  return undefined;
}

/** Row first, then the objects — the reverse of upload, same reasoning.
 *  A cleanup failure is logged, not surfaced: the deck is already gone
 *  from every screen and every link, which is what the person asked for. */
export async function deleteDeck(deckId: string): Promise<ActionState> {
  await requireTool(GRANT);
  const supabase = await createClient();

  const { error } = await supabase.from("dexter_decks").delete().eq("id", deckId);
  if (error) {
    console.error("deleteDeck failed:", error);
    return { error: dbErrorMessage(error, "Could not delete the deck. Try again.") };
  }

  try {
    const paths = await listFolderPaths(supabase, deckFolder(deckId));
    if (paths.length > 0) await removePaths(supabase, paths);
  } catch (cleanupError) {
    console.error("deleteDeck storage cleanup failed:", cleanupError);
  }

  revalidatePath("/dexter", "layout");
  return undefined;
}
