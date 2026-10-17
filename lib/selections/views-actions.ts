"use server";

import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { designView } from "@/lib/pdf/theme";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
// sharp loads LAZILY in the resize branch: a top-level import with a missing native binary kills every action in this file at load.

// Re-declared, not imported from the "server-only" lib/design-views/queries.ts, which would drag that chain into the client bundle. Both copies carry this comment.
const BUCKET = "design-views";

// Server Actions cap the body at 1MB (raised to 4mb in next.config.ts), so larger never arrives. The browser sends ~300KB; this backstops other callers.
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/avif"];

/** Normalised to lib/pdf/theme.ts's spec on the way in: 16:9, letterboxed on white, JPEG (@react-pdf can't embed WebP). */
export async function uploadSpaceView(
  spaceId: string,
  selectionId: string,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireTool("/selections");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image to upload." };
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      error: "That image is too large to upload. Export it at a smaller size and try again.",
    };
  }
  if (!ACCEPTED.includes(file.type)) {
    return { error: "Upload a JPG, PNG, WebP or AVIF." };
  }

  const caption = String(formData.get("caption") ?? "").trim() || null;

  let normalised: Buffer;
  try {
    const { default: sharp } = await import("sharp");
    normalised = await sharp(Buffer.from(await file.arrayBuffer()))
      // `contain` keeps the whole drawing; `cover` would crop a corner off an elevation.
      .resize(designView.width, designView.height, {
        fit: "contain",
        background: { r: 255, g: 255, b: 255 },
      })
      .jpeg({ quality: designView.quality })
      .toBuffer();
  } catch (error) {
    console.error("uploadSpaceView resize failed:", error);
    return { error: "That file could not be read as an image." };
  }

  const supabase = await createClient();

  // The bucket and policies come from migration 0010; an ordinary user can't create buckets at upload time.
  const path = `spaces/${spaceId}/${crypto.randomUUID()}.${designView.extension}`;

  // A Blob, not the raw Buffer: supabase-js only builds a multipart body from a Blob, and a Buffer through Next's patched fetch is text-decoded, corrupting a JPEG with no error.
  const blob = new Blob([new Uint8Array(normalised)], { type: designView.contentType });

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: designView.contentType });
  if (uploadError) {
    console.error("uploadSpaceView upload failed:", uploadError);
    // Storage refuses rather than explains, so name the most likely cause.
    return {
      error: "Could not save the image — you may not have permission to upload design views.",
    };
  }

  const { data: last } = await supabase
    .from("space_views")
    .select("sort_order")
    .eq("space_id", spaceId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("space_views").insert({
    space_id: spaceId,
    storage_path: path,
    caption,
    sort_order: (last?.sort_order ?? -1) + 1,
    uploaded_by: user.id,
  });

  if (error) {
    // The object is already in storage; an orphan is better than a row pointing at nothing.
    await supabase.storage.from(BUCKET).remove([path]);
    console.error("uploadSpaceView insert failed:", error);
    return { error: "Could not save the image. Try again." };
  }

  revalidatePath("/selections", "layout");
  return undefined;
}

export async function captionSpaceView(
  viewId: string,
  selectionId: string,
  caption: string,
): Promise<ActionState> {
  await requireTool("/selections");
  const supabase = await createClient();

  const { error } = await supabase
    .from("space_views")
    .update({ caption: caption.trim() || null })
    .eq("id", viewId);
  if (error) {
    console.error("captionSpaceView failed:", error);
    return { error: "Could not save the caption." };
  }
  // No revalidate: the caption is already on screen.
  void selectionId;
  return undefined;
}

export async function moveSpaceView(
  viewId: string,
  selectionId: string,
  direction: "up" | "down",
): Promise<ActionState> {
  await requireTool("/selections");
  const supabase = await createClient();

  const { data: view, error: viewError } = await supabase
    .from("space_views")
    .select("id, space_id, sort_order")
    .eq("id", viewId)
    .maybeSingle();
  if (viewError) {
    console.error("moveSpaceView read failed:", viewError);
    return { error: "Could not load that image. Try again." };
  }
  if (!view) return { error: "That image no longer exists." };

  const { data: neighbour, error: neighbourError } = await supabase
    .from("space_views")
    .select("id, sort_order")
    .eq("space_id", view.space_id)
    [direction === "up" ? "lt" : "gt"]("sort_order", view.sort_order)
    .order("sort_order", { ascending: direction !== "up" })
    .limit(1)
    .maybeSingle();
  if (neighbourError) {
    console.error("moveSpaceView neighbour read failed:", neighbourError);
    return { error: "Could not reorder. Try again." };
  }

  if (!neighbour) return undefined;

  const results = await Promise.all([
    supabase.from("space_views").update({ sort_order: neighbour.sort_order }).eq("id", view.id),
    supabase.from("space_views").update({ sort_order: view.sort_order }).eq("id", neighbour.id),
  ]);
  const failed = results.find((result) => result.error);
  if (failed?.error) {
    console.error("moveSpaceView failed:", failed.error);
    return { error: "Could not reorder. Try again." };
  }

  revalidatePath("/selections", "layout");
  return undefined;
}

export async function deleteSpaceView(viewId: string): Promise<ActionState> {
  await requireTool("/selections");
  const supabase = await createClient();

  const { data: view, error: viewError } = await supabase
    .from("space_views")
    .select("storage_path")
    .eq("id", viewId)
    .maybeSingle();
  if (viewError) {
    console.error("deleteSpaceView read failed:", viewError);
    return { error: "Could not load that image. Try again." };
  }

  const { error } = await supabase.from("space_views").delete().eq("id", viewId);
  if (error) {
    console.error("deleteSpaceView failed:", error);
    return { error: "Could not remove the image." };
  }

  // Row first, then the object: an orphaned file is invisible, a row pointing at a deleted file is a broken image on a client document.
  if (view?.storage_path) await supabase.storage.from(BUCKET).remove([view.storage_path]);

  revalidatePath("/selections", "layout");
  return undefined;
}
