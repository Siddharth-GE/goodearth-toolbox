import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";
import type { Database } from "./database.types";

/**
 * One client per request. Every gated query and action calls this, and a
 * page rendering six of them used to build six clients — each re-reading
 * the cookie jar and re-creating the fetch wrapper. `cache()` memoises
 * the promise for the life of the request the same way getCurrentUser
 * in lib/auth/dal.ts is memoised, and is a no-op outside a request
 * (scripts never import this file).
 */
export const createClient = cache(async () => {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component; ignored because proxy.ts
            // refreshes the session on every request.
          }
        },
      },
    },
  );
});
