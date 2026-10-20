// The pure half of the app's own voice (see outbound.ts): every deciding branch is testable here.
// The key and token rules are shared, in lib/google/service-account-rules.ts. Imports nothing.

/** The one scope the app credential is ever asked for — nothing writes to the database with it. */
export const CHAT_BOT_SCOPE = "https://www.googleapis.com/auth/chat.bot";

export function patchUrl(messageName: string): string {
  return `https://chat.googleapis.com/v1/${messageName}?updateMask=cardsV2`;
}

// The press has a 30s budget; the refresh gets five.
export const REFRESH_TIMEOUT_MS = 5000;
