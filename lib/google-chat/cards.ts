import type { TrailSummary } from "./trail-rules";

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
 *
 * Phase 5 grows it again with the two read cards, `/court` and `/trail`.
 * Both are built from the same one-row widget (a `decoratedText` plus an
 * `openLink` button), so that widget — and the day-and-status sentence
 * every row carries — is written once below and shared by both builders.
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
 * A recognised person, with no command dispatch for what they typed:
 * names them, and either names the command they typed (still true for
 * /newtrail, which has no card of its own yet) or — a plain DM message
 * with nothing to run — points at the two Phase 5 commands that do.
 */
export function greeting(firstName: string, command: string | null): string {
  if (command) {
    return `Hi ${firstName}! I heard ${command} — it isn't wired up yet, but now I know who's asking.`;
  }
  return `Hi ${firstName}! Try /court to see what's in your hand, or /trail followed by a villa name.`;
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
 *
 * `submitUrl` is where Google posts the Save press. For an HTTP app the
 * button's `action.function` is a URL, not a name — the first vet
 * (2026-09-02) had "link" there, Google tried to reach a URL called
 * "link", and showed "the app is not responding" without ever calling
 * the door. The `action` parameter names the button so the door can tell
 * this Save from the trail buttons that arrive in Phase 6.
 */
export function linkDialog(
  targets: LinkTarget[],
  current: string,
  submitUrl: string,
): Record<string, unknown> {
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
              buttons: [
                {
                  text: "Save",
                  onClick: {
                    action: {
                      function: submitUrl,
                      parameters: [{ key: "action", value: "link" }],
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

/**
 * A dialog that only says something. When Google has asked the app for
 * a dialog, the answer MUST be a dialog — a plain message envelope in
 * reply to a dialog request is "invalid" and shows as "Could not load
 * dialog" (the first vet, /link in a DM). So a refusal or an apology at
 * that moment is this: one paragraph, and the dialog's own close button.
 */
export function noticeDialog(text: string): Record<string, unknown> {
  return { sections: [{ widgets: [{ textParagraph: { text } }] }] };
}

/**
 * Every string that ends up inside a card's rich-text fields (a
 * `decoratedText`'s `text` in particular, which the bot itself puts
 * `<b>` and `<br>` into) has to be escaped first, or a villa named with
 * a stray "<" in it would break the tag rather than just look odd. Only
 * the three characters HTML actually parses as markup need it.
 */
function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** "cold" / "with the client N days" / "cold, with the client N days" / "on time". */
function statusPhrase(row: TrailSummary): string {
  const withClient = `with the client ${row.withClientDays} day${row.withClientDays === 1 ? "" : "s"}`;
  if (row.isStuck && row.isWithClient) return `cold, ${withClient}`;
  if (row.isStuck) return "cold";
  if (row.isWithClient) return withClient;
  return "on time";
}

/** "day 4 of 3, cold" — the clock and status half every row's bottom label ends with. */
function daySentence(row: TrailSummary): string {
  return `day ${row.daysInLeg} of ${row.expectedDays}, ${statusPhrase(row)}`;
}

/** "Leg 2 of 5 · Structural drawings" — the leg label is omitted when the view has none. */
function legAndLabel(row: TrailSummary): string {
  const legNumber = row.currentLeg ?? row.legCount;
  const base = `Leg ${legNumber} of ${row.legCount}`;
  return row.legLabel ? `${base} · ${escapeHtml(row.legLabel)}` : base;
}

/** The court's own bottom label: which leg, and how the clock reads. */
function courtBottomLabel(row: TrailSummary): string {
  return `${legAndLabel(row)} — ${daySentence(row)}`;
}

/**
 * /trail's bottom label: the same leg-and-label courtCard's rows carry
 * — someone asking "where is villa 12's drawings" wants to know which
 * leg it's on as much as who has it — plus who holds it.
 */
function trailBottomLabel(row: TrailSummary): string {
  const holder = row.holderName ? escapeHtml(row.holderName) : "Unnamed";
  return `${legAndLabel(row)} · with ${holder} — ${daySentence(row)}`;
}

/**
 * One trail as the two widgets every row is made of: the status line,
 * and its one action — Open in the toolbox. No Push/Bounce/Finish
 * buttons yet (Phase 6): a callback button with nothing behind it is
 * exactly the "app is not responding" trap (e) from Phase 4's plan.
 */
function trailWidgets(
  row: TrailSummary,
  origin: string,
  bottomLabel: string,
): Record<string, unknown>[] {
  const topLabel = row.unitName
    ? `${escapeHtml(row.projectName)} · ${escapeHtml(row.unitName)}`
    : escapeHtml(row.projectName);
  const activity = `<b>${escapeHtml(row.activityName)}</b>`;
  // A trail laid down from a trail type carries the type's name as both
  // its activity and its title, so "Standard villa" would print twice
  // (seen on the first staging card, 2026-09-03). The title earns its
  // line only when it says something the bold line doesn't.
  const title = row.title?.trim() ?? "";
  const repeats = title.toLowerCase() === row.activityName.trim().toLowerCase();
  const text = title && !repeats ? `${activity}<br>${escapeHtml(title)}` : activity;

  return [
    { decoratedText: { topLabel, text, bottomLabel, wrapText: true } },
    {
      buttonList: {
        buttons: [
          {
            text: "Open in the toolbox",
            onClick: { openLink: { url: `${origin}/relay/trails/${row.chainId}` } },
          },
        ],
      },
    },
  ];
}

/** No words in a DM or an unlinked space: /trail alone has nothing to scope or search by. */
export function askForWords(): string {
  return "Tell me what to look for — a villa, a project or an activity, e.g. /trail villa 12.";
}

/** The line /push, /bounce and /finish add to the court card until Phase 6 wires the buttons. */
export function buttonsComingNote(): string {
  return "Push, Bounce and Finish buttons arrive with the next release — Open a trail to move it in the toolbox.";
}

/**
 * The /court card: everything unfinished the sender holds, coldest
 * first. A linked space has already split this by scope before it gets
 * here (`trail-rules.ts`'s `splitByScope`), so `rows` is only what's in
 * scope, `more` is how many of those were cut at the ten-cap, and
 * `moreElsewhere` is how many more the sender holds outside this space
 * — all from the one unscoped read `listCourt` did.
 */
export function courtCard(input: {
  firstName: string;
  scopeLabel: string | null;
  rows: TrailSummary[];
  more: number;
  moreElsewhere: number;
  origin: string;
  note?: string | null;
}): Record<string, unknown> {
  const { scopeLabel, rows, more, moreElsewhere, origin, note } = input;
  const subtitleBase = scopeLabel ?? "everything";
  const subtitle = note ? `${subtitleBase} · ${note}` : subtitleBase;

  const widgets: Record<string, unknown>[] = [];
  if (rows.length === 0) {
    widgets.push({ textParagraph: { text: "Court cleared — nothing is waiting on you." } });
  } else {
    for (const row of rows) widgets.push(...trailWidgets(row, origin, courtBottomLabel(row)));
  }

  if (more > 0) {
    widgets.push({
      textParagraph: {
        text: `and ${more} more — <a href="${origin}/relay/court">open your court in the toolbox</a>`,
      },
    });
  }
  if (moreElsewhere > 0) {
    widgets.push({
      textParagraph: {
        text: `You also hold ${moreElsewhere} trail${moreElsewhere === 1 ? "" : "s"} outside this space.`,
      },
    });
  }

  return {
    cardId: "court",
    card: { header: { title: "Your court", subtitle }, sections: [{ widgets }] },
  };
}

/** No words: "Nothing is running here right now." With words: names what didn't match. */
function trailEmptyText(words: string[], origin: string): string {
  if (words.length === 0) return "Nothing is running here right now.";
  const phrase = escapeHtml(words.join(" "));
  return `Nothing running matches '${phrase}'. Finished and waiting trails are <a href="${origin}/relay/trails">in the toolbox</a>.`;
}

/**
 * The /trail card: every running match, by holder. `words` is what
 * `searchWords` made of what was typed — already used to filter `rows`
 * before this is called, and repeated here only to say what was searched
 * for.
 */
export function trailCard(input: {
  words: string[];
  scopeLabel: string | null;
  rows: TrailSummary[];
  more: number;
  origin: string;
}): Record<string, unknown> {
  const { words, scopeLabel, rows, more, origin } = input;
  const subtitle =
    words.length > 0 ? `matching '${escapeHtml(words.join(" "))}'` : (scopeLabel ?? "everything");

  const widgets: Record<string, unknown>[] = [];
  if (rows.length === 0) {
    widgets.push({ textParagraph: { text: trailEmptyText(words, origin) } });
  } else {
    for (const row of rows) widgets.push(...trailWidgets(row, origin, trailBottomLabel(row)));
    if (more > 0) {
      widgets.push({
        textParagraph: {
          text: `and ${more} more — <a href="${origin}/relay/trails">open in the toolbox</a>`,
        },
      });
    }
  }

  return {
    cardId: "trails",
    card: { header: { title: "Trails", subtitle }, sections: [{ widgets }] },
  };
}
