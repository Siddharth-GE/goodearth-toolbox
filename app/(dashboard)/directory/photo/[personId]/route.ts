import { hasApp } from "@/lib/auth/access";
import { getCurrentUser } from "@/lib/auth/dal";
import { STAFF_PHOTOS_BUCKET } from "@/lib/directory/photo";
import { createClient } from "@/lib/supabase/server";
import { storedFileResponse } from "@/lib/uploads/stored-file";

/**
 * Serves a staff photo. The bucket is private, so this is the only way to see one, and a staff photo must not sit at a URL that outlives their account.
 * Plain <img> at this route: next/image cannot reach a private object (next.config.ts allows only /object/public/**).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ personId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { personId } = await params;

  // Anyone in the Directory sees any photo; anyone sees their own, so My details works without the grant.
  const allowed = (await hasApp(user, "/directory")) || personId === user.id;
  if (!allowed) return new Response("Forbidden", { status: 403 });

  const supabase = await createClient();

  const { data: card, error: cardError } = await supabase
    .from("staff_details")
    .select("photo_path")
    .eq("id", personId)
    .maybeSingle();
  if (cardError) {
    console.error("staff photo lookup failed:", cardError);
    return new Response("Could not load the photo", { status: 500 });
  }
  if (!card?.photo_path) return new Response("Not found", { status: 404 });

  return storedFileResponse(supabase, STAFF_PHOTOS_BUCKET, card.photo_path, {
    contentType: "image/jpeg",
  });
}
