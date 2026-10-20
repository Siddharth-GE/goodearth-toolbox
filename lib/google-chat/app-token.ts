// The two network calls behind the app's own voice; signing is lib/google/service-account.ts.
// No `server-only`: scripts run this under tsx, where that import throws. Never throws and never
// logs: the token and Google's body are credentials or somebody's words.
import { fetchAccessToken, isAbort } from "@/lib/google/service-account";
import type { ServiceAccountKey } from "@/lib/google/service-account-rules";

import { CHAT_BOT_SCOPE, patchUrl } from "./outbound-rules";

export function fetchAppToken(
  key: ServiceAccountKey,
  nowSeconds: number,
  signal?: AbortSignal,
): Promise<{ token: string; expiresAt: number } | { error: string }> {
  return fetchAccessToken(key, CHAT_BOT_SCOPE, nowSeconds, signal);
}

// updateMask=cardsV2 leaves the text, sender and privateMessageViewer alone: an update can't
// change who sees a private card. Status 0 means the call never landed.
export async function patchCard(
  token: string,
  messageName: string,
  cardsV2: unknown[],
  signal?: AbortSignal,
): Promise<{ status: number; reason: string | null }> {
  try {
    const response = await fetch(patchUrl(messageName), {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ cardsV2 }),
      cache: "no-store",
      signal,
    });
    if (response.ok) return { status: response.status, reason: null };
    return { status: response.status, reason: await failureReason(response) };
  } catch (error) {
    return { status: 0, reason: isAbort(error) ? "timeout" : "network" };
  }
}

// A body that isn't Google's error shape (a proxy's HTML page) becomes null.
async function failureReason(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { error?: { status?: unknown; message?: unknown } };
    const status = body.error?.status;
    if (typeof status === "string" && status) return status;
    const message = body.error?.message;
    if (typeof message === "string" && message) return message;
    return null;
  } catch {
    return null;
  }
}
