"use server";

// Type-only import, never re-exported from a "use server" file (npm run check:actions).
import type { ActionState } from "@/lib/action-state";
import { requireTool } from "@/lib/auth/access";
import { dbErrorMessage } from "@/lib/db-error";
import { createClient } from "@/lib/supabase/server";
import { checkUpload, extensionFor, storeUpload } from "@/lib/uploads/store";
import { revalidatePath } from "next/cache";
import { GRANT } from "./shared";
import { BILLS_BUCKET } from "./storage";

/** The bill behind an expense line, in the private `birdwing-books` bucket (0116). Upload: object first, then the row (a failed row removes the object). Delete: row first, then the object. */

export async function uploadExpenseFile(
  expenseId: string,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireTool(GRANT);
  const file = checkUpload(formData.get("file"));
  if (typeof file === "string") return { error: file };

  const supabase = await createClient();
  const path = `expenses/${expenseId}/${crypto.randomUUID()}.${extensionFor(file.type)}`;
  const stored = await storeUpload(supabase, BILLS_BUCKET, path, file);
  if (stored) return { error: stored };

  const { error } = await supabase.from("birdwing_expense_files").insert({
    expense_id: expenseId,
    storage_path: path,
    file_name: file.name.slice(0, 200),
    content_type: file.type,
    size_bytes: file.size,
    created_by: user.id,
  });
  if (error) {
    await supabase.storage.from(BILLS_BUCKET).remove([path]);
    console.error("uploadExpenseFile row write failed:", error);
    return { error: dbErrorMessage(error, "Could not save the bill. Try again.") };
  }
  revalidatePath("/birdwing-books", "layout");
  return undefined;
}

export async function deleteExpenseFile(fileId: string): Promise<ActionState> {
  await requireTool(GRANT);
  const supabase = await createClient();
  const { data: file, error: readError } = await supabase
    .from("birdwing_expense_files")
    .select("storage_path")
    .eq("id", fileId)
    .maybeSingle();
  if (readError) {
    console.error("deleteExpenseFile read failed:", readError);
    return { error: "Could not remove the bill. Try again." };
  }
  if (!file) return undefined;
  const { error } = await supabase.from("birdwing_expense_files").delete().eq("id", fileId);
  if (error) {
    console.error("deleteExpenseFile failed:", error);
    return { error: dbErrorMessage(error, "Could not remove the bill. Try again.") };
  }
  const { error: removeError } = await supabase.storage
    .from(BILLS_BUCKET)
    .remove([file.storage_path]);
  if (removeError) console.error("deleteExpenseFile storage cleanup failed:", removeError);
  revalidatePath("/birdwing-books", "layout");
  return undefined;
}
