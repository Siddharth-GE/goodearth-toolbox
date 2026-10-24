/**
 * Many tools' saves end by sending the person to what they made (`redirect()`, which throws). Run
 * from Turing's Save, that throw is the save succeeding, and its address names the new record.
 * Next's own helpers for reading it are internal, so redirects.test.ts pins them on every upgrade.
 */
import { getURLFromRedirectError } from "next/dist/client/components/redirect";
import { isRedirectError } from "next/dist/client/components/redirect-error";

/** Where a thrown redirect was sending the person, or null when it is some other throw. */
export function redirectedTo(thrown: unknown): string | null {
  return isRedirectError(thrown) ? getURLFromRedirectError(thrown) : null;
}

/** The id at the end of a record's address: "/indents/<id>" → "<id>". */
export function idFrom(path: string | null, prefix: string): string | null {
  if (!path?.startsWith(prefix)) return null;
  const id = path.slice(prefix.length).split(/[/?#]/)[0];
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id) ? id : null;
}
