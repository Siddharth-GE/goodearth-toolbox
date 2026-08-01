"use server";

import { requireApp } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/dal";
import { designView } from "@/lib/pdf/theme";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import sharp from "sharp";

// Re-declared rather than imported from views.ts, which is "server-only":
// importing a value from it into this file-level "use server" module drags
// the server-only chain into the client bundle (see CLAUDE.md).
const BUCKET = "design-views";

// Server Actions cap the request body at 1MB by default (raised to 4mb in
// next.config.ts for headroom), so this is not a policy choice — anything
// larger never arrives. The browser normalises to ~300KB before sending;
// this is the backstop for a request that didn't come from our UI.
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "image/avif"];

export type ViewActionState = { error?: string } | undefined;

async function authorize() {
  const user = await requireUser();
  await requireApp(user, "/selections");
  return user;
}

/**
 * Uploads a design view for a space.
 *
 * Every image is normalised to the single spec in lib/pdf/theme.ts —
 * 16:9, letterboxed on white rather than cropped, JPEG because
 * @react-pdf/renderer cannot embed WebP. Normalising on the way in rather
 * than at render time means a document is never a ragged mix of shapes,
 * and the PDF generator never has to think about it.
 */
export async function uploadSpaceView(
  spaceId: string,
  selectionId: string,
  formData: FormData,
): Promise<ViewActionState> {
  const user = await authorize();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image to upload." };
  if (file.size > MAX_UPLOAD_BYTES) {
    return { error: "That image is too large to upload. Export it at a smaller size and try again." };
  }
  if (!ACCEPTED.includes(file.type)) {
    return { error: "Upload a JPG, PNG, WebP or AVIF." };
  }

  const caption = String(formData.get("caption") ?? "").trim() || null;

  let normalised: Buffer;
  try {
    normalised = await sharp(Buffer.from(await file.arrayBuffer()))
      // `contain` keeps the whole drawing and pads to 16:9. `cover` would
      // give the same consistency while quietly cropping a corner off an
      // elevation, which is the worse failure.
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

  const { data: buckets } = await supabase.storage.listBuckets();
  if (!buckets?.some((bucket) => bucket.name === BUCKET)) {
    // Private, unlike the public `catalogue` bucket: these are a specific
    // client's design work, not vendor product photos.
    const { error } = await supabase.storage.createBucket(BUCKET, {
      public: false,
      fileSizeLimit: "10MB",
      allowedMimeTypes: [designView.contentType],
    });
    if (error) {
      console.error("uploadSpaceView bucket failed:", error);
      return { error: "Could not prepare storage. Try again." };
    }
  }

  const path = `spaces/${spaceId}/${crypto.randomUUID()}.${designView.extension}`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, normalised, { contentType: designView.contentType });
  if (uploadError) {
    console.error("uploadSpaceView upload failed:", uploadError);
    return { error: "Could not upload the image. Try again." };
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
    // The object is already in storage; leaving it orphaned is better
    // than leaving a row pointing at nothing.
    await supabase.storage.from(BUCKET).remove([path]);
    console.error("uploadSpaceView insert failed:", error);
    return { error: "Could not save the image. Try again." };
  }

  revalidatePath(`/selections/${selectionId}`);
  return undefined;
}

export async function captionSpaceView(
  viewId: string,
  selectionId: string,
  caption: string,
): Promise<ViewActionState> {
  await authorize();
  const supabase = await createClient();

  const { error } = await supabase
    .from("space_views")
    .update({ caption: caption.trim() || null })
    .eq("id", viewId);
  if (error) {
    console.error("captionSpaceView failed:", error);
    return { error: "Could not save the caption." };
  }
  // No revalidate: the caption is already on screen and nothing else
  // derives from it.
  void selectionId;
  return undefined;
}

/** Swaps a view with its neighbour — enough ordering for a handful of images. */
export async function moveSpaceView(
  viewId: string,
  selectionId: string,
  direction: "up" | "down",
): Promise<ViewActionState> {
  await authorize();
  const supabase = await createClient();

  const { data: view } = await supabase
    .from("space_views")
    .select("id, space_id, sort_order")
    .eq("id", viewId)
    .single();
  if (!view) return { error: "That image no longer exists." };

  const { data: neighbour } = await supabase
    .from("space_views")
    .select("id, sort_order")
    .eq("space_id", view.space_id)
    [direction === "up" ? "lt" : "gt"]("sort_order", view.sort_order)
    .order("sort_order", { ascending: direction !== "up" })
    .limit(1)
    .maybeSingle();

  // Already at the end — not an error, just nothing to do.
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

  revalidatePath(`/selections/${selectionId}`);
  return undefined;
}

export async function deleteSpaceView(
  viewId: string,
  selectionId: string,
): Promise<ViewActionState> {
  await authorize();
  const supabase = await createClient();

  const { data: view } = await supabase
    .from("space_views")
    .select("storage_path")
    .eq("id", viewId)
    .single();

  const { error } = await supabase.from("space_views").delete().eq("id", viewId);
  if (error) {
    console.error("deleteSpaceView failed:", error);
    return { error: "Could not remove the image." };
  }

  // Row first, then the object: an orphaned file is invisible, whereas a
  // row pointing at a deleted file is a broken image on a client document.
  if (view?.storage_path) await supabase.storage.from(BUCKET).remove([view.storage_path]);

  revalidatePath(`/selections/${selectionId}`);
  return undefined;
}
