import { getGoogleKeys, projectNumber, verifyChatToken } from "@/lib/google-chat/verify";

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
 * check (google-chat-plan.md).
 */

// What Phase 1 needs from an event, nothing more.
type ChatEvent = {
  type?: string;
  space?: { name?: string; displayName?: string };
  message?: { text?: string; argumentText?: string };
};

function card(text: string) {
  return Response.json({ text });
}

export async function POST(request: Request) {
  try {
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
    if (!token) return new Response("Unauthorized", { status: 401 });

    const claims = verifyChatToken(
      token,
      await getGoogleKeys(),
      projectNumber(),
      Math.floor(Date.now() / 1000),
    );
    if (!claims) return new Response("Unauthorized", { status: 401 });

    // Only now, with Google proven, is the body read at all.
    const event = (await request.json().catch(() => null)) as ChatEvent | null;
    if (!event) return card("I couldn't read that message. Please try again.");

    // Optional belt-and-braces: when set, only listed spaces get answers.
    // Unset means any space in the Workspace — the Chat app itself is
    // already private to the Goodearth Workspace.
    const allowedSpaces = (process.env.GOOGLE_CHAT_ALLOWED_SPACES ?? "")
      .split(",")
      .map((space) => space.trim())
      .filter(Boolean);
    const spaceId = event.space?.name ?? "";
    if (allowedSpaces.length > 0 && !allowedSpaces.includes(spaceId)) {
      return card("This space isn't set up for Relay yet.");
    }

    switch (event.type) {
      case "ADDED_TO_SPACE":
        return card(
          "Hello! I'm the Relay bot. I can't do anything just yet — " +
            "slash commands for trails are on their way.",
        );
      case "MESSAGE": {
        const text = (event.message?.text ?? "").trim();
        const command = text.startsWith("/") ? text.split(/\s+/)[0] : null;
        return card(
          command
            ? `I heard ${command} — that command isn't wired up yet, but it's coming. ` +
                "For now, the Relay tool in the toolbox is the place."
            : "Hello! Slash commands are on their way — nothing to run just yet.",
        );
      }
      case "REMOVED_FROM_SPACE":
        return new Response(null, { status: 200 });
      default:
        return new Response(null, { status: 200 });
    }
  } catch (error) {
    // A thrown error would surface as a raw Google failure message in
    // the space. Answer 200 with plain English instead, and leave the
    // real story in the Vercel logs.
    console.error("google-chat handler failed", error);
    return card("Something went wrong on our side. Please try again in a moment.");
  }
}
