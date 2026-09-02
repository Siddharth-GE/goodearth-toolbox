/**
 * The bot's fixed sentences — words only, no I/O. Every refusal the door
 * can send back is pinned here verbatim from the Phase 3 decision table,
 * so the door never improvises a sentence and never says more about who
 * exists in the system than these five lines allow. The greeting is the
 * one line an `ok` identity gets instead.
 *
 * Em-dashes are fine in these replies — the em-dash trap from Phase 2 was
 * Google's command *description* field in the console, not chat text.
 *
 * Phase 4 grows this file with the space-linking sentences and the /link
 * dialog card — the dialog is built here too, as a plain object that the
 * door wraps in Google's `pushCard`/navigation envelope.
 */

export type RefusalKind = "no-email" | "unknown" | "inactive" | "no-relay" | "failed";

const REFUSALS: Record<RefusalKind, string> = {
  "no-email":
    "Google didn't tell me who you are, so I can't act for you. Ask an admin to check the Relay bot.",
  unknown:
    "I don't know you yet: there's no toolbox account for this email. Ask an admin in Settings.",
  inactive:
    "Your toolbox account is switched off, so I can't act for you. Ask an admin in Settings.",
  "no-relay": "You don't have the Relay tool yet. Ask an admin to grant it in Settings.",
  failed: "I couldn't check who you are just now. Please try again in a moment.",
};

/** The one sentence a given refusal kind is allowed to say, verbatim. */
export function identityRefusal(kind: RefusalKind): string {
  return REFUSALS[kind];
}

/**
 * The Phase 3 stub reply for a recognised person: names them, and either
 * names the command they typed or says none is wired up yet.
 */
export function greeting(firstName: string, command: string | null): string {
  if (command) {
    return `Hi ${firstName}! I heard ${command} — it isn't wired up yet, but now I know who's asking.`;
  }
  return `Hi ${firstName}! Slash commands are on their way — nothing to run just yet.`;
}

/**
 * The join announcement, once a space has been matched (or not) against
 * units and projects. With a label, the space is now linked; without one,
 * nothing matched (or the space had several candidates) and the bot says
 * how to fix that with /link.
 */
export function joinHello(label: string | null): string {
  if (label) {
    return `Hello! I'm the Relay bot. I've linked this space to ${label}. Commands here default to it; /link changes that.`;
  }
  return "Hello! I'm the Relay bot. Use /link to tell me which villa or project this space is for — until then, commands here span everything.";
}

/** /link in a DM: DMs already span everything, so there is nothing to link. */
export function dmCannotLink(): string {
  return "A DM can't be linked — commands here already span everything.";
}

/** /link answered outside a dialog event: the console's dialog tick is missing. */
export function dialogNotEnabled(): string {
  return "The /link command needs 'Opens a dialog' ticked in the Chat app's configuration — an admin can do that in the Google Cloud console.";
}

/** The dialog's write failed; the person should just try again. */
export function linkSaveFailed(): string {
  return "I couldn't save that just now. Please try again in a moment.";
}

/**
 * The public confirmation once a /link dialog is submitted successfully.
 * With a label, the space is now linked to it; without one, it was unlinked.
 */
export function linkConfirmation(label: string | null): string {
  if (label) {
    return `This space is now linked to ${label}.`;
  }
  return "This space is no longer linked — commands here span everything.";
}

/** One row of the /link dialog's dropdown: a value the door understands, and its label. */
export type LinkTarget = { value: string; text: string };

/**
 * The /link dialog itself, as a plain object shaped like a Google Chat
 * card. The door wraps this in the `pushCard` navigation envelope — this
 * function knows nothing about that envelope, only the card. The caller
 * supplies every row, including the "none" one; this builder invents none.
 */
export function linkDialog(targets: LinkTarget[], current: string): Record<string, unknown> {
  return {
    sections: [
      {
        widgets: [
          {
            selectionInput: {
              name: "target",
              label: "Link this space to",
              type: "DROPDOWN",
              items: targets.map((t) => ({
                text: t.text,
                value: t.value,
                selected: t.value === current,
              })),
            },
          },
          {
            buttonList: {
              buttons: [{ text: "Save", onClick: { action: { function: "link" } } }],
            },
          },
        ],
      },
    ],
  };
}
