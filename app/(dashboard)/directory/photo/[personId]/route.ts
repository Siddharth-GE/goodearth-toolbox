import { hasApp } from "@/lib/auth/access";
import { getCurrentUser } from "@/lib/auth/dal";
import { STAFF_PHOTOS_BUCKET } from "@/lib/directory/photo";
import { createClient } from "@/lib/supabase/server";

/**
 * Serves a staff photo.
 *
 * The bucket is private, so this is the only way to see one — an object
 * path on its own gets you nothing. Same precedent as the design-view
 * route, and for a stronger reason: a photograph of a member of staff is
 * personal data, so it must not sit at a URL that outlives their account.
 *
 * `next/image` cannot reach a private object (next.config.ts only allows
 * /object/public/**), and there is nothing left to optimise in a 40KB
 * 512px JPEG anyway — the component renders a plain <img> at this route.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ personId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { personId } = await params;

  // Anyone in the Directory sees any colleague's photo; anyone at all
  // sees their own, which is what keeps My details working for somebody
  // who has not been granted the tool.
  const allowed = (await hasApp(user, "/directory")) || personId === user.id;
  if (!allowed) return new Response("Forbidden", { status: 403 });

  const supabase = await createClient();

  const { data: card } = await supabase
    .from("staff_details")
    .select("photo_path")
    .eq("id", personId)
    .maybeSingle();
  if (!card?.photo_path) return new Response("Not found", { status: 404 });

  const { data: file, error } = await supabase.storage
    .from(STAFF_PHOTOS_BUCKET)
    .download(card.photo_path);
  if (error || !file) return new Response("Not found", { status: 404 });

  return new Response(await file.arrayBuffer(), {
    headers: {
      "Content-Type": "image/jpeg",
      // Private, so no shared cache may keep a copy. The browser can hold
      // it, because a replacement is a new object at a new path and the
      // ?v= on the URL changes with it.
      "Cache-Control": "private, max-age=3600",
    },
  });
}
