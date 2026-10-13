import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Putting one uploaded document into a private bucket, and proving it
 * landed whole — the steps every tool's upload repeats
 * (lib/design-management/files-actions.ts, lib/directory/actions.ts),
 * here for the tools that store a document as it came.
 *
 * Type and size are checked first. Storage is handed a BLOB, never a raw
 * Buffer (BUGCATCHER #1: under Next's patched fetch a Buffer is text-
 * decoded and stored as rubbish with the right content type). What landed
 * is read back and its size compared; a mismatch removes the object.
 *
 * Returns null on success, or the sentence to show.
 */

export const STORED_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const LIMIT = 4 * 1024 * 1024;

export function checkUpload(file: FormDataEntryValue | null): File | string {
  if (!(file instanceof File) || file.size === 0) return "Choose a file to upload.";
  if (file.size > LIMIT) return "That file is too large — the limit is 4 MB.";
  if (!STORED_TYPES.includes(file.type)) return "Upload a photo (JPG or PNG) or a PDF.";
  return file;
}

export function extensionFor(contentType: string): string {
  return contentType === "application/pdf" ? "pdf" : contentType === "image/png" ? "png" : "jpg";
}

export async function storeUpload(
  supabase: SupabaseClient<Database>,
  bucket: string,
  path: string,
  file: File,
): Promise<string | null> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const blob = new Blob([bytes], { type: file.type });

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, blob, { contentType: file.type });
  if (error) {
    console.error(`storeUpload to ${bucket} failed:`, error);
    return "Could not save the file. Try again.";
  }

  const folder = path.slice(0, path.lastIndexOf("/"));
  const name = path.slice(path.lastIndexOf("/") + 1);
  const { data: stored } = await supabase.storage.from(bucket).list(folder, { search: name });
  const storedSize = stored?.[0]?.metadata?.size as number | undefined;
  if (storedSize !== undefined && storedSize !== bytes.length) {
    await supabase.storage.from(bucket).remove([path]);
    console.error(`storeUpload: stored ${storedSize} bytes of ${bytes.length} in ${bucket}`);
    return "The file did not save correctly. Try again.";
  }
  return null;
}
