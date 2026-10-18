import { handleChatRequest } from "@/lib/google-chat/dispatch";
import {
  chatAudience,
  chatServiceAgent,
  getGoogleKeys,
  verifyChatToken,
} from "@/lib/google-chat/verify";

// The Google Chat door, an unauthenticated POST. No browser session by design: the gate is the
// Google-signed JWT, verified before the body is read; the proxy's PUBLIC_PATHS entry only stops
// the login redirect. Everything after proof lives in lib/google-chat/dispatch.ts (a route file
// may export only handlers).

// Named claims of a refused token for the log, never the signature that could replay it.
function tokenSummary(token: string) {
  try {
    const [headerB64, payloadB64] = token.split(".");
    const header = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf8"));
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    return {
      alg: header.alg,
      kid: header.kid,
      iss: payload.iss,
      aud: payload.aud,
      email: payload.email,
      email_verified: payload.email_verified,
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  // A failure before proof is a 401: an unproven caller gets no friendliness. Only a failure after
  // proof earns the polite 200, since a throw there would show Google's raw error in the space.
  let claims;
  let token = "";
  try {
    const authorization = request.headers.get("authorization") ?? "";
    token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
    if (!token) return new Response("Unauthorized", { status: 401 });

    claims = verifyChatToken(
      token,
      await getGoogleKeys(),
      chatAudience(),
      chatServiceAgent(),
      Math.floor(Date.now() / 1000),
    );
  } catch (error) {
    console.error("google-chat verification failed", error);
    return new Response("Unauthorized", { status: 401 });
  }
  if (!claims) {
    console.error("google-chat token refused", tokenSummary(token));
    return new Response("Unauthorized", { status: 401 });
  }

  return handleChatRequest(request);
}
