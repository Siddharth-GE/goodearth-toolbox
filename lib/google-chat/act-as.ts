import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Acting as the person who typed in chat — the one piece of this door
 * that touches auth, and the only place in the codebase that mints a
 * session for somebody else.
 *
 * THE THREAT MODEL, plainly. This function can act as any employee. It
 * takes an email and a user id, mints a real Supabase session for that
 * account, and hands a caller a database client that IS that person —
 * their grants, their RLS, their name on every row they write. There is
 * no password, no code and no browser in the way. The only things
 * standing between the open internet and that power are two checks that
 * have already run before this function is called:
 *
 *   1. verify.ts proved the request carries a Google-signed ID token for
 *      OUR endpoint, from OUR Workspace's Chat service agent — the
 *      email claim there is load-bearing, because any Google service
 *      account can mint a token for our audience, and without it
 *      anybody with a Google account could reach this;
 *   2. identity.ts turned the email Google itself vouched for into the
 *      one toolbox account that owns it, and refused anyone the toolbox
 *      does not know, has switched off, or has not granted /relay.
 *
 * So this function is called from exactly ONE place — the door
 * (app/api/google-chat/route.ts), after both of those — and it must
 * never grow a second caller. It takes the user id AND the email and
 * refuses to hand back a client whose session belongs to any other
 * account, so a mismatch between what Google said and what Supabase
 * minted stops the write dead rather than acting as the wrong person.
 *
 * What it does NOT do is widen anybody's reach. The minted session is a
 * perfectly ordinary one: `has_app('/relay')` and the 0036 relay guards
 * are still the permission boundary, so chat can do exactly what that
 * person could do at their own keyboard, and no more. The session lives
 * for the milliseconds of one write and is deleted and revoked in a
 * `finally`.
 *
 * Nothing here is ever logged above an error: not the email, not the
 * magic-link token hash, not the access token, not the session id. An
 * error logs a short phrase and the Supabase error's own message.
 */

/** The one thing the door needs to know: did the work run, and what did it give back. */
export type ActAsResult<T> = { ok: true; value: T } | { ok: false };

type Db = SupabaseClient<Database>;

/**
 * The session id GoTrue stamps into the access token, read straight out
 * of the JWT payload. No signature check is needed or wanted: this token
 * came back from Supabase over TLS a moment ago, and the claim is only
 * used to write and then delete a row keyed on it.
 */
function sessionIdOf(accessToken: string): string | null {
  try {
    const payload = accessToken.split(".")[1];
    if (!payload) return null;
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof claims?.session_id === "string" && claims.session_id ? claims.session_id : null;
  } catch {
    return null;
  }
}

/** A plain client that holds nothing: no stored session, no refresh timer, no URL sniffing. */
function anonClient(headers?: Record<string, string>): Db {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      ...(headers ? { global: { headers } } : {}),
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    },
  );
}

/**
 * Run `work` as this person, then throw the session away.
 *
 * Five steps, and the last one always happens:
 *
 *   1. Ask the admin API for a magic link. This sends NO email — the
 *      call returns the link's `hashed_token` directly, which is the
 *      whole reason this technique works from a server with no inbox.
 *   2. Redeem that token on a fresh anon client. One use, consumed
 *      within milliseconds, and the session that comes back is a real
 *      one. Check the account it belongs to is the account we meant.
 *   3. Mark the session verified. Without this row `has_app()` answers
 *      false for it (0063) and every gated read and write is refused —
 *      that row is exactly what stops a session minted around the app
 *      from reaching anything, and this session was minted around the
 *      app, so it has to be marked deliberately.
 *   4. Do the work through a client bound to that access token: RLS
 *      applies, `auth.uid()` is the person, the relay guard stamps their
 *      name on the event.
 *   5. Delete the row and revoke the session, always, whatever happened.
 *
 * Never throws. Anything at all going wrong is `{ ok: false }`, which
 * the door turns into "I couldn't act as you just now."
 */
export async function actAs<T>(
  person: { userId: string; email: string },
  work: (db: Db) => Promise<T>,
): Promise<ActAsResult<T>> {
  if (!person.userId || !person.email) return { ok: false };

  const admin = createAdminClient();
  let accessToken: string | null = null;
  let sessionId: string | null = null;

  try {
    // 1. The link, without the email.
    const { data: link, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: person.email,
    });
    if (linkError || !link?.properties?.hashed_token) {
      console.error("google-chat act-as: could not mint a link", linkError?.message ?? "no token");
      return { ok: false };
    }

    // 2. Redeem it, and check whose session came back.
    const { data: verified, error: verifyError } = await anonClient().auth.verifyOtp({
      type: "magiclink",
      token_hash: link.properties.hashed_token,
    });
    if (verifyError || !verified?.session?.access_token) {
      console.error(
        "google-chat act-as: could not redeem the link",
        verifyError?.message ?? "no session",
      );
      return { ok: false };
    }
    if (verified.session.user?.id !== person.userId) {
      // Never act as the wrong account. If Google's email and Supabase's
      // account have drifted apart, the answer is to do nothing at all.
      console.error("google-chat act-as: minted session is not the person");
      accessToken = verified.session.access_token;
      return { ok: false };
    }
    accessToken = verified.session.access_token;

    // 3. Mark it verified — the same row markSessionVerified writes, and
    // for the same reason. "oauth" is the honest word among the three the
    // 0062 CHECK allows ('otp', 'trusted', 'oauth'): what proved this
    // person was their Google sign-in, exactly as it is on the app's own
    // Google path. No migration is needed — this is an existing value in
    // an existing table, written by the service role as it always is.
    sessionId = sessionIdOf(accessToken);
    if (!sessionId) {
      console.error("google-chat act-as: minted token carries no session");
      return { ok: false };
    }

    const { error: markError } = await admin
      .from("auth_verified_sessions")
      .upsert(
        { session_id: sessionId, user_id: person.userId, method: "oauth" },
        { onConflict: "session_id" },
      );
    if (markError) {
      console.error("google-chat act-as: could not mark the session", markError.message);
      return { ok: false };
    }

    // 4. The work, as them.
    const value = await work(anonClient({ Authorization: `Bearer ${accessToken}` }));
    return { ok: true, value };
  } catch (error) {
    console.error("google-chat act-as: broke", error instanceof Error ? error.message : "unknown");
    return { ok: false };
  } finally {
    // 5. Always, and best effort. A leftover row would let a token that
    // has already been revoked look verified until the 30-day sweep, and
    // a live session nobody holds is a session somebody could steal — so
    // both are cleaned up, separately, and neither is allowed to throw
    // out of this block and swallow the answer above it.
    if (sessionId) {
      try {
        const { error } = await admin
          .from("auth_verified_sessions")
          .delete()
          .eq("session_id", sessionId);
        if (error) console.error("google-chat act-as: session row not cleared", error.message);
      } catch (error) {
        console.error(
          "google-chat act-as: clearing the session row broke",
          error instanceof Error ? error.message : "unknown",
        );
      }
    }
    if (accessToken) {
      try {
        // "local" revokes THIS session and no other. "global" would sign
        // the person out of the toolbox in every browser they have open,
        // every time they pressed a chat button (caught in Fable's review,
        // 2026-09-03).
        const { error } = await admin.auth.admin.signOut(accessToken, "local");
        if (error) console.error("google-chat act-as: session not revoked", error.message);
      } catch (error) {
        console.error(
          "google-chat act-as: revoking the session broke",
          error instanceof Error ? error.message : "unknown",
        );
      }
    }
  }
}
