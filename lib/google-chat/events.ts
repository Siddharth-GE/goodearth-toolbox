/**
 * The shape of what Google posts, and the small pure readers that pull
 * the four facts the door needs out of it: who sent this, where, and
 * which slash command (if any).
 *
 * Add-on-style Chat apps — which is what Google's console registers now
 * — wrap everything in a `chat` payload with one member per kind of
 * interaction, and the same fact can sit in more than one place
 * depending on the interaction. Keeping the digging here leaves
 * route.ts reading as dispatch only, and lets the awkward cases (a bot
 * talking to us, an email that never arrived, a numeric id sent as a
 * string) be pinned by tests instead of discovered in production.
 *
 * This file may import nothing: it is types and string handling.
 */

/**
 * A person (or app) as Google names them. Google's `User` resource
 * documents no email for add-on-style events, and the classic events
 * did carry one for same-Workspace senders — so `email` is optional
 * here on purpose and its absence is a decision the door makes
 * politely, not a crash. `name` is the `users/<id>` resource name,
 * which is what a private reply has to be addressed to.
 */
export type ChatUser = {
  name?: string;
  displayName?: string;
  email?: string;
  type?: "HUMAN" | "BOT" | string;
};

export type ChatMessage = {
  text?: string;
  argumentText?: string;
  slashCommand?: { commandId?: number | string };
  sender?: ChatUser;
};

export type ChatSpace = { name?: string; displayName?: string };

export type ChatEvent = {
  chat?: {
    user?: ChatUser;
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
export const COMMANDS: Record<number, string> = {
  1: "/court",
  2: "/push",
  3: "/bounce",
  4: "/finish",
  5: "/trail",
  6: "/newtrail",
  7: "/link",
};

/** Every place a sender can appear, in the order we trust them. */
function senders(event: ChatEvent): (ChatUser | undefined)[] {
  const chat = event.chat ?? {};
  return [chat.user, chat.messagePayload?.message?.sender, chat.appCommandPayload?.message?.sender];
}

/**
 * The sender's email, normalised for matching — trimmed, lower-cased,
 * and only if it actually looks like an address. Null means "Google
 * didn't tell us who this is", which is a polite refusal, not a bug.
 *
 * A bot sender is null too, and refused before any lookup: an app
 * talking to us is never a person we can act for, whatever address
 * happens to sit elsewhere in the envelope.
 */
export function senderEmail(event: ChatEvent): string | null {
  const candidates = senders(event);
  if (candidates.some((user) => user?.type === "BOT")) return null;

  for (const user of candidates) {
    const email = typeof user?.email === "string" ? user.email.trim().toLowerCase() : "";
    if (email.includes("@")) return email;
  }
  return null;
}

/**
 * The sender's `users/<id>` resource name — what a private reply is
 * addressed to. Null when Google didn't name them, in which case the
 * reply simply goes to the space.
 */
export function senderName(event: ChatEvent): string | null {
  for (const user of senders(event)) {
    const name = typeof user?.name === "string" ? user.name.trim() : "";
    if (name) return name;
  }
  return null;
}

/** The space this event happened in, or "" when the shape has none. */
export function spaceName(event: ChatEvent): string {
  const chat = event.chat ?? {};
  return (
    chat.addedToSpacePayload?.space?.name ??
    chat.messagePayload?.space?.name ??
    chat.appCommandPayload?.space?.name ??
    chat.removedFromSpacePayload?.space?.name ??
    ""
  );
}

/**
 * The slash command id, as a number. A typed command arrives as an
 * appCommandPayload; Google's older shape tags the message itself
 * instead, and either can send the int64 id as a string — so both are
 * read and both are normalised. Null means "no command here".
 */
export function commandId(event: ChatEvent): number | null {
  const chat = event.chat ?? {};
  const raw =
    chat.appCommandPayload?.appCommandMetadata?.appCommandId ??
    chat.messagePayload?.message?.slashCommand?.commandId;
  if (raw === undefined || raw === null || raw === "") return null;
  const id = Number(raw);
  return Number.isFinite(id) ? id : null;
}
