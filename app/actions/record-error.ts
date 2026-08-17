"use server";

// app/actions/ is for platform-level concerns shared by every tool —
// the same reasoning as app/actions/auth.ts. A tool's own actions belong
// in lib/<tool>/actions.ts.

import { createClient } from "@/lib/supabase/server";

/**
 * Files what the error screen actually was (0066).
 *
 * Called from app/(dashboard)/error.tsx when it renders. Until this
 * existed, an error screen left no trace we could still read the next
 * morning: Vercel's function logs age out and Supabase keeps about an
 * hour of edge logs, which is how the 16 Aug 2026 Operations failures
 * came down to reconstructing the cause from a single surviving log line.
 *
 * Deliberately NOT an ActionState and deliberately silent. This runs at
 * the moment something has already gone wrong; if filing the record also
 * fails, the user must still get their error screen and their "Try
 * again" button. So every failure here is swallowed after a console
 * line, and nothing is awaited on the render path.
 *
 * `actor` is left to the caller's own id — the 0066 policy refuses a row
 * filed against anybody else.
 */
export async function recordAppError(input: {
  digest?: string;
  path?: string;
  message?: string;
}): Promise<void> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase.from("app_errors").insert({
      // Trimmed rather than trusted: these arrive from a client
      // component, so treat them as text of unknown length.
      digest: input.digest?.slice(0, 200) ?? null,
      path: input.path?.slice(0, 500) ?? null,
      message: input.message?.slice(0, 2000) ?? null,
      actor: user?.id ?? null,
    });
    if (error) console.error("recordAppError insert failed:", error);
  } catch (thrown) {
    console.error("recordAppError failed:", thrown);
  }
}
