import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login"];

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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublicPath = PUBLIC_PATHS.some((p) => path.startsWith(p));

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // Hand the identity we just verified down to Server Components via a
  // request header, so lib/auth/dal.ts doesn't need to re-verify the
  // same token with a second Supabase Auth round trip on every request.
  // Starts from stripped headers and sets only what was actually
  // verified — this is the only place in the app allowed to set it, so
  // nothing a client sends can survive to reach a Server Component.
  const requestHeaders = strippedHeaders(request);
  if (user) {
    requestHeaders.set("x-user-id", user.id);
    requestHeaders.set("x-user-email", user.email ?? "");
  }

  const finalResponse = NextResponse.next({ request: { headers: requestHeaders } });
  response.cookies.getAll().forEach((cookie) => finalResponse.cookies.set(cookie));
  return finalResponse;
}
