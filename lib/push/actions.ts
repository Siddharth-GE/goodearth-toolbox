"use server";

import { getCurrentUser } from "@/lib/auth/dal";
import { createClient } from "@/lib/supabase/server";

// Type-only and never re-exported (`npm run check:actions`).
import type { ActionState } from "@/lib/action-state";

/**
 * The phone app records its push address for whoever is signed in; every signed-in person may
 * have notifications, so there is no tool to require. claim_push_device() (0130) checks the
 * session and moves a shared phone to its current user.
 */
export async function registerPushDevice(token: string, platform: string): Promise<ActionState> {
  if (!(await getCurrentUser())) return { error: "Sign in to get notifications." };
  if (typeof token !== "string" || token.length < 20 || token.length > 4096) {
    return { error: "This phone's notification address is not valid." };
  }
  if (platform !== "android" && platform !== "ios") {
    return { error: "Notifications work only in the phone app." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("claim_push_device", {
    p_token: token,
    p_platform: platform,
  });
  if (error) {
    console.error("registerPushDevice failed:", error.code);
    return { error: "Could not turn on notifications for this phone." };
  }
  return undefined;
}
