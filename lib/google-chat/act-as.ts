import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

// The only place that mints a session for somebody else, so it can act as any employee. Call it
// from the door alone, after verify.ts (Google-signed token from our Chat service agent) and
// identity.ts (a known, active, /relay-granted account). It refuses a client whose session is
// any other id than the one given. The session is ordinary, so has_app('/relay') and the 0036
// guards still bound it. Never log the email, token hash, access token or session id.

export type ActAsResult<T> = { ok: true; value: T } | { ok: false };

type Db = SupabaseClient<Database>;

// No signature check: the token just came back from Supabase over TLS.
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

// Mints a magic link (no email is sent), redeems it, marks the session verified (without that row
// has_app() is false, 0063), runs `work` as them under RLS, then always deletes and revokes.
// Never throws: any failure is { ok: false }.
export async function actAs<T>(
  person: { userId: string; email: string },
  work: (db: Db) => Promise<T>,
): Promise<ActAsResult<T>> {
  if (!person.userId || !person.email) return { ok: false };

  const admin = createAdminClient();
  let accessToken: string | null = null;
  let sessionId: string | null = null;

  try {
    const { data: link, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: person.email,
    });
    if (linkError || !link?.properties?.hashed_token) {
      console.error("google-chat act-as: could not mint a link", linkError?.message ?? "no token");
      return { ok: false };
    }

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
      // Never act as the wrong account.
      console.error("google-chat act-as: minted session is not the person");
      accessToken = verified.session.access_token;
      return { ok: false };
    }
    accessToken = verified.session.access_token;

    // "oauth" is an allowed method (0062 CHECK): their Google sign-in is what proved them.
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

    const value = await work(anonClient({ Authorization: `Bearer ${accessToken}` }));
    return { ok: true, value };
  } catch (error) {
    console.error("google-chat act-as: broke", error instanceof Error ? error.message : "unknown");
    return { ok: false };
  } finally {
    // Best effort and separate, so neither can throw out and swallow the answer. A leftover row
    // would make a revoked token look verified.
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
        // "local" revokes this session only; "global" would sign them out of every browser.
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
