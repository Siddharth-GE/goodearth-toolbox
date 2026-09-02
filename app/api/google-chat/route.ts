import {
  COMMANDS,
  commandId,
  senderName,
  spaceName,
  type ChatEvent,
} from "@/lib/google-chat/events";
import { greeting, identityRefusal } from "@/lib/google-chat/cards";
import { resolveIdentity } from "@/lib/google-chat/identity";
import {
  chatAudience,
  chatServiceAgent,
  getGoogleKeys,
  verifyChatToken,
} from "@/lib/google-chat/verify";

/**
 * The Google Chat door — the app's first unauthenticated POST endpoint.
 *
 * There is no browser session here by design: Google posts events
 * directly. The gate is the Google-signed JWT on every request, verified
 * before the body is read; the proxy's PUBLIC_PATHS entry only stops the
 * login redirect from eating the request first.
 *
 * Phase 3 adds the second trust step: once Google is proven, the person
 * behind the message is mapped to a toolbox account (identity.ts), and
 * anyone the toolbox doesn't know — or doesn't hold /relay for — gets a
 * polite refusal, privately. Still no relay reads or writes; those
 * arrive phase by phase behind these two checks (plan.md at the repo
 * root).
 */

/**
 * An add-on-style synchronous reply: the message rides inside an action
 * envelope, not as bare `{ text }` — Google shows "Relay not responding"
 * if the envelope is missing, even on a 200.
 *
 * Given a sender's `users/<id>` name, the reply is private to them.
 * Everything that is about one person — a refusal, a greeting, later a
 * lookup — goes back privately; only what the whole space should see
 * (the hello on joining, later the action confirmations) goes public.
 */
function card(text: string, privateTo?: string | null) {
  const message: { text: string; privateMessageViewer?: { name: string } } = { text };
  if (privateTo) message.privateMessageViewer = { name: privateTo };
  return Response.json({
    hostAppDataAction: {
      chatDataAction: { createMessageAction: { message } },
    },
  });
}

// The named claims of a refused token, for the server log — enough to
// say WHY the door stayed shut (wrong audience? unknown key? expired?)
// without ever logging the signature that could replay it.
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
  // Two failure regimes, split on proof. Anything that goes wrong BEFORE
  // the token is proven — missing header, bad signature, the project
  // number unset, the certs unreachable — is a 401: the caller has not
  // shown they are Google, and an unproven caller gets no friendliness.
  // Only a failure AFTER proof earns the polite 200 below, because a
  // thrown error there would surface as a raw Google failure message in
  // the space.
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

  try {
    // Only now, with Google proven, is the body read at all.
    const event = (await request.json().catch(() => null)) as ChatEvent | null;
    if (!event) return card("I couldn't read that message. Please try again.");

    // Optional belt-and-braces: when set, only listed spaces get answers.
    // Unset means any space in the Workspace — the Chat app itself is
    // already private to the Goodearth Workspace.
    const chat = event.chat ?? {};
    const allowedSpaces = (process.env.GOOGLE_CHAT_ALLOWED_SPACES ?? "")
      .split(",")
      .map((space) => space.trim())
      .filter(Boolean);
    const spaceId = spaceName(event);

    // One line per event for the Vercel log: which kind arrived, from
    // which space, which command id if any, and which of the six
    // identity decisions was reached — never the message text, and
    // never the email. This is how "did Google dispatch the slash
    // command, and did it know who sent it?" gets answered without
    // guessing from what appears in chat.
    const logEvent = (sender: string | null) =>
      console.log(
        "google-chat event",
        JSON.stringify({
          kind: chat.appCommandPayload
            ? "command"
            : chat.messagePayload
              ? "message"
              : chat.addedToSpacePayload
                ? "added"
                : chat.removedFromSpacePayload
                  ? "removed"
                  : "other",
          space: spaceId,
          commandId: chat.appCommandPayload?.appCommandMetadata?.appCommandId ?? null,
          commandType: chat.appCommandPayload?.appCommandMetadata?.appCommandType ?? null,
          slashCommandInMessage: chat.messagePayload?.message?.slashCommand?.commandId ?? null,
          sender,
        }),
      );

    if (allowedSpaces.length > 0 && !allowedSpaces.includes(spaceId)) {
      logEvent(null);
      return card("This space isn't set up for Relay yet.");
    }

    // Only a person's message or command needs a person behind it.
    // Joining and leaving a space are the space's business, not
    // anybody's, so they never cost a lookup.
    const identity =
      chat.messagePayload || chat.appCommandPayload ? await resolveIdentity(event) : null;
    logEvent(identity?.kind ?? null);

    if (chat.addedToSpacePayload) {
      return card(
        "Hello! I'm the Relay bot. I can't do anything just yet — " +
          "slash commands for trails are on their way.",
      );
    }

    if (identity) {
      // Anyone the toolbox can't act for is told so privately, in one
      // of the five fixed sentences — never anything that says more
      // about who does or doesn't have an account.
      const privateTo = senderName(event);
      if (identity.kind !== "ok") return card(identityRefusal(identity.kind), privateTo);

      // A typed slash command arrives as an appCommandPayload; Google's
      // older shape tags the message itself instead. Answer both the same.
      const id = commandId(event);
      if (chat.appCommandPayload || id !== null) {
        const command = (id !== null && COMMANDS[id]) || "that command";
        return card(greeting(identity.firstName, command), privateTo);
      }
      return card(greeting(identity.firstName, null), privateTo);
    }

    // Removal, and any interaction kind this phase doesn't know:
    // acknowledge with an empty envelope so Google has a well-formed
    // answer.
    return Response.json({});
  } catch (error) {
    console.error("google-chat handler failed", error);
    return card("Something went wrong on our side. Please try again in a moment.");
  }
}
