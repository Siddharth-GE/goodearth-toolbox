import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login"];

export async function updateSession(request: NextRequest) {
  // Marathon has no Supabase Auth session at all — it manages its own
  // kiosk PIN login separately (see lib/marathon/session.ts). Skip the
  // Supabase Auth work entirely rather than just allow-listing the path,
  // since there's nothing for it to do here on every kiosk request.
  if (request.nextUrl.pathname.startsWith("/marathon")) {
    return NextResponse.next();
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
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
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
  // Rebuilt from request.headers (not mutated in place) and always
  // explicitly set-or-deleted here, right before continuing — this is
  // the only place in the app allowed to set it, so nothing a client
  // sends through can survive to reach a Server Component.
  const requestHeaders = new Headers(request.headers);
  if (user) {
    requestHeaders.set("x-user-id", user.id);
    requestHeaders.set("x-user-email", user.email ?? "");
  } else {
    requestHeaders.delete("x-user-id");
    requestHeaders.delete("x-user-email");
  }

  const finalResponse = NextResponse.next({ request: { headers: requestHeaders } });
  response.cookies.getAll().forEach((cookie) => finalResponse.cookies.set(cookie));
  return finalResponse;
}
