import { hasApp } from "@/lib/auth/access";
import { getCurrentUser } from "@/lib/auth/dal";
import { DESIGN_VIEWS_BUCKET } from "@/lib/design-views/queries";
import { createClient } from "@/lib/supabase/server";
import { storedFileResponse } from "@/lib/uploads/stored-file";

/** The design-views bucket is private: this route checks the caller, then streams the object. These are a client's design work, not public product photos. */
export async function GET(_request: Request, { params }: { params: Promise<{ viewId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const allowed = (await hasApp(user, "/selections")) || (await hasApp(user, "/budgets"));
  if (!allowed) return new Response("Forbidden", { status: 403 });

  const { viewId } = await params;
  const supabase = await createClient();

  const { data: view, error: viewError } = await supabase
    .from("space_views")
    .select("storage_path")
    .eq("id", viewId)
    .maybeSingle();
  if (viewError) {
    console.error("design view lookup failed:", viewError);
    return new Response("Could not load the image", { status: 500 });
  }
  if (!view) return new Response("Not found", { status: 404 });

  return storedFileResponse(supabase, DESIGN_VIEWS_BUCKET, view.storage_path, {
    contentType: "image/jpeg",
  });
}
