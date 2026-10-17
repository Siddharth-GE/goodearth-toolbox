import {
  ANSWER_LIMITS,
  DEXTER_SCRIPT_PATH,
  DEXTER_STATE_PATH,
  parseAnswers,
  readAnswerFields,
} from "@/lib/dexter/answers";
import { DEXTER_CLIENT_SCRIPT } from "@/lib/dexter/client-script";
import {
  canInjectPreviewTags,
  DEFAULT_PREVIEW_BACKGROUND,
  deckBackgroundColor,
  DEXTER_PREVIEW_PATH,
  injectPreviewTags,
  pageTitle,
  PREVIEW_SITE_NAME,
  previewTags,
} from "@/lib/dexter/preview";
import { deckFileHeaders } from "@/lib/dexter/headers";
import { SHARE_TOKEN_PATTERN } from "@/lib/dexter/share";
import { DEXTER_BUCKET, deckFolder } from "@/lib/dexter/storage";
import { contentTypeFor, safeDeckPath } from "@/lib/dexter/unpack";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Dexter's public door: a client with the link and no account opens the
 * deck and saves answers. SECURITY.md, _Dexter's public door_, is the
 * boundary.
 *
 *   /deck/<token>                → 302 to the deck's entry file
 *   /deck/<token>/<file>         → a deck file, sandboxed (lib/dexter/headers.ts)
 *   /deck/<token>/.dexter.js     → our script, from any depth
 *   /deck/<token>/.state         → GET the answers, POST to save
 *   /deck/<token>/.preview.png   → the picture WhatsApp shows for the link
 *
 * No session, so the service-role client, gated by the token alone. Its
 * one write is the deck's own answers row: the deck id comes from the
 * token lookup, never from the request. The sandboxed page has an opaque
 * origin, so only `.state` carries `Access-Control-Allow-Origin: *`;
 * no credential is ever involved. The reserved names start with a dot
 * because uploads drop dot-prefixed paths, so no deck file can shadow them.
 */

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

const PREVIEW_COLOR_PARAM = /^[0-9a-f]{6}$/i;

/**
 * The page with inert preview tags added to the response (the stored file
 * never changes), or its bytes as stored on any failure. Spliced through
 * latin1 so a page in any charset comes back byte for byte.
 */
function withPreview(raw: Buffer, requestUrl: string, token: string): Buffer {
  try {
    if (!canInjectPreviewTags(raw)) return raw;

    const analysed = raw.toString("utf8");
    const background = deckBackgroundColor(analysed) ?? DEFAULT_PREVIEW_BACKGROUND;
    const ownTitle = pageTitle(analysed);
    const title = ownTitle && !ownTitle.includes("�") ? ownTitle : PREVIEW_SITE_NAME;
    const imageUrl =
      `${new URL(requestUrl).origin}/deck/${token}/${DEXTER_PREVIEW_PATH}` +
      `?bg=${background.slice(1)}`;

    return Buffer.from(
      injectPreviewTags(raw.toString("latin1"), previewTags({ title, imageUrl })),
      "latin1",
    );
  } catch (error) {
    console.error(
      "deck viewer: preview tags failed:",
      error instanceof Error ? error.message : "unknown error",
    );
    return raw;
  }
}

/** A missing deck, a switched-off link and a malformed token all answer
 * the same 404, on every verb. */
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
    // Never log the token.
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

  // From any depth, so a page in a subfolder finds it beside itself.
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

  // Loaded lazily, so a deploy that cannot load the generator loses only
  // this picture (BUGCATCHER #15).
  if (relative === DEXTER_PREVIEW_PATH) {
    const requested = new URL(request.url).searchParams.get("bg") ?? "";
    const background = PREVIEW_COLOR_PARAM.test(requested)
      ? `#${requested.toLowerCase()}`
      : DEFAULT_PREVIEW_BACKGROUND;
    try {
      const { renderPreviewImage } = await import("@/lib/dexter/preview-image");
      const image = await renderPreviewImage(background).arrayBuffer();
      return new Response(image, {
        headers: {
          "Content-Type": "image/png",
          "X-Content-Type-Options": "nosniff",
          "X-Robots-Tag": "noindex",
          "Cache-Control": "private, max-age=300",
        },
      });
    } catch (error) {
      console.error(
        "deck viewer: preview image failed:",
        error instanceof Error ? error.message : "unknown error",
      );
      return notFound();
    }
  }

  // No row yet is an unanswered deck, not an error.
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

  // From the extension, never Storage's guess; nosniff holds the browser to it.
  const contentType = contentTypeFor(relative);
  const headers = deckFileHeaders(contentType);

  if (contentType.startsWith("text/html")) {
    const raw = Buffer.from(await object.arrayBuffer());
    return new Response(new Uint8Array(withPreview(raw, request.url, token)), { headers });
  }

  return new Response(object.stream(), { headers });
}

/**
 * The one write, on `.state` only. The body is refused by declared length,
 * actual length, then field by field. `submitted_at` only moves from null
 * to now here; clearing it is a staff action inside Dexter.
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
