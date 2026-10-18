"use server";

// Platform actions shared by every tool; a tool's own go in lib/<tool>/actions.ts.

import { createClient } from "@/lib/supabase/server";

/**
 * Files what the error screen showed (0066), since platform logs age out within
 * hours. Silent on purpose: it runs when something already broke, so its own
 * failure must never cost the person their error screen. The 0066 policy pins
 * `actor` to the caller.
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
      // From a client component: text of unknown length.
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
