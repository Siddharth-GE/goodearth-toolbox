import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { inlineDisposition } from "./disposition";

/**
 * Streams one object from a private bucket. The caller has already passed its grant check and its RLS lookup by id
 * (both stay in the route) and hands over the path that lookup returned. A missing or unreadable object is a 404.
 * `fileName` adds an inline Content-Disposition; `nosniff` stops a browser guessing a type other than the row's.
 * Private cache only: a replacement is a new path, so the bytes at one path never change.
 */
export async function storedFileResponse(
  supabase: SupabaseClient<Database>,
  bucket: string,
  path: string,
  options: { contentType: string; fileName?: string; nosniff?: boolean },
): Promise<Response> {
  const { data: object, error } = await supabase.storage.from(bucket).download(path);
  if (error || !object) return new Response("Not found", { status: 404 });

  const headers: Record<string, string> = { "Content-Type": options.contentType };
  if (options.fileName !== undefined) {
    headers["Content-Disposition"] = inlineDisposition(options.fileName);
  }
  headers["Cache-Control"] = "private, max-age=3600";
  if (options.nosniff) headers["X-Content-Type-Options"] = "nosniff";

  return new Response(await object.arrayBuffer(), { headers });
}
