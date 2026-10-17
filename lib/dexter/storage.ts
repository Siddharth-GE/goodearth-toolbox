// Standalone so a "use server" file and a route handler can import it without the other's
// machinery.
export const DEXTER_BUCKET = "dexter";

/** Every deck's objects live under this folder: decks/<deckId>/<relative path>. */
export function deckFolder(deckId: string) {
  return `decks/${deckId}`;
}
