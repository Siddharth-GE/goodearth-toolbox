import {
  ANSWER_LIMITS,
  DEXTER_SCRIPT_PATH,
  DEXTER_STATE_PATH,
  parseAnswers,
  readAnswerFields,
} from "@/lib/dexter/answers";
import { DEXTER_CLIENT_SCRIPT } from "@/lib/dexter/client-script";
import { SHARE_TOKEN_PATTERN } from "@/lib/dexter/share";
import { DEXTER_BUCKET, deckFolder } from "@/lib/dexter/storage";
import { contentTypeFor, safeDeckPath } from "@/lib/dexter/unpack";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Dexter's public door: serves an uploaded presentation to a client who
 * has the link and no account, and keeps the answers they type into it.
 *
 *   /deck/<token>                → 302 to the deck's entry file
 *   /deck/<token>/index.html     → the page
 *   /deck/<token>/assets/a.css   → an asset, relative to the page
 *   /deck/<token>/.dexter.js     → our script (any depth), never a file
 *   /deck/<token>/.state         → GET the deck's answers, POST to save
 *
 * There is no session here, by design, so this is the one place in a
 * tool that reads AND writes through the service-role client — the reads
 * above, and exactly one write: an upsert of the deck's own
 * `dexter_answers` row, sanctioned in SECURITY.md (_Dexter's public
 * door_). The gate is the token: 22 random base64url characters, checked
 * against the shape before a row is read, and a deck whose sharing is
 * off answers exactly like a token that never existed. The write cannot
 * reach any other row (the deck id comes from the token lookup, never
 * from the request), and its body is capped and validated field by field
 * by `lib/dexter/answers.ts` before anything is stored.
 *
 * The page is UNTRUSTED HTML served from the app's own origin, so every
 * document response carries a CSP `sandbox` WITHOUT `allow-same-origin`:
 * the page runs with an opaque origin — its scripts and relative assets
 * work, but it cannot read cookies, reach localStorage, or make a
 * credentialed request to the toolbox as whoever is viewing it. That
 * word must never be added to the header.
 *
 * The same opaque origin is why `.state` answers with
 * `Access-Control-Allow-Origin: *`: to the browser the sandboxed page is
 * cross-origin to us, and without that header it could not read the
 * reply. `*` is exact rather than generous — it forbids credentials, and
 * no credential is ever involved (the browser sends none from an opaque
 * origin, and the route reads none). Only the `.state` responses carry
 * it; the page and its assets do not.
 *
 * The two reserved names begin with a dot because `planZip` drops every
 * dot-prefixed segment at upload, so no deck can contain a file by
 * either name — there is nothing for ours to shadow.
 */

// `allow-popups-to-escape-sandbox` is there for the "visit our website"
// link a client deck usually carries: without it the new tab inherits
// the sandbox and the site it opens runs with an opaque origin — no
// storage, no sign-in — and looks broken. It changes nothing about what
// the DECK can do: the popup is another origin the deck cannot read, and
// the deck's own document stays sandboxed. `allow-same-origin` is the
// word that must never appear here.
const SANDBOX =
  "sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms allow-modals";

const STATE_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "X-Robots-Tag": "noindex",
};

function notFound() {
  return new Response("Not found", {
    status: 404,
    headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}

function stateJson(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: STATE_HEADERS });
}

type Admin = ReturnType<typeof createAdminClient>;

/**
 * The token's shape, then the one row it names. Both doors (GET and
 * POST) go through here, so a missing deck, a switched-off link and a
 * malformed token are indistinguishable from outside on every verb.
 */
