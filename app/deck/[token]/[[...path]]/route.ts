import { SHARE_TOKEN_PATTERN } from "@/lib/dexter/share";
import { DEXTER_BUCKET, deckFolder } from "@/lib/dexter/storage";
import { contentTypeFor, safeDeckPath } from "@/lib/dexter/unpack";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Dexter's public door: serves an uploaded presentation to a client who
 * has the link and no account.
 *
 *   /deck/<token>                → 302 to the deck's entry file
 *   /deck/<token>/index.html     → the page
 *   /deck/<token>/assets/a.css   → an asset, relative to the page
 *
 * There is no session here, by design, so this is the one place in a
 * tool that reads through the service-role client — two reads, never a
 * write, sanctioned in SECURITY.md (_Dexter's public door_). The gate is
 * the token: 22 random base64url characters, checked against the shape
 * before a row is read, and a deck whose sharing is off answers exactly
 * like a token that never existed.
 *
 * The page is UNTRUSTED HTML served from the app's own origin, so every
 * document response carries a CSP `sandbox` WITHOUT `allow-same-origin`:
 * the page runs with an opaque origin — its scripts and relative assets
 * work, but it cannot read cookies, reach localStorage, or make a
 * credentialed request to the toolbox as whoever is viewing it. That
 * word must never be added to the header.
 */

const SANDBOX = "sandbox allow-scripts allow-popups allow-forms allow-modals";

function notFound() {
  return new Response("Not found", {
    status: 404,
    headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string; path?: string[] }> },
) {
  const { token, path } = await params;
  if (!SHARE_TOKEN_PATTERN.test(token)) return notFound();

  const admin = createAdminClient();
  const { data: deck, error } = await admin
    .from("dexter_decks")
    .select("id, entry_path, share_enabled")
    .eq("share_token", token)
    .maybeSingle();
  if (error) {
    // The status only — never the token.
    console.error("deck viewer: lookup failed:", error.message);
    return new Response("Something went wrong", { status: 500 });
  }
  if (!deck || !deck.share_enabled) return notFound();

  if (!path || path.length === 0) {
    return Response.redirect(new URL(`/deck/${token}/${deck.entry_path}`, request.url), 302);
  }

  const relative = safeDeckPath(path);
  if (!relative) return notFound();

  const { data: object, error: downloadError } = await admin.storage
    .from(DEXTER_BUCKET)
    .download(`${deckFolder(deck.id)}/${relative}`);
  if (downloadError || !object) return notFound();

  // From the extension, never from Storage's guess — the bucket has no
  // MIME list, and nosniff below makes the browser take our word for it.
  const contentType = contentTypeFor(relative);
  const headers = new Headers({
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex",
    "Referrer-Policy": "no-referrer",
    // The browser may keep it briefly; no shared cache may — switching a
    // link off must take effect at the next open, not in an hour.
    "Cache-Control": "private, max-age=300",
  });
  // A document that can run script gets the sandbox: HTML, and SVG
  // opened on its own (an <img> ignores scripts anyway).
  if (contentType.startsWith("text/html") || contentType === "image/svg+xml") {
    headers.set("Content-Security-Policy", SANDBOX);
  }

  return new Response(object.stream(), { headers });
}
