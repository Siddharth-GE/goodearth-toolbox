import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Exact strings, matched with includes() below — never prefixes. Every
// new unauthenticated route must be listed here or it 302s to /login
// before it can run, an invisible loop during development.
// /reset-password is deliberately absent: it needs the recovery session
// the emailed link mints, so the default redirect is the right answer
// for anyone arriving without one.
const PUBLIC_PATHS = [
  "/login",
  "/login/verify",
  "/forgot-password",
  "/auth/confirm",
  "/auth/callback",
  // Google Chat posts events here directly — there is no browser session
  // to check. The real gate is the Google-signed JWT verified inside the
  // route (lib/google-chat/verify.ts); this entry only stops the login
  // redirect from swallowing the request.
  "/api/google-chat",
  // Vercel's weekly cron calls this to keep the free-tier database from
  // pausing. The real gate is CRON_SECRET, checked inside the route;
  // this entry only stops the login redirect from swallowing the call.
  "/api/keep-alive",
];

/**
 * The request's headers with any client-supplied identity removed.
 *
 * lib/auth/dal.ts trusts x-user-id, so this file is the only thing
 * standing between a forged header and a Server Component believing it.
 * Every path through updateSession must pass through here.
 */
function strippedHeaders(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.delete("x-user-id");
  headers.delete("x-user-email");
  return headers;
}

export async function updateSession(request: NextRequest) {
  // Marathon has no Supabase Auth session at all — it manages its own
  // kiosk PIN login separately (see lib/marathon/session.ts). Skip the
  // Supabase Auth work entirely rather than just allow-listing the path,
  // since there's nothing for it to do here on every kiosk request.
  //
  // The identity headers are still stripped on the way through. Nothing
  // under /marathon reads them today, but "this path skips auth" and
  // "this path forwards whatever the client claimed about its identity"
  // must never be the same statement.
  if (request.nextUrl.pathname.startsWith("/marathon")) {
    return NextResponse.next({ request: { headers: strippedHeaders(request) } });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getClaims verifies the JWT locally against the project's public
  // signing key (ES256, JWKS cached in-process) instead of getUser()'s
  // network round trip to Supabase Auth — which sat on the critical
  // path of every navigation, prefetch and asset request. Expired
  // tokens still refresh through the cookie handlers above, and if the
  // token can't be verified locally supabase-js falls back to the
  // server check itself.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims ?? null;

  // Exact match, not startsWith — a prefix match would make any future
  // /login-adjacent route silently public.
  const path = request.nextUrl.pathname;
  const isPublicPath = PUBLIC_PATHS.includes(path);

  if (!claims && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Deliberately NOT redirecting a claims-holder away from /login.
  //
  // A valid JWT does not mean the app will let you in: lib/auth/dal.ts
  // still turns you away if your profile row is missing or your account
  // has been switched off, and it turns you away by redirecting to
  // /login. Bouncing that back to "/" made the two rules chase each
  // other — an unbounded redirect loop, ending in ERR_TOO_MANY_REDIRECTS
  // with the whole toolbox unreachable. Deactivating a signed-in
  // colleague was enough to trigger it.
  //
  // What we lose: someone already signed in who types /login sees the
  // login page instead of being sent home. That is a fair price, and
  // the page they land on is honest about where they are.

  // Hand the identity we just verified down to Server Components via a
  // request header, so lib/auth/dal.ts doesn't need to re-verify the
  // same token with a second Supabase Auth round trip on every request.
  // Starts from stripped headers and sets only what was actually
  // verified — this is the only place in the app allowed to set it, so
  // nothing a client sends can survive to reach a Server Component.
  const requestHeaders = strippedHeaders(request);
  if (claims) {
    requestHeaders.set("x-user-id", claims.sub);
    requestHeaders.set("x-user-email", typeof claims.email === "string" ? claims.email : "");
  }

  const finalResponse = NextResponse.next({ request: { headers: requestHeaders } });
  response.cookies.getAll().forEach((cookie) => finalResponse.cookies.set(cookie));
  return finalResponse;
}
