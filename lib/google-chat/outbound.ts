/**
 * The app's own voice — the one operation the door performs as the Chat
 * app rather than as a person.
 *
 * WHAT IT MAY DO, AND NOTHING ELSE. `GOOGLE_CHAT_SERVICE_ACCOUNT_KEY` is
 * the JSON key of a service account in the Chat app's own Cloud project,
 * asked only for the `chat.bot` scope. It edits one thing: the cards of a
 * message the app itself posted. It never touches the database, never
 * mints a session and never moves a baton — every write stays the
 * person's own, through `act-as.ts` and their own grants, which is what
 * keeps `has_app('/relay')` the permission boundary (SECURITY.md, The
 * Google Chat door).
 *
 * UNSET MEANS OFF. With no key the answer is "off" and the door behaves
 * character for character as it did before round two: the baton still
 * moves, the space is still told, and the pressed card simply stays as it
 * was. Production runs exactly that way until its own Cloud project has
 * its own key, so this file can never be the reason a press fails.
 *
 * IT NEVER THROWS AND IT NEVER SPEAKS. The key, the access token, the
 * card and Google's response body are each either a credential or
 * somebody's message: none of them is ever logged. What a caller gets is
 * one short word for the log line, and the answer Google is waiting for
 * is never delayed by more than REFRESH_TIMEOUT_MS.
 */
import "server-only";

import { fetchAppToken, patchCard } from "./app-token";
import { REFRESH_TIMEOUT_MS, parseServiceAccountKey, tokenIsFresh } from "./outbound-rules";

/**
 * The access token, kept for the hour Google grants it. Module scope, so
 * a warm lambda mints one token and spends it on every press it serves;
 * a cold one pays a single extra round trip. Nothing is persisted — the
 * cache dying with the process is the correct behaviour, not a loss.
 */
let cachedToken: { token: string; expiresAt: number } | null = null;

/** Said once per process, never once per press — a misconfiguration is not news twelve times. */
let warnedAboutKey = false;

/**
 * Rewrite one card the app posted, and say in one word how it went:
 * "off" (no usable key — the refresh is switched off), "done" (Google
 * accepted the new cards), or "failed:<why>" where why is the token
 * error or the HTTP status, with Google's own reason after it when it
 * gave one: `failed:403:PERMISSION_DENIED`.
 *
 * One deadline covers the token exchange and the PATCH together, because
 * what matters is the total the press has to wait, not either call's
 * share of it.
 */
export async function updateCardMessage(messageName: string, cardsV2: unknown[]): Promise<string> {
  const raw = process.env.GOOGLE_CHAT_SERVICE_ACCOUNT_KEY;
  const key = parseServiceAccountKey(raw);
  if (!key) {
    // Unset is a decision (the refresh is off). Set-but-unreadable is a
    // mistake somebody should hear about — once — and it still degrades
    // to exactly the same harmless "off".
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
  // A token Google no longer honours would otherwise jam every refresh
  // until its hour was up; dropping it costs one exchange on the next
  // press, and only ever happens when something is already wrong.
  if (status === 401) cachedToken = null;
  return reason ? `failed:${status}:${reason}` : `failed:${status}`;
}
