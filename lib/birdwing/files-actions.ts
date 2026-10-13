"use server";

// Type-only import, never re-exported from a "use server" file — the
// 2026-08-03 outage rule, enforced by npm run check:actions.
import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { dbErrorMessage } from "@/lib/db-error";
import { createClient } from "@/lib/supabase/server";
import { checkUpload, extensionFor, storeUpload } from "@/lib/uploads/store";
import { revalidatePath } from "next/cache";
import { FILE_KINDS, GRANT, oneOf } from "./shared";
import { STAYS_BUCKET } from "./storage";

/**
 * A stay's documents — a photo of the guest's ID, a booking confirmation
 * — in the private `birdwing-stays` bucket (0115). Object first, then the
 * row; a failed row write removes the object, so nothing ever points at a
 * missing file. Deleting goes the other way: row first, then the object.
 */

export async function uploadStayFile(stayId: string, formData: FormData): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const file = checkUpload(formData.get("file"));
  if (typeof file === "string") return { error: file };
  const kind = oneOf(FILE_KINDS, formData.get("kind")) ?? "other";

  const supabase = await createClient();
  const path = `stays/${stayId}/${crypto.randomUUID()}.${extensionFor(file.type)}`;
  const stored = await storeUpload(supabase, STAYS_BUCKET, path, file);
  if (stored) return { error: stored };

  const { error } = await supabase.from("birdwing_stay_files").insert({
    stay_id: stayId,
    kind,
    storage_path: path,
    file_name: file.name.slice(0, 200),
    content_type: file.type,
    size_bytes: file.size,
    created_by: user.id,
  });
  if (error) {
    await supabase.storage.from(STAYS_BUCKET).remove([path]);
    console.error("uploadStayFile row write failed:", error);
    return { error: dbErrorMessage(error, "Could not save the file. Try again.") };
  }

  revalidatePath("/birdwing", "layout");
  return undefined;
}

export async function deleteStayFile(fileId: string): Promise<ActionState> {
  await requireTool(GRANT);
  const supabase = await createClient();
  const { data: file, error: readError } = await supabase
    .from("birdwing_stay_files")
    .select("storage_path")
    .eq("id", fileId)
    .maybeSingle();
  if (readError) {
    console.error("deleteStayFile read failed:", readError);
    return { error: "Could not remove the file. Try again." };
  }
  if (!file) return undefined;

  const { error } = await supabase.from("birdwing_stay_files").delete().eq("id", fileId);
  if (error) {
    console.error("deleteStayFile failed:", error);
    return { error: dbErrorMessage(error, "Could not remove the file. Try again.") };
  }
  const { error: removeError } = await supabase.storage
    .from(STAYS_BUCKET)
    .remove([file.storage_path]);
  if (removeError) console.error("deleteStayFile storage cleanup failed:", removeError);

  revalidatePath("/birdwing", "layout");
  return undefined;
}
