"use server";

// Type-only import, never re-exported from a "use server" file — the
// 2026-08-03 outage rule, enforced by npm run check:actions.
import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { dbErrorMessage } from "@/lib/db-error";
import { DRAWINGS_BUCKET } from "@/lib/design-management/storage";
import { GRANT } from "@/lib/design-management/shared";
import { designView } from "@/lib/pdf/theme";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
// sharp is imported LAZILY inside the one branch that resizes an image —
// never at module level. A top-level import means a missing native
// binary on the deployed runtime kills EVERY action in this file at
// load, including ones that never touch an image (2026-08-22: "Add a
// drawing" died this way on staging). Lazy, the blast radius is one
// upload branch with its own error message.

// The server-action body cap (next.config.ts) and the `drawings` bucket's
// own `file_size_limit` (0091) — stated again here so a file that slips
// past this check is still refused by the database, not silently
// truncated.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const ACCEPTED_FILE_TYPES = ["application/pdf", "image/jpeg", "image/png"];

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

  const { data: last, error: lastError } = await supabase
    .from("drawing_revision_files")
    .select("sort_order")
    .eq("drawing_revision_id", revisionId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastError) {
    console.error("drawing_revision_files next sort_order read failed:", lastError);
    return { error: "Could not work out where to add it. Try again." };
  }

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
    return { error: dbErrorMessage(error, "Could not save the file. Try again.") };
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
    return { error: dbErrorMessage(error, "Could not remove the file. Try again.") };
  }

  const { error: removeError } = await supabase.storage
    .from(DRAWINGS_BUCKET)
    .remove([file.storage_path]);
  if (removeError) console.error("deleteDrawingRevisionFile storage cleanup failed:", removeError);

  revalidatePath("/design-management", "layout");
  return undefined;
}
