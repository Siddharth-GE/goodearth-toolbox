import { hasApp } from "@/lib/auth/access";
import { getCurrentUser } from "@/lib/auth/dal";
import { DESIGN_VIEWS_BUCKET } from "@/lib/design-views/queries";
import { createClient } from "@/lib/supabase/server";

/**
 * Serves a design view.
 *
 * The `design-views` bucket is private, so this is the only way to see
 * one: the caller is checked, then the object is streamed. An object path
 * on its own gets you nothing, which is the difference between these and
 * the public catalogue thumbnails — these are a specific client's design
 * work, not vendor product photos.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ viewId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  // Designers manage these; Budgets renders them into the client quote.
  const allowed = (await hasApp(user, "/selections")) || (await hasApp(user, "/budgets"));
  if (!allowed) return new Response("Forbidden", { status: 403 });

  const { viewId } = await params;
  const supabase = await createClient();

  const { data: view } = await supabase
    .from("space_views")
    .select("storage_path")
    .eq("id", viewId)
    .maybeSingle();
  if (!view) return new Response("Not found", { status: 404 });

  const { data: file, error } = await supabase.storage
    .from(DESIGN_VIEWS_BUCKET)
    .download(view.storage_path);
  if (error || !file) return new Response("Not found", { status: 404 });

  return new Response(await file.arrayBuffer(), {
    headers: {
      "Content-Type": "image/jpeg",
      // Private, so no shared cache may keep a copy — but the bytes at a
      // given id never change (a replacement is a new row), so the
      // browser can hold it.
      "Cache-Control": "private, max-age=3600",
    },
  });
}
