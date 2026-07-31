import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// Bypasses Row Level Security entirely — only ever call this from trusted
// server code (Server Actions, Server Components). Never expose the
// service role key to the browser. Used by Marathon, which has no
// Supabase Auth session to scope RLS policies to.
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
