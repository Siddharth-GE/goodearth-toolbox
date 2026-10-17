// The shape of what Google posts and small pure readers over it. Imports nothing. The same fact
// can sit in several places depending on the interaction; the tests pin the awkward cases.

// `email` is optional: Google documents none for add-on-style events. `name` is the
// `users/<id>` a private reply is addressed to.
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
  // Present on the card a button press rides in on, so it can be rewritten.
  name?: string;
};

// `name` is the stable `spaces/<id>` links are stored against (it survives a rename). Google
// marks a DM in two different fields depending on the payload.
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
      // Set only when "Opens a dialog" is ticked on the command.
      isDialogEvent?: boolean;
      dialogEventType?: string;
    };
    // A card button tap, including a dialog's Save (dialogEventType SUBMIT_DIALOG).
    buttonClickedPayload?: {
      message?: ChatMessage;
      space?: ChatSpace;
      isDialogEvent?: boolean;
      dialogEventType?: string;
    };
  };
  // Beside `chat`, not inside it.
  commonEventObject?: {
    formInputs?: Record<string, { stringInputs?: { value?: string[] } }>;
    invokedFunction?: string;
    parameters?: Record<string, string>;
  };
};

// Google sends only the numeric id; this must match the Chat app's configuration.
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

// Null is a polite refusal, not a bug. A bot sender is null too: an app is never a person we can act for.
export function senderEmail(event: ChatEvent): string | null {
  // A bot on the event itself is refused outright.
  if (event.chat?.user?.type === "BOT") return null;

  // Later positions are fallbacks and a bot there is skipped: a press on the bot's OWN card sends
  // that card (sender: the bot) with the person in `chat.user`.
  for (const user of senders(event)) {
    if (user?.type === "BOT") continue;
    const email = typeof user?.email === "string" ? user.email.trim().toLowerCase() : "";
    if (email.includes("@")) return email;
  }
  return null;
}

export function senderName(event: ChatEvent): string | null {
  for (const user of senders(event)) {
    const name = typeof user?.name === "string" ? user.name.trim() : "";
    if (name) return name;
  }
  return null;
}

export function spaceName(event: ChatEvent): string {
  for (const space of spaces(event)) {
    const name = typeof space?.name === "string" ? space.name.trim() : "";
    if (name) return name;
  }
  return "";
}

export function spaceDisplayName(event: ChatEvent): string {
  for (const space of spaces(event)) {
    const name = typeof space?.displayName === "string" ? space.displayName.trim() : "";
    if (name) return name;
  }
  return "";
}

// Google marks a DM as `type: "DM"` or `spaceType: "DIRECT_MESSAGE"` depending on the payload.
export function isDirectMessage(event: ChatEvent): boolean {
  return spaces(event).some(
    (space) => space?.type === "DM" || space?.spaceType === "DIRECT_MESSAGE",
  );
}

// Null also covers a command that arrived without "Opens a dialog" ticked, which the door
// explains rather than guesses at.
export function dialogEventType(
  event: ChatEvent,
): "REQUEST_DIALOG" | "SUBMIT_DIALOG" | "CANCEL_DIALOG" | null {
  const chat = event.chat ?? {};
  const raw = chat.appCommandPayload?.dialogEventType ?? chat.buttonClickedPayload?.dialogEventType;
  if (raw === "REQUEST_DIALOG" || raw === "SUBMIT_DIALOG" || raw === "CANCEL_DIALOG") return raw;
  return null;
}

// Google nests every form value as an array. Blank is never a choice.
export function formValue(event: ChatEvent, name: string): string | null {
  const raw = event.commonEventObject?.formInputs?.[name]?.stringInputs?.value?.[0];
  const value = typeof raw === "string" ? raw.trim() : "";
  return value || null;
}

// A typed command arrives as appCommandPayload, the older shape tags the message; either may
// send the int64 id as a string.
export function commandId(event: ChatEvent): number | null {
  const chat = event.chat ?? {};
  const raw =
    chat.appCommandPayload?.appCommandMetadata?.appCommandId ??
    chat.messagePayload?.message?.slashCommand?.commandId;
  if (raw === undefined || raw === null || raw === "") return null;
  const id = Number(raw);
  return Number.isFinite(id) ? id : null;
}

// Non-string values are dropped, not coerced.
export function buttonParams(event: ChatEvent): Record<string, string> {
  const params = event.commonEventObject?.parameters;
  if (!params) return {};

  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") result[key] = value;
  }
  return result;
}

// Read only from a button click: a slash command's message name is the person's own message, not a card.
export function messageName(event: ChatEvent): string | null {
  const raw = event.chat?.buttonClickedPayload?.message?.name;
  const name = typeof raw === "string" ? raw.trim() : "";
  return /^spaces\/[^/]+\/messages\/[^/]+$/.test(name) ? name : null;
}

// Falls back to the raw `text` minus the leading /word: the older message shape has no argumentText.
export function commandText(event: ChatEvent): string {
  const chat = event.chat ?? {};

  const appArgument = chat.appCommandPayload?.message?.argumentText;
  if (typeof appArgument === "string" && appArgument.trim()) return appArgument.trim();

  const messageArgument = chat.messagePayload?.message?.argumentText;
  if (typeof messageArgument === "string" && messageArgument.trim()) return messageArgument.trim();

  const text = chat.appCommandPayload?.message?.text ?? chat.messagePayload?.message?.text ?? "";
  return text.replace(/^\s*\/\S+\s*/, "").trim();
}
