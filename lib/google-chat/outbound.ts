// The one operation the door performs as the Chat app, not a person: rewrite the cards of a
// message the app posted. The service-account key is asked only for chat.bot; it never touches
// the database or moves a baton, so has_app('/relay') stays the boundary (SECURITY.md). An unset
// key means off and the press behaves as before. Never throws; never logs the key, token, card or
// Google's body; waits at most REFRESH_TIMEOUT_MS.
import "server-only";

import { parseServiceAccountKey, tokenIsFresh } from "@/lib/google/service-account-rules";

import { fetchAppToken, patchCard } from "./app-token";
import { REFRESH_TIMEOUT_MS } from "./outbound-rules";

// Module scope: a warm lambda reuses the token for its hour. Nothing is persisted.
let cachedToken: { token: string; expiresAt: number } | null = null;

let warnedAboutKey = false;

// Returns "off", "done" or "failed:<token error or status>[:<Google reason>]". One deadline covers
// token and PATCH together: the total wait is what matters.
export async function updateCardMessage(messageName: string, cardsV2: unknown[]): Promise<string> {
  const raw = process.env.GOOGLE_CHAT_SERVICE_ACCOUNT_KEY;
  const key = parseServiceAccountKey(raw);
  if (!key) {
    // Unset is a decision; set-but-unreadable is a mistake worth one warning.
    if (typeof raw === "string" && raw.trim() && !warnedAboutKey) {
      warnedAboutKey = true;
      console.warn(
        "google-chat: GOOGLE_CHAT_SERVICE_ACCOUNT_KEY is set but is not a service account key",
      );
    }
    return "off";
  }

  const signal = AbortSignal.timeout(REFRESH_TIMEOUT_MS);
  const now = Math.floor(Date.now() / 1000);

  let token = cachedToken && tokenIsFresh(cachedToken.expiresAt, now) ? cachedToken.token : null;
  if (!token) {
    const minted = await fetchAppToken(key, now, signal);
    if ("error" in minted) return `failed:${minted.error}`;
    cachedToken = minted;
    token = minted.token;
  }

  const { status, reason } = await patchCard(token, messageName, cardsV2, signal);
  if (status >= 200 && status < 300) return "done";
  // Drop a token Google no longer honours, or every refresh would fail until its hour ends.
  if (status === 401) cachedToken = null;
  return reason ? `failed:${status}:${reason}` : `failed:${status}`;
}
