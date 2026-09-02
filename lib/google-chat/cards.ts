/**
 * The bot's fixed sentences — words only, no I/O. Every refusal the door
 * can send back is pinned here verbatim from the Phase 3 decision table,
 * so the door never improvises a sentence and never says more about who
 * exists in the system than these five lines allow. The greeting is the
 * one line an `ok` identity gets instead.
 *
 * Em-dashes are fine in these replies — the em-dash trap from Phase 2 was
 * Google's command *description* field in the console, not chat text.
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
