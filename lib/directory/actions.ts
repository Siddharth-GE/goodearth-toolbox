"use server";

import { revalidatePath } from "next/cache";

// sharp loads LAZILY inside the resize branch — a top-level import means
// a missing native binary on the deployed runtime kills every action in
// this file at load, name edits included (the 2026-08-22 staging lesson).

import { requireAdmin } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

import { todayInIndia } from "./birthdays";
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

// Type-only import, and deliberately NOT re-exported. A bare
// `export type { X }` in a "use server" file crashes every action in its
// compiled chunk at load time — it caused a production outage once, and
// `npm run check:actions` is the gate that keeps it from happening twice.
import type { ActionState } from "@/lib/action-state";

/**
 * Writes for the Directory.
 *
 * Two boundaries, and they are different from each other:
 *   * The person's own card — requireUser() only, plus RLS's
 *     `id = auth.uid()`. No app grant: losing /directory must never lock
 *     somebody out of correcting their own phone number.
 *   * Everything company-owned — requireAdmin(). NOT has_app('/directory'),
 *     because every account in the company holds that, which makes it
 *     `true` with extra steps.
 *
 * staff_details_guard() (0060 §4) is the real boundary under both. These
 * checks are the courtesy that produces a redirect instead of a raised
 * exception.
 *
 * Actions return ActionState and never throw, so a form renders the
 * message inline.
 */

/**
 * The layout form, not the exact path. Directory opens on a welcome
 * screen and the real screens sit one click in, so an exact-path call
 * would refresh the welcome and leave the roster stale.
 */
function revalidateAll(): void {
  revalidatePath("/directory", "layout");
}

/**
 * The guard's own messages were written for a person to read ("Only an
 * admin can change a department, designation, reporting line or joining
 * date"). Surface those intact; fall back for anything else.
 */
function friendly(error: { message: string }, fallback: string): ActionState {
  const message = error.message;
  if (
    message.includes("Only an admin can") ||
    message.includes("date of birth is in the future") ||
    message.includes("belongs to one account")
  ) {
    return { error: message.replace(/^.*?:\s*/, "") };
  }
  console.error("Directory write failed:", error);
  return { error: fallback };
}

// ---------------------------------------------------------------------
// The person's own card
// ---------------------------------------------------------------------

/**
 * The five fields a person owns.
 *
 * The update object is BUILT BY HAND from exactly those five columns. It
 * never mentions department_id, designation, reports_to_id or joined_on,
 * even if a caller passed them — the guard would refuse such a write, but
 * an action that cannot express the wrong one is better than an action the
 * database has to stop.
 */
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

/**
 * Somebody correcting the spelling of their own name.
 *
 * Writes profiles.full_name for the signed-in row only, through the
 * "users can update their own name" policy that has existed since 0001
 * and which nothing had ever used. The whole company's names arrived by
 * hand from a spreadsheet, so the alternative was routing every typo
 * through one admin.
 *
 * This is Directory writing a SHARED table, recorded in STATUS.md's
 * contract row. It is the person's own row and one column.
 */
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

