import { hasApp } from "@/lib/auth/access";
import { getCurrentUser } from "@/lib/auth/dal";
import { STAYS_BUCKET } from "@/lib/birdwing/storage";
import { idParam } from "@/lib/list-params";
import { createClient } from "@/lib/supabase/server";

/**
 * Serves one stay document — a guest's ID, a booking confirmation — from
 * the private `birdwing-stays` bucket. The row is looked up BY ID through
 * the RLS-scoped client first (the Design Management shape), so a path
 * never leaves the server for anyone without /birdwing; the bucket's own
 * policy says the same again. Private cache only, and nosniff, because a
 * file's type is what the row says it is, nothing a browser guesses.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  // hasApp, not requireTool — a redirect means nothing to a file request.
  if (!(await hasApp(user, "/birdwing"))) return new Response("Forbidden", { status: 403 });

  const fileId = idParam((await params).fileId);
  if (!fileId) return new Response("Not found", { status: 404 });

  const supabase = await createClient();
  const { data: file, error: readError } = await supabase
    .from("birdwing_stay_files")
    .select("storage_path, file_name, content_type")
    .eq("id", fileId)
    .maybeSingle();
  if (readError) {
    console.error("birdwing file lookup failed:", readError);
    return new Response("Could not load the file", { status: 500 });
  }
  if (!file) return new Response("Not found", { status: 404 });

  const { data: object, error } = await supabase.storage
    .from(STAYS_BUCKET)
    .download(file.storage_path);
  if (error || !object) return new Response("Not found", { status: 404 });

  const asciiName = file.file_name.replace(/[^ -~]/g, "_").replace(/"/g, "");
  return new Response(await object.arrayBuffer(), {
    headers: {
      "Content-Type": file.content_type,
      "Content-Disposition": `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(file.file_name)}`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
