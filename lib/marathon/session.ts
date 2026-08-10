import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

// The hashing primitives live in ./pin (pure, tested); re-exported here
// so existing importers keep one place to look for "PIN things".
import { verifyPinHash } from "./pin";
export { hashPin, verifyPinHash } from "./pin";

const COOKIE_NAME = "marathon_session";
const SESSION_TTL_SECONDS = 8 * 60 * 60; // one event-day shift
const COOKIE_PATH = "/marathon";

type AgentSession = { kind: "agent"; agentId: string; exp: number };
type AdminSession = { kind: "admin"; exp: number };
type MarathonSession = AgentSession | AdminSession;

function secret() {
  const value = process.env.MARATHON_SESSION_SECRET;
  if (!value) throw new Error("MARATHON_SESSION_SECRET is not set");
  return value;
}

function sign(payload: MarathonSession) {
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret()).update(payloadB64).digest("base64url");
  return `${payloadB64}.${sig}`;
}

function verify(token: string): MarathonSession | null {
  const [payloadB64, sig] = token.split(".");
  if (!payloadB64 || !sig) return null;

  const expectedSig = createHmac("sha256", secret()).update(payloadB64).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString()) as MarathonSession;
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

async function setSessionCookie(payload: MarathonSession) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, sign(payload), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: COOKIE_PATH,
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function createAgentSession(agentId: string) {
  await setSessionCookie({
    kind: "agent",
    agentId,
    exp: Date.now() + SESSION_TTL_SECONDS * 1000,
  });
}

export async function createAdminSession() {
  await setSessionCookie({ kind: "admin", exp: Date.now() + SESSION_TTL_SECONDS * 1000 });
}

export async function clearMarathonSession() {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, "", { path: COOKIE_PATH, maxAge: 0 });
}

// Cached per request so multiple reads (layout + page + action) don't
// re-verify the cookie repeatedly.
export const getMarathonSession = cache(async (): Promise<MarathonSession | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verify(token);
});

export async function getAgentSession() {
  const session = await getMarathonSession();
  return session?.kind === "agent" ? session : null;
}

export async function getAdminSession() {
  const session = await getMarathonSession();
  return session?.kind === "admin" ? session : null;
}

// Every mutating Server Action must call one of these itself — the page
// that renders a form is a UX convenience, not the security boundary.
export async function requireAgentSession() {
  const session = await getAgentSession();
  if (!session) redirect("/marathon");
  return session;
}

export async function requireAdminSession() {
  const session = await getAdminSession();
  if (!session) redirect("/marathon/admin");
  return session;
}

// PIN hashing ---------------------------------------------------------------

export async function verifyAdminPin(pin: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("marathon_config")
    .select("admin_pin_hash, admin_pin_salt")
    .single();
  if (error) console.error("verifyAdminPin failed:", error);

  if (!data) return false;
  return verifyPinHash(pin, data.admin_pin_hash, data.admin_pin_salt);
}
