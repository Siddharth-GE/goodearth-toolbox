import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// Bypasses RLS: trusted server code only, for callers with no session (Marathon,
// the Google Chat door, the sanctioned uses in SECURITY.md). Never in the browser.
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
