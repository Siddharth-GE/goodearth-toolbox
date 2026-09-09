import { handleChatRequest } from "@/lib/google-chat/dispatch";
import {
  chatAudience,
  chatServiceAgent,
  getGoogleKeys,
  verifyChatToken,
} from "@/lib/google-chat/verify";

/**
 * The Google Chat door — the app's first unauthenticated POST endpoint.
 *
 * There is no browser session here by design: Google posts events
 * directly. The gate is the Google-signed JWT on every request, verified
 * before the body is read; the proxy's PUBLIC_PATHS entry only stops the
 * login redirect from eating the request first.
 *
 * Phase 3 adds the second trust step: once Google is proven, the person
 * behind the message is mapped to a toolbox account (identity.ts), and
 * anyone the toolbox doesn't know — or doesn't hold /relay for — gets a
 * polite refusal, privately. Still no relay reads or writes; those
 * arrive phase by phase behind these two checks (plan.md at the repo
 * root).
 *
 * Phase 4 teaches a space which villa or project it is for: the bot
 * matches the space's name against the villas and projects when it
 * joins, and /link opens a dialog to set or change that.
 *
 * Phase 5 puts that link to work and answers the two questions that
 * touch nothing: /court ("what is in my hand?") and /trail <words>
 * ("where is that trail?"). Both are private cards built from
 * pusher_chain_state — the same view every relay list reads, so the
 * chat answer and the app's court can never disagree — narrowed to the
 * space's villa or project when there is one, spanning everything in a
 * DM or an unlinked space. /push, /bounce and /finish answer with the
 * same court card.
 *
 * Phases 6 and 7 put buttons on that card and a /newtrail dialog beside
 * it, and with them the door's third trust step. A button press is
 * never written as the app: act-as.ts mints a short-lived real session
 * for the person who pressed it, the write goes through a client bound
 * to that session, and the session is deleted and revoked immediately
 * after. So the relay's own database guard (0036) is still what decides
 * whether the push is allowed, and the event carries the real person's
 * name — chat can do exactly what that person could do at their own
 * keyboard, and nothing more.
 *
 * Phase 7b gives /newtrail a second page: a trail type whose people you
 * pick yourself, or a custom trail whose steps you choose outright. The
 * door remembers nothing between the two pages — what page 1 decided
 * rides back on page 2's Open button — and both roads end in the same
 * single write path, as the person, through the same minted session.
 *
 * Which way an answer goes is the founder's settled rule: a
 * confirmation is the space's business and posts publicly ("Sid pushed
 * … to leg 3"), while a refusal — the guard's own sentence, or "I
 * couldn't act as you just now" — is nobody else's and stays private to
 * whoever pressed the button.
 *
 * What stays in THIS file is the lock, and only the lock: the
 * Google-signed token, verified before a byte of the body is read, and
 * the 401 that answers anyone who cannot show one. Everything after that
 * proof — the log line, identity, every command, every button, every
 * card — lives in lib/google-chat/dispatch.ts, because a Next.js route
 * file may export nothing but its handlers and so nothing could ever
 * call the dispatch anywhere else. Moved out, it can be driven directly
 * by scripts/google-chat-usage-test.ts with Google-shaped events, which
 * is how the whole path gets exercised against staging without a human
 * pressing buttons in a Chat space.
 */

// The named claims of a refused token, for the server log — enough to
// say WHY the door stayed shut (wrong audience? unknown key? expired?)
// without ever logging the signature that could replay it.
function tokenSummary(token: string) {
  try {
    const [headerB64, payloadB64] = token.split(".");
    const header = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf8"));
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    return {
      alg: header.alg,
      kid: header.kid,
      iss: payload.iss,
      aud: payload.aud,
      email: payload.email,
      email_verified: payload.email_verified,
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  // Two failure regimes, split on proof. Anything that goes wrong BEFORE
  // the token is proven — missing header, bad signature, the project
  // number unset, the certs unreachable — is a 401: the caller has not
  // shown they are Google, and an unproven caller gets no friendliness.
  // Only a failure AFTER proof earns the polite 200 below, because a
  // thrown error there would surface as a raw Google failure message in
  // the space.
  let claims;
  let token = "";
  try {
    const authorization = request.headers.get("authorization") ?? "";
    token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
    if (!token) return new Response("Unauthorized", { status: 401 });

    claims = verifyChatToken(
      token,
      await getGoogleKeys(),
      chatAudience(),
      chatServiceAgent(),
      Math.floor(Date.now() / 1000),
    );
  } catch (error) {
    console.error("google-chat verification failed", error);
    return new Response("Unauthorized", { status: 401 });
  }
  if (!claims) {
    console.error("google-chat token refused", tokenSummary(token));
    return new Response("Unauthorized", { status: 401 });
  }

  // Proven. Everything the door actually does is in dispatch.ts.
  return handleChatRequest(request);
}
