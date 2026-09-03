/**
 * The shape of what Google posts, and the small pure readers that pull
 * the facts the door needs out of it: who sent this, in which space,
 * which slash command (if any), and — since Phase 4 — whether a dialog
 * is being asked for, submitted or cancelled, and what was picked in
 * it.
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

/**
 * A space as Google names it. `name` is the stable `spaces/<id>` — the
 * thing a link is stored against, because it survives a rename;
 * `displayName` is what people see and what the bot matches on when it
 * joins. Google marks a one-to-one chat in two different fields
 * depending on the payload, so both are read.
 */
export type ChatSpace = {
  name?: string;
  displayName?: string;
  type?: "ROOM" | "DM" | string;
  spaceType?: "SPACE" | "GROUP_CHAT" | "DIRECT_MESSAGE" | string;
};

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
      // Only set when "Opens a dialog" is ticked on that command in the
      // Chat app's configuration; without the tick the command arrives
      // as an ordinary one and a dialog answer goes nowhere.
      isDialogEvent?: boolean;
      dialogEventType?: string;
    };
    // A tap on a card button — including the Save button of a dialog,
    // which arrives here with dialogEventType "SUBMIT_DIALOG".
    buttonClickedPayload?: {
      message?: ChatMessage;
      space?: ChatSpace;
      isDialogEvent?: boolean;
      dialogEventType?: string;
    };
  };
  // What the person typed into a card's inputs, plus which button they
  // pressed. Google puts this beside `chat`, not inside it.
  commonEventObject?: {
    formInputs?: Record<string, { stringInputs?: { value?: string[] } }>;
    invokedFunction?: string;
    parameters?: Record<string, string>;
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
  return [
    chat.user,
    chat.messagePayload?.message?.sender,
    chat.appCommandPayload?.message?.sender,
    chat.buttonClickedPayload?.message?.sender,
  ];
}

/** Every place the space can appear, in the order we trust them. */
function spaces(event: ChatEvent): (ChatSpace | undefined)[] {
  const chat = event.chat ?? {};
  return [
    chat.addedToSpacePayload?.space,
    chat.messagePayload?.space,
    chat.appCommandPayload?.space,
    chat.buttonClickedPayload?.space,
    chat.removedFromSpacePayload?.space,
  ];
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
  for (const space of spaces(event)) {
    const name = typeof space?.name === "string" ? space.name.trim() : "";
    if (name) return name;
  }
  return "";
}

/**
 * The space's human name — what the bot matches against villa and
 * project names when it joins. "" when Google sent none, which simply
 * means nothing to match on.
 */
export function spaceDisplayName(event: ChatEvent): string {
  for (const space of spaces(event)) {
    const name = typeof space?.displayName === "string" ? space.displayName.trim() : "";
    if (name) return name;
  }
  return "";
}

/**
 * Is this a one-to-one chat with the bot? A DM is never linked to a
 * villa — commands there already span everything — so this is the first
 * question both joining and /link ask. Google marks it as `type: "DM"`
 * on some payloads and `spaceType: "DIRECT_MESSAGE"` on others, so
 * either field counts.
 */
export function isDirectMessage(event: ChatEvent): boolean {
  return spaces(event).some(
    (space) => space?.type === "DM" || space?.spaceType === "DIRECT_MESSAGE",
  );
}

/**
 * Which step of a dialog this is, if any: Google asks for the dialog
 * (REQUEST_DIALOG), sends the filled-in form (SUBMIT_DIALOG), or says
 * the person walked away (CANCEL_DIALOG). Null means this event has
 * nothing to do with a dialog — including a /link that arrived without
 * "Opens a dialog" ticked in the console, which is a misconfiguration
 * the door explains rather than a shape it guesses at.
 */
export function dialogEventType(
  event: ChatEvent,
): "REQUEST_DIALOG" | "SUBMIT_DIALOG" | "CANCEL_DIALOG" | null {
  const chat = event.chat ?? {};
  const raw = chat.appCommandPayload?.dialogEventType ?? chat.buttonClickedPayload?.dialogEventType;
  if (raw === "REQUEST_DIALOG" || raw === "SUBMIT_DIALOG" || raw === "CANCEL_DIALOG") return raw;
  return null;
}

/**
 * One value the person picked or typed in a card, by input name. Google
 * nests every form value as an array of strings however single the
 * input is. Null when the input is absent or blank — an empty string is
 * never a choice.
 */
export function formValue(event: ChatEvent, name: string): string | null {
  const raw = event.commonEventObject?.formInputs?.[name]?.stringInputs?.value?.[0];
  const value = typeof raw === "string" ? raw.trim() : "";
  return value || null;
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

/**
 * The words typed after a slash command — "villa 12" out of "/trail
 * villa 12". Google's own `argumentText` is what it is meant for, and is
 * read from wherever the command arrived; a command posted through the
 * older message shape carries no `argumentText` at all, so the message's
 * raw `text` is the last resort, with the leading `/word` cut off by
 * hand. Trimmed; "" when there is nothing after the command.
 */
export function commandText(event: ChatEvent): string {
  const chat = event.chat ?? {};

  const appArgument = chat.appCommandPayload?.message?.argumentText;
  if (typeof appArgument === "string" && appArgument.trim()) return appArgument.trim();

  const messageArgument = chat.messagePayload?.message?.argumentText;
  if (typeof messageArgument === "string" && messageArgument.trim()) return messageArgument.trim();

  const text = chat.appCommandPayload?.message?.text ?? chat.messagePayload?.message?.text ?? "";
  return text.replace(/^\s*\/\S+\s*/, "").trim();
}
