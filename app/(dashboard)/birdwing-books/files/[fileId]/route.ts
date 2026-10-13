import { hasApp } from "@/lib/auth/access";
import { getCurrentUser } from "@/lib/auth/dal";
import { BILLS_BUCKET } from "@/lib/birdwing-books/storage";
import { idParam } from "@/lib/list-params";
import { createClient } from "@/lib/supabase/server";

/**
 * Serves one expense bill from the private `birdwing-books` bucket: the row
 * is looked up by id through the RLS-scoped client first, so a path never
 * leaves the server for anyone without /birdwing-books. nosniff: the type
 * is what the row says.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  if (!(await hasApp(user, "/birdwing-books"))) return new Response("Forbidden", { status: 403 });

  const fileId = idParam((await params).fileId);
  if (!fileId) return new Response("Not found", { status: 404 });

  const supabase = await createClient();
  const { data: file, error: readError } = await supabase
    .from("birdwing_expense_files")
    .select("storage_path, file_name, content_type")
    .eq("id", fileId)
    .maybeSingle();
  if (readError) {
    console.error("birdwing-books file lookup failed:", readError);
    return new Response("Could not load the file", { status: 500 });
  }
  if (!file) return new Response("Not found", { status: 404 });

  const { data: object, error } = await supabase.storage
    .from(BILLS_BUCKET)
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