/**
 * The person's own photo.
 *
 * The browser already resized to 512×512 JPEG (~40KB) before this was
 * called — that is not an optimisation, it is what makes upload work from
 * a phone at all, since a camera photo is 3-8MB and the Server Action
 * body cap is 4mb. This re-normalises anyway: an action is a public
 * endpoint and nothing a browser sends can be trusted to already be the
 * right shape.
 */
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
      // `cover`, not `contain`. A face may lose its corners and that is
      // fine; letterboxing a portrait onto white looks wrong on a card.
      .resize(staffPhoto.size, staffPhoto.size, { fit: "cover" })
      .jpeg({ quality: staffPhoto.quality })
      .toBuffer();
  } catch (error) {
    console.error("uploadMyPhoto resize failed:", error);
    return { error: "That file could not be read as a photo." };
  }

  const supabase = await createClient();

  // The bucket and its policies come from 0061, not from here — creating
  // one needs privileges an ordinary signed-in user does not have.
  const path = staffPhotoPath(user.id, crypto.randomUUID());

  // A BLOB, NOT THE RAW Buffer, AND THIS IS NOT STYLE.
  //
  // supabase-js only builds a multipart body when it is handed a Blob;
  // anything else is passed to fetch as a raw body. Next patches global
  // fetch, and a Node Buffer going through that patched path came back
  // TEXT-DECODED: the first upload this app ever made stored a JPEG whose
  // every non-UTF-8 byte had become EF BF BD, inflating 40KB to 124KB.
  // Storage still reported it as image/jpeg, the row wrote fine, and the
  // only symptom was a broken image — nothing errored anywhere.
  //
  // The Blob path is multipart, which every fetch implementation treats
  // as binary. lib/selections/views-actions.ts still passes a raw Buffer
  // and has the same latent bug — it has simply never had an
  // upload in production to prove it.
  const blob = new Blob([new Uint8Array(normalised)], { type: staffPhoto.contentType });

  const { error: uploadError } = await supabase.storage
    .from(STAFF_PHOTOS_BUCKET)
    .upload(path, blob, { contentType: staffPhoto.contentType });
  if (uploadError) {
    console.error("uploadMyPhoto upload failed:", uploadError);
    return { error: "Could not save the photo. Try again." };
  }

  // Confirm what landed is what was sent. A silent binary corruption is
  // permanent and invisible — it shows up as a broken image months later,
  // with nothing in any log. Comparing sizes catches exactly that, for the
  // cost of one small request on a rare action.
  const folder = path.slice(0, path.lastIndexOf("/"));
  const filename = path.slice(path.lastIndexOf("/") + 1);
  const { data: stored } = await supabase.storage
    .from(STAFF_PHOTOS_BUCKET)
    .list(folder, { search: filename });
  const storedSize = stored?.[0]?.metadata?.size as number | undefined;

  if (storedSize !== undefined && storedSize !== normalised.length) {
    await supabase.storage.from(STAFF_PHOTOS_BUCKET).remove([path]);
    console.error(
      `uploadMyPhoto stored ${storedSize} bytes but sent ${normalised.length} — binary was mangled in transit`,
    );
    return { error: "The photo did not save correctly. Try again." };
  }

  // Read the old path BEFORE overwriting it, so the previous object can
  // be cleaned up rather than orphaned.
  const { data: existing } = await supabase
    .from("staff_details")
    .select("photo_path")
    .eq("id", user.id)
    .maybeSingle();

  const { error } = await supabase
    .from("staff_details")
    .update({ photo_path: path, updated_by: user.id })
    .eq("id", user.id);

  if (error) {
    // Object first, then row — so a failed row write leaves an invisible
    // orphan rather than a card pointing at nothing.
    await supabase.storage.from(STAFF_PHOTOS_BUCKET).remove([path]);
    console.error("uploadMyPhoto row write failed:", error);
    return { error: "Could not save the photo. Try again." };
  }

  if (existing?.photo_path && existing.photo_path !== path) {
    await supabase.storage.from(STAFF_PHOTOS_BUCKET).remove([existing.photo_path]);
  }

  revalidateAll();
  return undefined;
}

/** Row first, then the object — the reverse of upload, same reasoning. */
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

  await supabase.storage.from(STAFF_PHOTOS_BUCKET).remove([existing.photo_path]);

  revalidateAll();
  return undefined;
}

// ---------------------------------------------------------------------
// The company's four columns — admin only
// ---------------------------------------------------------------------

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

// ---------------------------------------------------------------------
// Departments — admin only
// ---------------------------------------------------------------------

export async function createDepartment(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  await requireAdmin(user);

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Give the department a name." };
  if (name.length > 40) return { error: "Keep the name under 40 characters." };

  const supabase = await createClient();

  // Sort order runs in tens so a later one can be slotted between two
  // without renumbering the list.
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

  // The unique index is on lower(name), so "design" collides with
  // "Design" — which is the point, and worth saying plainly.
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

/**
 * Switched off, never deleted — somebody who has left still sits in a
 * department on every past record, and there is no delete policy on the
 * table to make the other choice available.
 */
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
