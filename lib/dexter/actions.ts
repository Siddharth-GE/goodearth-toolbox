"use server";

// Type-only; never re-exported from a "use server" file (BUGCATCHER #5).
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

// Every action opens with requireTool and revalidates the layout (an exact path leaves the welcome
// counts stale). No file table: Storage is the list of what exists under decks/<id>/, so replace
// and delete list the folder.

// Mirrors the server-action body cap (next.config.ts), so a file past it is refused, not truncated.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

const PROJECT_NAME_LIMIT = 120;
const CLIENT_NAME_LIMIT = 120;
const DECK_TITLE_LIMIT = 120;

// Storage lists 100 at a time; removal batches the same way.
const STORAGE_PAGE_SIZE = 100;
// Sized for a Vercel function, not raw throughput.
const UPLOAD_CONCURRENCY = 6;

type DexterClient = Awaited<ReturnType<typeof createClient>>;

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

// The RESTRICT FK refuses too, but this is the sentence a person reads.
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

type ValidatedUpload = { kind: "html"; file: File } | { kind: "zip"; file: File };

function validateUploadFile(value: FormDataEntryValue | null): ValidatedUpload | { error: string } {
  if (!(value instanceof File) || value.size === 0) return { error: "Choose a file to upload." };
  if (value.size > MAX_UPLOAD_BYTES) {
    return { error: "That file is too large — the limit is 4 MB." };
  }

  const name = value.name.toLowerCase();
  const isHtml = value.type === "text/html" || name.endsWith(".html") || name.endsWith(".htm");
  // Browsers disagree on a zip's MIME type, so the name decides.
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

  // Two passes, and the order is the zip-bomb guard: first read only names and DECLARED sizes
  // (inflating nothing) so planZip can enforce the 500-file / 40 MB limits. Then inflate only
  // planned files into buffers of exactly the declared size (fflate never grows them), so a zip
  // that lies about its sizes fails instead of exhausting memory.
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

// On the first failure every object this call wrote is removed. A Blob, never a raw Buffer
// (BUGCATCHER #1).
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
      // A Blob, not raw bytes (BUGCATCHER #1); copying through Uint8Array also gives BlobPart a
      // concrete ArrayBuffer.
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

// Read-back check: a silent binary corruption is invisible until a client opens the link.
async function verifyEntrySize(
  supabase: DexterClient,
  folder: string,
  entryPath: string,
  expectedBytes: number,
): Promise<{ error?: string }> {
  const { data: stored } = await supabase.storage
    .from(DEXTER_BUCKET)
    .list(folder, { search: entryPath });
  // Match the exact name: `search` is a substring match, so index.html and print-index.html would
  // be confused and a good upload rolled back.
  const storedSize = stored?.find((object) => object.name === entryPath)?.metadata?.size as
    number | undefined;

  if (storedSize !== undefined && storedSize !== expectedBytes) {
    return { error: "The deck did not save correctly. Try again." };
  }
  return {};
}

// Storage's `list` returns one level, so "folder" entries (id: null) are walked into. Pages at 100.
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

async function removePaths(supabase: DexterClient, paths: string[]): Promise<void> {
  for (let i = 0; i < paths.length; i += STORAGE_PAGE_SIZE) {
    const batch = paths.slice(i, i + STORAGE_PAGE_SIZE);
    const { error } = await supabase.storage.from(DEXTER_BUCKET).remove(batch);
    if (error) console.error("dexter removePaths failed:", error);
  }
}

// Row first, then objects; a failed upload deletes both rather than leave a deck pointing at
// nothing.
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

// Same id, same link. Old objects go BEFORE the new ones are written, so a failure partway leaves
// the row pointing at whatever landed; the error says so.
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

/** Staff clear a deck's saved answers; the public side can never clear or un-send. */
export async function clearDeckAnswers(deckId: string): Promise<ActionState> {
  await requireTool(GRANT);
  const supabase = await createClient();

  const { error } = await supabase.from("dexter_answers").delete().eq("deck_id", deckId);
  if (error) {
    console.error("clearDeckAnswers failed:", error);
    return { error: dbErrorMessage(error, "Could not clear the answers. Try again.") };
  }

  revalidatePath("/dexter", "layout");
  return undefined;
}

// Row first, then objects. A cleanup failure is logged, not surfaced: the deck is already gone from
// every link.
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
