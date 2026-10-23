import { hasApp } from "@/lib/auth/access";
import { getCurrentUser } from "@/lib/auth/dal";
import { idParam } from "@/lib/list-params";
import { createClient } from "@/lib/supabase/server";
import { storedFileResponse } from "@/lib/uploads/stored-file";

/** One check's photo. The item is looked up BY ID through the RLS-scoped client first, so a path never leaves the server for
 * anyone without /supervisors. */
export async function GET(_request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  // hasApp, not requireTool: a redirect means nothing to a file request.
  if (!(await hasApp(user, "/supervisors"))) return new Response("Forbidden", { status: 403 });

  const itemId = idParam((await params).itemId);
  if (!itemId) return new Response("Not found", { status: 404 });

  const supabase = await createClient();
  const { data: item, error } = await supabase
    .from("site_checklist_items")
    .select("photo_path")
    .eq("id", itemId)
    .maybeSingle();
  if (error) {
    console.error("checklist photo lookup failed:", error);
    return new Response("Could not load the photo", { status: 500 });
  }
  if (!item?.photo_path) return new Response("Not found", { status: 404 });

  const path = item.photo_path;
  return storedFileResponse(supabase, "site-checklists", path, {
    contentType: path.endsWith(".png") ? "image/png" : "image/jpeg",
    fileName: `check${path.slice(path.lastIndexOf("."))}`,
    nosniff: true,
  });
}
