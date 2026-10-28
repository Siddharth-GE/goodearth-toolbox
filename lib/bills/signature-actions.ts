"use server";

// Type-only import, not re-exported from a "use server" file (npm run check:actions).
import type { ActionState } from "@/lib/action-state";
import { requireAdmin, requireTool } from "@/lib/auth/access";
import { optionalText, text } from "@/lib/form-data";
import { idParam } from "@/lib/list-params";
import { createClient } from "@/lib/supabase/server";
import { storeUpload } from "@/lib/uploads/store";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import {
  MAX_SIGNATURE_BYTES,
  SIGNATURE_TYPES,
  SIGNATURES_BUCKET,
  SIGNER_SLOTS,
  signaturePath,
} from "./signatures";

// ADMIN ONLY: 0168's policies check is_admin() on every write and each action checks first.

async function admin() {
  const user = await requireTool("/bills");
  await requireAdmin(user);
  return user;
}

const refresh = () => revalidatePath("/bills", "layout");

export async function saveBillSigners(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await admin();
  const row: Record<string, string | null> = {};
  for (const slot of SIGNER_SLOTS) {
    const raw = optionalText(formData, slot.column);
    if (raw && !idParam(raw)) return { error: `Choose a person for ${slot.label}.` };
    row[slot.column] = raw;
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("bill_signers")
    .update({ ...row, updated_by: user.id })
    .eq("id", true);
  if (error) {
    console.error("saveBillSigners failed:", error);
    return { error: "Could not save who signs. Try again." };
  }
  refresh();
  return undefined;
}

/** A replacement is a new object; the old one goes only once the new one is on record. */
export async function uploadSignature(formData: FormData): Promise<ActionState> {
  const user = await admin();
  const userId = idParam(text(formData, "user_id"));
  if (!userId) return { error: "Choose whose signature this is." };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a picture to upload." };
  if (!SIGNATURE_TYPES.includes(file.type))
    return { error: "Upload the signature as a PNG or JPG picture." };
  if (file.size > MAX_SIGNATURE_BYTES)
    return { error: "That picture is too large — the limit is 1 MB." };

  const supabase = await createClient();
  const { data: before, error: beforeError } = await supabase
    .from("bill_signatures")
    .select("path")
    .eq("user_id", userId)
    .maybeSingle();
  if (beforeError) {
    console.error("uploadSignature read failed:", beforeError);
    return { error: "Could not save the signature. Try again." };
  }

  const path = signaturePath(userId, randomUUID(), file.type);
  const stored = await storeUpload(supabase, SIGNATURES_BUCKET, path, file);
  if (stored) return { error: stored };

  const { error } = await supabase
    .from("bill_signatures")
    .upsert({ user_id: userId, path, updated_by: user.id }, { onConflict: "user_id" });
  if (error) {
    console.error("uploadSignature record failed:", error);
    const { error: removeError } = await supabase.storage.from(SIGNATURES_BUCKET).remove([path]);
    if (removeError) console.error(`uploadSignature could not remove ${path}:`, removeError);
    return { error: "Could not save the signature. Try again." };
  }
  if (before?.path) {
    const { error: removeError } = await supabase.storage
      .from(SIGNATURES_BUCKET)
      .remove([before.path]);
    if (removeError) console.error(`uploadSignature could not remove ${before.path}:`, removeError);
  }
  refresh();
  return undefined;
}

export async function removeSignature(userId: string): Promise<ActionState> {
  await admin();
  if (!idParam(userId)) return { error: "That signature is not on record." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bill_signatures")
    .delete()
    .eq("user_id", userId)
    .select("path");
  if (error) {
    console.error("removeSignature failed:", error);
    return { error: "Could not remove the signature. Try again." };
  }
  const paths = (data ?? []).map((row) => row.path);
  if (paths.length > 0) {
    const { error: removeError } = await supabase.storage.from(SIGNATURES_BUCKET).remove(paths);
    if (removeError) console.error("removeSignature could not remove the picture:", removeError);
  }
  refresh();
  return undefined;
}
