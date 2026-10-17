import { hasApp } from "@/lib/auth/access";
import { getCurrentUser } from "@/lib/auth/dal";
import { DRAWINGS_BUCKET } from "@/lib/design-management/storage";
import { sheetNamingContext } from "@/lib/drawings/sheet-context";
import { sheetFileName } from "@/lib/drawings/sheet-name";
import { createClient } from "@/lib/supabase/server";

/**
 * Serves one drawing sheet. The private `drawings` bucket's SELECT policy (0091) is coarser than the table's, so the narrow gate is here:
 * the row is looked up by id through the RLS-scoped client, whose widened qual on drawing_revisions hides a draft's files from supervisors (404; the storage path never leaves the server).
 * Served under its sheet name (lib/drawings/sheet-name.ts, built now since the number exists only once issued); if that lookup fails, under the uploaded name.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  // hasApp, not requireTool: a redirect is meaningless in a fetch. Design Management manages these; Supervisors reads released ones.
  const allowed =
    (await hasApp(user, "/design-management")) || (await hasApp(user, "/supervisors"));
  if (!allowed) return new Response("Forbidden", { status: 403 });

  const { fileId } = await params;
  const supabase = await createClient();

  const { data: file } = await supabase
    .from("drawing_revision_files")
    .select("storage_path, file_name, content_type, sheet_code, drawing_revision_id")
    .eq("id", fileId)
    .maybeSingle();
  if (!file) return new Response("Not found", { status: 404 });

  const { data: object, error } = await supabase.storage
    .from(DRAWINGS_BUCKET)
    .download(file.storage_path);
  if (error || !object) return new Response("Not found", { status: 404 });

  let downloadName = file.file_name;
  try {
    const context = (await sheetNamingContext(supabase, [file.drawing_revision_id])).get(
      file.drawing_revision_id,
    );
    if (context) {
      downloadName = sheetFileName({
        ...context,
        sheetCode: file.sheet_code,
        originalFileName: file.file_name,
        contentType: file.content_type,
      });
    }
  } catch (error) {
    console.error("drawing sheet name lookup failed:", error);
  }

  const asciiName = downloadName.replace(/[^ -~]/g, "_").replace(/"/g, "");
  return new Response(await object.arrayBuffer(), {
    headers: {
      "Content-Type": file.content_type,
      "Content-Disposition": `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`,
      // Private, so no shared cache; a replacement is a new path, so these bytes never change.
      "Cache-Control": "private, max-age=3600",
    },
  });
}