async function lookupDeck(
  admin: Admin,
  token: string,
): Promise<{ deck: { id: string; entry_path: string } } | { response: Response }> {
  if (!SHARE_TOKEN_PATTERN.test(token)) return { response: notFound() };

  const { data: deck, error } = await admin
    .from("dexter_decks")
    .select("id, entry_path, share_enabled")
    .eq("share_token", token)
    .maybeSingle();
  if (error) {
    // The status only — never the token.
    console.error("deck viewer: lookup failed:", error.message);
    return { response: new Response("Something went wrong", { status: 500 }) };
  }
  if (!deck || !deck.share_enabled) return { response: notFound() };
  return { deck: { id: deck.id, entry_path: deck.entry_path } };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string; path?: string[] }> },
) {
  const { token, path } = await params;
  const admin = createAdminClient();
  const found = await lookupDeck(admin, token);
  if ("response" in found) return found.response;
  const { deck } = found;

  if (!path || path.length === 0) {
    return Response.redirect(new URL(`/deck/${token}/${deck.entry_path}`, request.url), 302);
  }

  const relative = safeDeckPath(path);
  if (!relative) return notFound();

  // Our script, from any depth — a page in a subfolder writes the same
  // `src=".dexter.js"` and resolves it beside itself. Not a document, so
  // no sandbox header; cached like an asset, so a fix shows within five
  // minutes on a machine that had the deck open.
  if (relative.split("/").pop() === DEXTER_SCRIPT_PATH) {
    return new Response(DEXTER_CLIENT_SCRIPT, {
      headers: {
        "Content-Type": "text/javascript; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex",
        "Cache-Control": "private, max-age=300",
      },
    });
  }

  // The deck's answers, root only. No row yet reads as empty, not as an
  // error — a fresh deck has simply not been answered.
  if (relative === DEXTER_STATE_PATH) {
    const { data: row, error } = await admin
      .from("dexter_answers")
      .select("fields, submitted_at")
      .eq("deck_id", deck.id)
      .maybeSingle();
    if (error) {
      console.error("deck viewer: answers read failed:", error.message);
      return stateJson({ error: "Something went wrong" }, 500);
    }
    return stateJson({
      fields: readAnswerFields(row?.fields),
      submitted: row?.submitted_at != null,
    });
  }

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

/**
 * The one write. Only `/deck/<token>/.state` answers it; every other
 * path is a 404, the same as a file that does not exist. The body is
 * refused by declared length, then by actual length, then field by
 * field — and `submitted_at` only ever moves from null to now here.
 * Clearing it is a staff action inside Dexter, never something the
 * public side can do.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string; path?: string[] }> },
) {
  const { token, path } = await params;
  if (!path || path.length !== 1 || path[0] !== DEXTER_STATE_PATH) return notFound();

  const tooLarge = stateJson({ error: "Those answers are too large to save." }, 413);
  const declared = Number(request.headers.get("content-length"));
  if (declared > ANSWER_LIMITS.bytes) return tooLarge;

  const admin = createAdminClient();
  const found = await lookupDeck(admin, token);
  if ("response" in found) return found.response;
  const { deck } = found;

  const text = await request.text();
  if (text.length > ANSWER_LIMITS.bytes) return tooLarge;
  const parsed = parseAnswers(text);
  if ("error" in parsed) return stateJson({ error: parsed.error }, 400);

  const { data: existing, error: readError } = await admin
    .from("dexter_answers")
    .select("submitted_at")
    .eq("deck_id", deck.id)
    .maybeSingle();
  if (readError) {
    console.error("deck viewer: answers read failed:", readError.message);
    return stateJson({ error: "Something went wrong" }, 500);
  }

  const now = new Date().toISOString();
  const submittedAt = existing?.submitted_at ?? (parsed.submitted ? now : null);

  const { error: writeError } = await admin
    .from("dexter_answers")
    .upsert(
      { deck_id: deck.id, fields: parsed.fields, submitted_at: submittedAt },
      { onConflict: "deck_id" },
    );
  if (writeError) {
    console.error("deck viewer: answers write failed:", writeError.message);
    return stateJson({ error: "Something went wrong" }, 500);
  }

  return stateJson({ ok: true, savedAt: now });
}
