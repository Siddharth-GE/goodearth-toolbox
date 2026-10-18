// `allow-popups-to-escape-sandbox` lets a deck's "visit our website" link
// open a normal tab; the deck itself stays sandboxed. `allow-same-origin`
// would hand an uploaded deck the viewer's session — it must never appear.
export const DECK_SANDBOX =
  "sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms allow-modals";

/**
 * Headers for a file served from a deck. Every response carries the
 * sandbox, whatever its type: browsers apply it only to documents, so
 * assets are unaffected, and a type nobody listed is fenced too
 * (BUGCATCHER #21).
 */
export function deckFileHeaders(contentType: string): Record<string, string> {
  return {
    "Content-Type": contentType,
    "Content-Security-Policy": DECK_SANDBOX,
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex",
    "Referrer-Policy": "no-referrer",
    // Private only: switching a link off must take effect at the next open.
    "Cache-Control": "private, max-age=300",
  };
}
