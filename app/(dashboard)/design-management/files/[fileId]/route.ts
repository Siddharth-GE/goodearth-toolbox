import { hasApp } from "@/lib/auth/access";
import { getCurrentUser } from "@/lib/auth/dal";
import { DRAWINGS_BUCKET } from "@/lib/design-management/storage";
import { sheetNamingContext } from "@/lib/drawings/sheet-context";
import { sheetFileName } from "@/lib/drawings/sheet-name";
import { createClient } from "@/lib/supabase/server";

/**
 * Serves one drawing sheet.
 *
 * The `drawings` bucket is private and its own storage SELECT policy
 * (0091) is deliberately coarser than the table's — it admits either
 * grant. The narrow gate is here: the file row is looked up BY ID
 * through the RLS-scoped client, whose widened SELECT qual on
 * drawing_revisions (`has_app('/design-management') or
 * (has_app('/supervisors') and status <> 'draft')`) hides a draft
 * revision's files automatically. A missing row is a 404, and a draft
 * sheet's storage path never leaves the server for a supervisor to see —
 * the shape app/(dashboard)/selections/views/[viewId]/route.ts already
 * uses for design views.
 *
 * The file goes out under its sheet name (lib/drawings/sheet-name.ts:
 * SAA-Saarang-Villa12-WD-TR0003-GFP.pdf), built now because the
 * transmittal number exists only once issued. If that lookup fails the
 * sheet is still served, under the name it was uploaded with — the
 * drawing matters more than its label.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  // hasApp, not requireTool — a redirect is meaningless in a fetch
  // response. Design Management manages these; Supervisors reads the
  // released ones against each work.
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

  // The plain name for old clients, the UTF-8 one for everything else.
  const asciiName = downloadName.replace(/[^ -~]/g, "_").replace(/"/g, "");
  return new Response(await object.arrayBuffer(), {
    headers: {
      "Content-Type": file.content_type,
      "Content-Disposition": `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`,
      // Private, so no shared cache may keep a copy — but a replacement is
      // a new object at a new path, so the bytes at this id never change
      // and the browser can hold on to them for a while.
      "Cache-Control": "private, max-age=3600",
    },
  });
}
