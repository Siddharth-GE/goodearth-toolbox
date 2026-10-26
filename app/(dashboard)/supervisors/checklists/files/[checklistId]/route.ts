import { hasApp } from "@/lib/auth/access";
import { getCurrentUser } from "@/lib/auth/dal";
import { idParam } from "@/lib/list-params";
import { createClient } from "@/lib/supabase/server";
import { storedFileResponse } from "@/lib/uploads/stored-file";

/** The checklist is looked up BY ID through the RLS-scoped client first, so a path never leaves the server for anyone
 * without /supervisors. The type comes from the stored name, which the upload action chose from the checked file type. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ checklistId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  // hasApp, not requireTool: a redirect means nothing to a file request.
  if (!(await hasApp(user, "/supervisors"))) return new Response("Forbidden", { status: 403 });

  const checklistId = idParam((await params).checklistId);
  if (!checklistId) return new Response("Not found", { status: 404 });

  const supabase = await createClient();
  const { data: checklist, error } = await supabase
    .from("site_checklists")
    .select("attachment_path")
    .eq("id", checklistId)
    .maybeSingle();
  if (error) {
    console.error("checklist file lookup failed:", error);
    return new Response("Could not load the file", { status: 500 });
  }
  if (!checklist?.attachment_path) return new Response("Not found", { status: 404 });

  const path = checklist.attachment_path;
  const contentType = path.endsWith(".pdf")
    ? "application/pdf"
    : path.endsWith(".png")
      ? "image/png"
      : "image/jpeg";
  return storedFileResponse(supabase, "site-checklists", path, {
    contentType,
    fileName: `checklist${path.slice(path.lastIndexOf("."))}`,
    nosniff: true,
  });
}
