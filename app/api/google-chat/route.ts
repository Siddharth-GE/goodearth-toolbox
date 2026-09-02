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
 * Phase 1 is the locked door and a friendly stub — no identity mapping,
 * no relay reads or writes. Those arrive phase by phase behind this
 * check (plan.md at the repo root).
 */

// What Phase 1 needs from an event, nothing more. Add-on-style Chat
// apps (which is what Google's console registers now) wrap everything
// in a `chat` payload — one member per kind of interaction.
type ChatMessage = {
  text?: string;
  argumentText?: string;
  slashCommand?: { commandId?: number | string };
};
type ChatSpace = { name?: string; displayName?: string };
type ChatEvent = {
  chat?: {
    addedToSpacePayload?: { space?: ChatSpace };
    removedFromSpacePayload?: { space?: ChatSpace };
    messagePayload?: { message?: ChatMessage; space?: ChatSpace };
    appCommandPayload?: {
      // Google documents the id as an int64, which arrives as a string.
      appCommandMetadata?: { appCommandId?: number | string; appCommandType?: string };
      message?: ChatMessage;
      space?: ChatSpace;
    };
  };
};

// The slash commands as declared in the Chat app's configuration —
// Google sends only the numeric id, so the id → name map lives here and
// must match that form.
const COMMANDS: Record<number, string> = {
  1: "/court",
  2: "/push",
  3: "/bounce",
  4: "/finish",
  5: "/trail",
  6: "/newtrail",
  7: "/link",
};

// An add-on-style synchronous reply: the message rides inside an action
// envelope, not as bare `{ text }` — Google shows "Relay not responding"
// if the envelope is missing, even on a 200.
function card(text: string) {
  return Response.json({
    hostAppDataAction: {
      chatDataAction: { createMessageAction: { message: { text } } },
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
    const spaceId =
      chat.addedToSpacePayload?.space?.name ??
      chat.messagePayload?.space?.name ??
      chat.appCommandPayload?.space?.name ??
      chat.removedFromSpacePayload?.space?.name ??
      "";

    // One line per event for the Vercel log: which kind arrived, from
    // which space, and which command id if any — never the message text.
    // This is how "did Google dispatch the slash command?" gets answered
    // without guessing from what appears in chat.
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
      }),
    );
    if (allowedSpaces.length > 0 && !allowedSpaces.includes(spaceId)) {
      return card("This space isn't set up for Relay yet.");
    }

    if (chat.addedToSpacePayload) {
      return card(
        "Hello! I'm the Relay bot. I can't do anything just yet — " +
          "slash commands for trails are on their way.",
      );
    }
    // A typed slash command arrives as an appCommandPayload; Google's
    // older shape tags the message itself instead. Answer both the same.
    const commandId =
      chat.appCommandPayload?.appCommandMetadata?.appCommandId ??
      chat.messagePayload?.message?.slashCommand?.commandId;
    if (chat.appCommandPayload || commandId !== undefined) {
      const command = (commandId !== undefined && COMMANDS[Number(commandId)]) || "that command";
      return card(
        `I heard ${command} — it isn't wired up yet, but it's coming. ` +
          "For now, the Relay tool in the toolbox is the place.",
      );
    }
    if (chat.messagePayload) {
      return card("Hello! Slash commands are on their way — nothing to run just yet.");
    }
    // Removal, and any interaction kind Phase 1 doesn't know: acknowledge
    // with an empty envelope so Google has a well-formed answer.
    return Response.json({});
  } catch (error) {
    console.error("google-chat handler failed", error);
    return card("Something went wrong on our side. Please try again in a moment.");
  }
}
