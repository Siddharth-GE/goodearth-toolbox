/**
 * The `dexter` bucket name, standing alone — the lib/design-management/
 * storage.ts shape: a neutral module both a "use server" file and a route
 * handler can import without dragging either's machinery along.
 */
export const DEXTER_BUCKET = "dexter";

/** Every deck's objects live under this folder: decks/<deckId>/<relative path>. */
export function deckFolder(deckId: string) {
  return `decks/${deckId}`;
}
