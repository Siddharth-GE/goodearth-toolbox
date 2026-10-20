// The pure half of push notifications (see send.ts): who gets one, what it says, where a tap
// goes, and which phones are gone. Imports nothing, so the browser may use safePushPath too.

export type PushMessage = { title: string; body: string; url: string };

export const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

/** The Android channel every notification rides; the app creates it on first registration. */
export const PUSH_CHANNEL = "toolbox";

export function fcmSendUrl(projectId: string): string {
  return `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`;
}

/** Each person once, never the person who did the thing. */
export function pushRecipients(
  ids: readonly (string | null | undefined)[],
  actorId: string,
): string[] {
  return [...new Set(ids.filter((id): id is string => Boolean(id) && id !== actorId))];
}

/** A tap opens a page on our own site, never another address. */
export function safePushPath(url: unknown): string {
  if (
    typeof url !== "string" ||
    !url.startsWith("/") ||
    url.startsWith("//") ||
    url.includes("\\")
  ) {
    return "/";
  }
  return url;
}

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

export function fcmMessage(token: string, message: PushMessage) {
  return {
    message: {
      token,
      notification: { title: clip(message.title, 80), body: clip(message.body, 200) },
      data: { url: safePushPath(message.url) },
      android: { priority: "HIGH", notification: { channel_id: PUSH_CHANNEL } },
      apns: { payload: { aps: { sound: "default" } } },
    },
  };
}

/** Firebase's own error code from a failed send's body, e.g. "UNREGISTERED"; null if none. */
export function fcmErrorCode(body: unknown): string | null {
  const details = (body as { error?: { details?: unknown } } | null)?.error?.details;
  if (!Array.isArray(details)) return null;
  for (const detail of details) {
    const code = (detail as { errorCode?: unknown } | null)?.errorCode;
    if (typeof code === "string" && code) return code;
  }
  return null;
}

/** Firebase says the phone no longer has the app, or signed the token out: forget it. */
export function isGoneDevice(status: number, errorCode: string | null): boolean {
  return status === 404 || errorCode === "UNREGISTERED";
}
