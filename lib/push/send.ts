// Push notifications to people's phones, sent after the response so a failed or slow push never
// holds up or fails the write that caused it. The admin client reads only push_devices, and
// deletes only a phone Firebase says is gone: the sanctioned exception in SECURITY.md. Who is told
// is decided by the caller, from the row it just wrote. Never throws; never logs a token, the key
// or a person's words. Unset FIREBASE_SERVICE_ACCOUNT_KEY means off.
import "server-only";

import { after } from "next/server";

import { fetchAccessToken, isAbort } from "@/lib/google/service-account";
import { parseServiceAccountKey, tokenIsFresh } from "@/lib/google/service-account-rules";
import { createAdminClient } from "@/lib/supabase/admin";

import {
  FCM_SCOPE,
  fcmErrorCode,
  fcmMessage,
  fcmSendUrl,
  isGoneDevice,
  pushRecipients,
  type PushMessage,
} from "./rules";

const SEND_TIMEOUT_MS = 10_000;

// Module scope: a warm lambda reuses the token for its hour. Nothing is persisted.
let cachedToken: { token: string; expiresAt: number } | null = null;

/** Tells these people, once the response has gone. The actor is never told about their own act. */
export function notifyAfter(
  recipientIds: readonly (string | null | undefined)[],
  actorId: string,
  message: PushMessage,
): void {
  const to = pushRecipients(recipientIds, actorId);
  if (to.length === 0 || !process.env.FIREBASE_SERVICE_ACCOUNT_KEY) return;
  after(() => send(to, message));
}

async function send(to: string[], message: PushMessage): Promise<void> {
  try {
    const key = parseServiceAccountKey(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    if (!key?.projectId) {
      console.warn("push: FIREBASE_SERVICE_ACCOUNT_KEY is set but is not a service account key");
      return;
    }

    const admin = createAdminClient();
    const { data: devices, error } = await admin
      .from("push_devices")
      .select("token, profiles!inner(is_active)")
      .in("profile_id", to)
      .eq("profiles.is_active", true);
    if (error) {
      console.error("push: reading phones failed:", error.code);
      return;
    }
    if (devices.length === 0) return;

    const signal = AbortSignal.timeout(SEND_TIMEOUT_MS);
    const now = Math.floor(Date.now() / 1000);
    let token = cachedToken && tokenIsFresh(cachedToken.expiresAt, now) ? cachedToken.token : null;
    if (!token) {
      const minted = await fetchAccessToken(key, FCM_SCOPE, now, signal);
      if ("error" in minted) {
        console.error(`push: ${minted.error}`);
        return;
      }
      cachedToken = minted;
      token = minted.token;
    }

    const bearer = token;
    const url = fcmSendUrl(key.projectId);
    const gone: string[] = [];
    await Promise.all(
      devices.map(async (device) => {
        const status = await sendOne(url, bearer, device.token, message, signal);
        if (status.ok) return;
        if (status.status === 401) cachedToken = null;
        if (isGoneDevice(status.status, status.code)) gone.push(device.token);
        else
          console.error(
            `push: send failed ${status.status}${status.code ? `:${status.code}` : ""}`,
          );
      }),
    );

    if (gone.length > 0) {
      const { error: forgetError } = await admin.from("push_devices").delete().in("token", gone);
      if (forgetError) console.error("push: forgetting gone phones failed:", forgetError.code);
    }
  } catch (error) {
    console.error("push: send failed:", isAbort(error) ? "timeout" : "unexpected");
  }
}

async function sendOne(
  url: string,
  accessToken: string,
  deviceToken: string,
  message: PushMessage,
  signal: AbortSignal,
): Promise<{ ok: boolean; status: number; code: string | null }> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(fcmMessage(deviceToken, message)),
      cache: "no-store",
      signal,
    });
    if (response.ok) return { ok: true, status: response.status, code: null };
    const body: unknown = await response.json().catch(() => null);
    return { ok: false, status: response.status, code: fcmErrorCode(body) };
  } catch (error) {
    return { ok: false, status: 0, code: isAbort(error) ? "timeout" : "network" };
  }
}
