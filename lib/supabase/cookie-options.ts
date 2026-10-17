import type { CookieOptionsWithName } from "@supabase/ssr";

// The session cookies, out of reach of page script: `@supabase/ssr`
// defaults to readable, and no browser client exists to need them.
export const AUTH_COOKIE_OPTIONS: CookieOptionsWithName = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
};
