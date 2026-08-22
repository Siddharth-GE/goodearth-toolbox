/**
 * The `drawings` bucket name, standing alone.
 *
 * Deliberately its own module — not exported from actions.ts (a
 * file-level "use server" module, where a plain string re-export drags
 * the file's whole server-action chunking machinery along for the ride)
 * and not imported from queries.ts (`"server-only"`, which the file
 * serving route.ts could take, but keeping one small neutral module both
 * a "use server" file and a route handler can import cleanly is the
 * simpler rule — the `lib/directory/photo.ts` / `STAFF_PHOTOS_BUCKET`
 * shape).
 */
export const DRAWINGS_BUCKET = "drawings";
