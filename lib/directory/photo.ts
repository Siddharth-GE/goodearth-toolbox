/**
 * The one spec for a staff photo — the size, the format, the limits.
 *
 * No imports and NOT "server-only", deliberately: this is read by
 * actions.ts (a file-level "use server" module, which may not import a
 * server-only chain), by the route handler that serves the bytes, and by
 * the browser component that resizes before sending. lib/selections has
 * to re-declare its bucket name in two places for want of a file like
 * this one.
 */

export const STAFF_PHOTOS_BUCKET = "staff-photos";

export const staffPhoto = {
  /** Square. A face crops to a square better than it letterboxes into one. */
  size: 512,
  quality: 82,
  contentType: "image/jpeg",
  extension: "jpg",
} as const;

/**
 * The server-side backstop. Server Actions cap the request body at 4mb
 * (next.config.ts), so this is not really a policy choice — anything
 * larger never arrives. The browser resizes to ~40KB before sending; this
 * catches a request that did not come from our UI.
 */
export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

export const ACCEPTED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

/**
 * `people/<profile_id>/<uuid>.jpg`.
 *
 * The SECOND SEGMENT IS LOAD-BEARING: 0061's storage policies read it as
 * `(storage.foldername(name))[2]` to enforce "you upload your own photo"
 * in the database. Change this shape and change those policies in the
 * same migration, or every upload starts failing.
 *
 * The <uuid> means a replacement is a new object, so a stale browser cache
 * can never show the old face.
 */
export function staffPhotoPath(profileId: string, unique: string): string {
  return `people/${profileId}/${unique}.${staffPhoto.extension}`;
}
