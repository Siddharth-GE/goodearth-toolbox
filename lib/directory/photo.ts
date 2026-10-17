/** The one spec for a staff photo. No imports and NOT "server-only": read by actions.ts (a "use server" module), the route handler and the browser resizer. */

export const STAFF_PHOTOS_BUCKET = "staff-photos";

export const staffPhoto = {
  size: 512,
  quality: 82,
  contentType: "image/jpeg",
  extension: "jpg",
} as const;

/** Server-side backstop: Server Actions cap the body at 4mb (next.config.ts); the browser resizes to ~40KB, this catches requests not from our UI. */
export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

export const ACCEPTED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

/**
 * `people/<profile_id>/<uuid>.jpg`. The SECOND SEGMENT IS LOAD-BEARING: 0061's storage policies read it as
 * `(storage.foldername(name))[2]`; change the shape and the policies together. The uuid makes a replacement a new object.
 */
export function staffPhotoPath(profileId: string, unique: string): string {
  return `people/${profileId}/${unique}.${staffPhoto.extension}`;
}
