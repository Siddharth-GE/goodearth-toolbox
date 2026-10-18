"use server";

import { text } from "@/lib/form-data";
import { revalidatePath } from "next/cache";

// sharp loads LAZILY in the resize branch: a top-level import with a missing native binary would kill every action in this file at load.

import { requireAdmin } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/dal";
import { guardError } from "@/lib/db-error";
import { createClient } from "@/lib/supabase/server";

import { todayInIndia } from "@/lib/format";
import {
  ACCEPTED_PHOTO_TYPES,
  MAX_PHOTO_BYTES,
  STAFF_PHOTOS_BUCKET,
  staffPhoto,
  staffPhotoPath,
} from "./photo";
import {
  normalisePhone,
  validateMyDetails,
  validateName,
  validatePosting,
  type MyDetailsInput,
  type PostingInput,
} from "./people";

// Type-only and not re-exported: a re-export in a "use server" file crashes the chunk (check:actions).
import type { ActionState } from "@/lib/action-state";

/**
 * Two boundaries. A person's own card: requireUser() plus RLS `id = auth.uid()`, no app grant, so losing
 * /directory never locks anyone out of fixing their own phone number. Company-owned data: requireAdmin(),
 * not has_app('/directory') which every account holds. staff_details_guard() (0060 §4) is the real boundary.
 */

/** Layout form: Directory opens on a welcome screen, so an exact path leaves the roster stale. */
function revalidateAll(): void {
  revalidatePath("/directory", "layout");
}

/** Pass the guard's own readable messages through; fall back for anything else. */
const DIRECTORY_GUARD_PHRASES = [
  "Only an admin can",
  "date of birth is in the future",
  "belongs to one account",
] as const;
function friendly(error: { message: string }, fallback: string): ActionState {
  const state = guardError(error, fallback, DIRECTORY_GUARD_PHRASES);
  if (state?.error === fallback) console.error("Directory write failed:", error);
  return state;
}

/** The five fields a person owns. The update is built by hand from exactly those columns, so an action cannot express a wrong write. */
export async function updateMyDetails(input: MyDetailsInput): Promise<ActionState> {
  const user = await requireUser();

  const problem = validateMyDetails(input, todayInIndia());
  if (problem) return { error: problem };

  const supabase = await createClient();
  const { error } = await supabase
    .from("staff_details")
    .update({
      phone: normalisePhone(input.phone),
      date_of_birth: input.dateOfBirth || null,
      blood_group: input.bloodGroup || null,
      emergency_contact_name: input.emergencyContactName?.trim() || null,
      emergency_contact_phone: normalisePhone(input.emergencyContactPhone),
      updated_by: user.id,
    })
    .eq("id", user.id);

  if (error) return friendly(error, "Could not save your details. Try again.");

  revalidateAll();
  return undefined;
}

/** A person correcting their own name: profiles.full_name, signed-in row only, via the "users can update their own name" policy (0001). A SHARED table write, noted in STATUS.md's contract row. */
export async function updateMyName(name: string): Promise<ActionState> {
  const user = await requireUser();

  const problem = validateName(name);
  if (problem) return { error: problem };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: name.trim() })
    .eq("id", user.id);

  if (error) return friendly(error, "Could not save your name. Try again.");

  revalidateAll();
  return undefined;
}

/** The person's own photo. The browser already resized to 512x512 JPEG (a camera photo exceeds the 4mb action cap), but this re-normalises: an action is a public endpoint. */
export async function uploadMyPhoto(formData: FormData): Promise<ActionState> {
  const user = await requireUser();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a photo." };
  if (file.size > MAX_PHOTO_BYTES) {
    return { error: "That photo is too large. Take a smaller one and try again." };
  }
  if (!ACCEPTED_PHOTO_TYPES.includes(file.type)) {
    return { error: "Upload a JPG, PNG, WebP or AVIF." };
  }

  let normalised: Buffer;
  try {
    const { default: sharp } = await import("sharp");
    normalised = await sharp(Buffer.from(await file.arrayBuffer()))
      // cover, not contain: a face may lose its corners; letterboxing looks wrong on a card.
      .resize(staffPhoto.size, staffPhoto.size, { fit: "cover" })
      .jpeg({ quality: staffPhoto.quality })
      .toBuffer();
  } catch (error) {
    console.error("uploadMyPhoto resize failed:", error);
    return { error: "That file could not be read as a photo." };
  }

  const supabase = await createClient();

  // The bucket and policies come from 0061; creating one needs privileges a user lacks.
  const path = staffPhotoPath(user.id, crypto.randomUUID());

  // A Blob, NOT the raw Buffer: supabase-js builds multipart only for a Blob, and a Buffer through Next's
  // patched fetch came back text-decoded (a 40KB JPEG became 124KB of EF BF BD) with no error anywhere.
  // lib/selections/views-actions.ts still passes a raw Buffer and has the same latent bug.
  const blob = new Blob([new Uint8Array(normalised)], { type: staffPhoto.contentType });

  const { error: uploadError } = await supabase.storage
    .from(STAFF_PHOTOS_BUCKET)
    .upload(path, blob, { contentType: staffPhoto.contentType });
  if (uploadError) {
    console.error("uploadMyPhoto upload failed:", uploadError);
    return { error: "Could not save the photo. Try again." };
  }

  // Confirm the size that landed: silent binary corruption is permanent and shows up months later as a broken image.
  const folder = path.slice(0, path.lastIndexOf("/"));
  const filename = path.slice(path.lastIndexOf("/") + 1);
  const { data: stored, error: listError } = await supabase.storage
    .from(STAFF_PHOTOS_BUCKET)
    .list(folder, { search: filename });
  // The check is a safeguard; the upload itself succeeded, so carry on unverified.
  if (listError) console.error("uploadMyPhoto size check failed:", listError);
  const storedSize = stored?.[0]?.metadata?.size as number | undefined;

  if (storedSize !== undefined && storedSize !== normalised.length) {
    const { error: removeError } = await supabase.storage.from(STAFF_PHOTOS_BUCKET).remove([path]);
    if (removeError) console.error("uploadMyPhoto cleanup failed:", removeError);
    console.error(
      `uploadMyPhoto stored ${storedSize} bytes but sent ${normalised.length} — binary was mangled in transit`,
    );
    return { error: "The photo did not save correctly. Try again." };
  }

  // Read the old path BEFORE overwriting so the previous object can be cleaned up.
  const { data: existing, error: existingError } = await supabase
    .from("staff_details")
    .select("photo_path")
    .eq("id", user.id)
    .maybeSingle();
  // Only the old file's cleanup depends on this, so a failed read leaves an orphan, not wrong data.
  if (existingError) console.error("uploadMyPhoto old photo read failed:", existingError);

  const { error } = await supabase
    .from("staff_details")
    .update({ photo_path: path, updated_by: user.id })
    .eq("id", user.id);

  if (error) {
    // Object first, then row: a failed row write leaves an invisible orphan, not a card pointing at nothing.
    const { error: removeError } = await supabase.storage.from(STAFF_PHOTOS_BUCKET).remove([path]);
    if (removeError) console.error("uploadMyPhoto cleanup failed:", removeError);
    console.error("uploadMyPhoto row write failed:", error);
    return { error: "Could not save the photo. Try again." };
  }

  if (existing?.photo_path && existing.photo_path !== path) {
    const { error: removeError } = await supabase.storage
      .from(STAFF_PHOTOS_BUCKET)
      .remove([existing.photo_path]);
    if (removeError) console.error("uploadMyPhoto old photo removal failed:", removeError);
  }

  revalidateAll();
  return undefined;
}

