import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE_OPTIONS } from "./cookie-options";

// Exact strings, never prefixes. An unauthenticated route not listed here 302s to
// /login. /reset-password is absent on purpose: it needs the emailed link's session.
const PUBLIC_PATHS = [
  "/login",
  "/login/verify",
  "/forgot-password",
  "/auth/confirm",
  "/auth/callback",
  // Google Chat: no session; the gate is the signed token checked in the route.
  "/api/google-chat",
  // The weekly keep-alive cron; the gate is CRON_SECRET, checked in the route.
  "/api/keep-alive",
  // The Android app: Chrome, Play and Google's link check fetch these with no session (android/PLAN.md).
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/.well-known/assetlinks.json",
  "/privacy",
];

// THE ONE PREFIX: Dexter's deck viewer must reach every file under its token,
// which no exact list can name. The gate is the token, checked in the route
// (SECURITY.md). A second prefix needs the same argument written down first.
const PUBLIC_PREFIXES = ["/deck/"];

/** Client-supplied identity headers removed. lib/auth/dal.ts trusts x-user-id, so
 * every path through updateSession must pass through here. */
function strippedHeaders(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.delete("x-user-id");
  headers.delete("x-user-email");
  return headers;
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: AUTH_COOKIE_OPTIONS,
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

  // Verified locally against the public key, not a network round trip on every
  // request; expired tokens still refresh through the cookie handlers above.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims ?? null;

  // Exact match, so no /login-adjacent route turns public by accident. The prefix
  // ends in "/", so "/deck" and "/decks-…" are not swept in.
  const path = request.nextUrl.pathname;
  const isPublicPath =
    PUBLIC_PATHS.includes(path) || PUBLIC_PREFIXES.some((prefix) => path.startsWith(prefix));

  if (!claims && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // A claims-holder is NOT sent away from /login: dal.ts sends a switched-off or
  // profile-less account to /login, and bouncing it back loops forever.

  // Hands the verified identity to Server Components, so dal.ts needn't re-verify.
  // Starts from stripped headers: the only place allowed to set it.
  const requestHeaders = strippedHeaders(request);
  if (claims) {
    requestHeaders.set("x-user-id", claims.sub);
    requestHeaders.set("x-user-email", typeof claims.email === "string" ? claims.email : "");
  }

  const finalResponse = NextResponse.next({ request: { headers: requestHeaders } });
  response.cookies.getAll().forEach((cookie) => finalResponse.cookies.set(cookie));
  return finalResponse;
}