/** Row first, then the object: the reverse of upload. */
export async function removeMyPhoto(): Promise<ActionState> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data: existing, error: readError } = await supabase
    .from("staff_details")
    .select("photo_path")
    .eq("id", user.id)
    .maybeSingle();
  if (readError) return friendly(readError, "Could not remove the photo. Try again.");
  if (!existing?.photo_path) return undefined;

  const { error } = await supabase
    .from("staff_details")
    .update({ photo_path: null, updated_by: user.id })
    .eq("id", user.id);
  if (error) return friendly(error, "Could not remove the photo. Try again.");

  const { error: removeError } = await supabase.storage
    .from(STAFF_PHOTOS_BUCKET)
    .remove([existing.photo_path]);
  if (removeError) console.error("removeMyPhoto file removal failed:", removeError);

  revalidateAll();
  return undefined;
}

export async function updateStaffPosting(input: PostingInput): Promise<ActionState> {
  const user = await requireUser();
  await requireAdmin(user);

  const problem = validatePosting(input, todayInIndia());
  if (problem) return { error: problem };

  const supabase = await createClient();
  const { error } = await supabase
    .from("staff_details")
    .update({
      department_id: input.departmentId || null,
      designation: input.designation?.trim() || null,
      reports_to_id: input.reportsToId || null,
      joined_on: input.joinedOn || null,
      updated_by: user.id,
    })
    .eq("id", input.personId);

  if (error) return friendly(error, "Could not save. Try again.");

  revalidateAll();
  return undefined;
}

export async function createDepartment(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  await requireAdmin(user);

  const name = text(formData, "name");
  if (!name) return { error: "Give the department a name." };
  if (name.length > 40) return { error: "Keep the name under 40 characters." };

  const supabase = await createClient();

  // Sort order runs in tens so one can be slotted between two.
  const { data: last, error: readError } = await supabase
    .from("staff_departments")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (readError) return friendly(readError, "Could not add the department. Try again.");

  const { error } = await supabase.from("staff_departments").insert({
    name,
    sort_order: (last?.sort_order ?? 0) + 10,
    created_by: user.id,
    updated_by: user.id,
  });

  // The unique index is on lower(name), so "design" collides with "Design".
  if (error?.code === "23505") return { error: `There is already a department called ${name}.` };
  if (error) return friendly(error, "Could not add the department. Try again.");

  revalidateAll();
  return undefined;
}

export async function renameDepartment(departmentId: string, name: string): Promise<ActionState> {
  const user = await requireUser();
  await requireAdmin(user);

  const trimmed = name.trim();
  if (!trimmed) return { error: "The name can't be blank." };
  if (trimmed.length > 40) return { error: "Keep the name under 40 characters." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("staff_departments")
    .update({ name: trimmed, updated_by: user.id })
    .eq("id", departmentId);

  if (error?.code === "23505") return { error: `There is already a department called ${trimmed}.` };
  if (error) return friendly(error, "Could not rename the department. Try again.");

  revalidateAll();
  return undefined;
}

/** Switched off, never deleted: leavers sit in a department on past records, and the table has no delete policy. */
export async function setDepartmentActive(
  departmentId: string,
  isActive: boolean,
): Promise<ActionState> {
  const user = await requireUser();
  await requireAdmin(user);

  const supabase = await createClient();
  const { error } = await supabase
    .from("staff_departments")
    .update({ is_active: isActive, updated_by: user.id })
    .eq("id", departmentId);

  if (error) return friendly(error, "Could not change the department. Try again.");

  revalidateAll();
  return undefined;
}
