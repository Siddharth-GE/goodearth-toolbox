import {
  BOUNCE_REASONS,
  CUSTOM_SET,
  DEFAULT_CUSTOM_STEPS,
  MAX_CUSTOM_STEPS,
  buttonsFor,
  customStepCount,
} from "./trail-rules";
import type {
  ActivityOption,
  ButtonAction,
  LegOption,
  PersonOption,
  StepDefault,
  TrailSetOption,
  TrailSummary,
} from "./trail-rules";

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
 *
 * Phase 6/7 grows it a third time: the court card's rows gain the action
 * buttons trail-rules.ts's `buttonsFor` decides on (still ending in the
 * same "Open in the toolbox" link, trap (e) means every button here is a
 * URL, never a name), plus the two dialogs — `/bounce` and `/newtrail`
 * — and the sentences a write posts to the space or says back privately.
 * Those sentences are `text`, not a card, so they use *asterisks* for
 * bold the way Chat's plain messages do, and — being the bot's own
 * words, not a villa name or a note somebody typed — are not run through
 * escapeHtml; the trail's own name and note ARE somebody's words and do
 * go through it wherever they land inside a card widget.
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
/** Every action button's own label, in the order buttonsFor hands the actions back. */
const ACTION_BUTTON_TEXT: Record<ButtonAction, string> = {
  push: "Push",
  finish: "Finish",
  bounce: "Bounce",
  hold: "With client",
  return: "Back from client",
};

/**
 * One row's action buttons — Push/Finish/Bounce/With client/Back from
 * client, whichever `buttonsFor` says this trail's state offers. Every
 * one posts to the same `submitUrl` (the door's own registered address —
 * trap (e), a callback button's `onClick.action.function` must be a URL,
 * never a name) carrying which action, which trail and which leg it was
 * pressed from, so `parseButton` in trail-rules.ts can read the press
 * back with nothing guessed. Bounce alone opens a dialog instead of
 * acting straight away, because it needs a reason and a note first.
 */
function actionButtons(row: TrailSummary, submitUrl: string): Record<string, unknown>[] {
  if (row.currentLeg === null) return [];
  const fromLeg = row.currentLeg;

  return buttonsFor(row).map((action) => {
    const clickAction: Record<string, unknown> = {
      function: submitUrl,
      parameters: [
        { key: "action", value: action },
        { key: "chain", value: row.chainId },
        { key: "leg", value: String(fromLeg) },
      ],
    };
    // `interaction` is a field of the ACTION, not of the click around it.
    // Placed one level up, Google rejects the whole card silently and
    // shows "Relay not responding" — the founder's first /court with a
    // baton in hand, 2026-09-03 (trap (i) in plan.md).
    if (action === "bounce") clickAction.interaction = "OPEN_DIALOG";
    return { text: ACTION_BUTTON_TEXT[action], onClick: { action: clickAction } };
  });
}

/**
 * One trail as the widgets every row is made of: the status line, then a
 * single buttonList — whatever action buttons the caller supplies (none
 * for /trail's read-only rows) followed by Open in the toolbox, which
 * always comes last so a row never ends on a button that moves something.
 */
function rowWidgets(
  row: TrailSummary,
  origin: string,
  bottomLabel: string,
  leadingButtons: Record<string, unknown>[] = [],
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

  const openInToolbox = {
    text: "Open in the toolbox",
    onClick: { openLink: { url: `${origin}/relay/trails/${row.chainId}` } },
  };

  return [
    { decoratedText: { topLabel, text, bottomLabel, wrapText: true } },
    { buttonList: { buttons: [...leadingButtons, openInToolbox] } },
  ];
}

/** No words in a DM or an unlinked space: /trail alone has nothing to scope or search by. */
export function askForWords(): string {
  return "Tell me what to look for — a villa, a project or an activity, e.g. /trail villa 12.";
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
  submitUrl: string;
}): Record<string, unknown> {
  const { scopeLabel, rows, more, moreElsewhere, origin, submitUrl } = input;
  const subtitle = scopeLabel ?? "everything";

  const widgets: Record<string, unknown>[] = [];
  if (rows.length === 0) {
    widgets.push({ textParagraph: { text: "Court cleared — nothing is waiting on you." } });
  } else {
    for (const row of rows) {
      widgets.push(
        ...rowWidgets(row, origin, courtBottomLabel(row), actionButtons(row, submitUrl)),
      );
    }
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
    for (const row of rows) widgets.push(...rowWidgets(row, origin, trailBottomLabel(row)));
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

// --- Phase 6/7: the two dialogs, and the sentences a write produces ----

/** "Leg 1 · Client sign-off · Anil" — a bounce target row, label omitted when the leg carries none. */
function legOptionText(leg: LegOption): string {
  const labelPart = leg.label ? ` · ${escapeHtml(leg.label)}` : "";
  const assignee = leg.assigneeName ? escapeHtml(leg.assigneeName) : "Unnamed";
  return `Leg ${leg.legNo}${labelPart} · ${assignee}`;
}

/**
 * The /bounce dialog: which leg to send the trail back to, why, and what
 * needs to change — built even for a trail with no legs behind it to
 * bounce to (an empty "Send it back to" dropdown), because the button
 * that opens this is only offered when `buttonsFor` already found a leg
 * to go back to, and this builder shouldn't have to re-decide that.
 */
export function bounceDialog(input: {
  trail: TrailSummary;
  legs: LegOption[];
  submitUrl: string;
}): Record<string, unknown> {
  const { trail, legs, submitUrl } = input;
  const legPart = trail.legLabel ? ` · ${escapeHtml(trail.legLabel)}` : "";
  const paragraph = `Bounce <b>${escapeHtml(trail.activityName)}</b> back — it is on leg ${trail.currentLeg} of ${trail.legCount}${legPart}.`;

  return {
    sections: [
      {
        widgets: [
          { textParagraph: { text: paragraph } },
          {
            selectionInput: {
              name: "to_leg",
              label: "Send it back to",
              type: "DROPDOWN",
              items: legs.map((leg, index) => ({
                text: legOptionText(leg),
                value: String(leg.legNo),
                selected: index === legs.length - 1,
              })),
            },
          },
          {
            selectionInput: {
              name: "reason",
              label: "Reason",
              type: "DROPDOWN",
              items: BOUNCE_REASONS.map((r) => ({ text: r.text, value: r.value, selected: false })),
            },
          },
          {
            textInput: {
              name: "note",
              label: "What needs to change",
              type: "MULTIPLE_LINE",
              hintText: "A bounce is never silent.",
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
                      parameters: [
                        { key: "action", value: "bounce" },
                        { key: "chain", value: trail.chainId },
                        { key: "leg", value: String(trail.currentLeg) },
                      ],
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
 * The /newtrail dialog: which house, which trail type — or "Custom", first
 * in the list, for when there is no trail type at all and the person lays
 * out the steps themselves — how many steps that custom trail gets,
 * whether they want to choose who carries each step, and whether the clock
 * starts today. The step count is asked here, before page 2 exists,
 * because a Chat dialog cannot grow a row once it is open: page 2 renders
 * exactly the number chosen, and a trail type ignores it entirely (its own
 * steps decide). `units` is space-match.ts's
 * `unitRows` output — a flat list, unlike /link's dropdown, because a new
 * trail always starts on one villa, never a whole project. `selectedUnit`
 * pre-fills a linked space's own villa; a project-linked or unlinked space
 * passes null and nothing is pre-selected. Neither switch is pre-selected
 * the way "Custom" isn't: "Choose the people myself" starts off, because
 * most trails just want the usual person; "Start now" starts on — unlike
 * the app's house queue, which queues by default, chat's founder-approved
 * default is to start immediately. Saving here either opens the trail at
 * once (a standard type, people not chosen) or hands the door what it
 * needs to build page 2 — this builder knows nothing about that branch.
 */
export function newTrailDialog(input: {
  units: { value: string; text: string }[];
  sets: TrailSetOption[];
  selectedUnit: string | null;
  submitUrl: string;
}): Record<string, unknown> {
  const { units, sets, selectedUnit, submitUrl } = input;

  return {
    sections: [
      {
        widgets: [
          {
            selectionInput: {
              name: "unit",
              label: "Which house",
              type: "DROPDOWN",
              items: units.map((u) => ({
                text: u.text,
                value: u.value,
                selected: u.value === selectedUnit,
              })),
            },
          },
          {
            selectionInput: {
              name: "set",
              label: "Trail type",
              type: "DROPDOWN",
              items: [
                { text: "Custom — I'll pick the steps", value: CUSTOM_SET, selected: false },
                ...sets.map((s) => ({ text: s.name, value: s.id, selected: false })),
              ],
            },
          },
          {
            selectionInput: {
              name: "steps",
              label: "Steps (custom trails only)",
              type: "DROPDOWN",
              items: Array.from({ length: MAX_CUSTOM_STEPS }, (_, index) => {
                const count = index + 1;
                return {
                  text: String(count),
                  value: String(count),
                  selected: count === DEFAULT_CUSTOM_STEPS,
                };
              }),
            },
          },
          {
            decoratedText: {
              text: "Choose the people myself",
              bottomLabel: "Off = each step goes to whoever usually carries it.",
              switchControl: {
                name: "pick_people",
                value: "on",
                selected: false,
                controlType: "SWITCH",
              },
            },
          },
          {
            decoratedText: {
              text: "Start now",
              bottomLabel: "The clock begins today. Off = queued, started later from the toolbox.",
              switchControl: { name: "start", value: "on", selected: true, controlType: "SWITCH" },
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
                      parameters: [{ key: "action", value: "newtrail" }],
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
 * Page 2 of /newtrail — the steps themselves, one section, shown only when
 * page 1's Save wasn't the one-tap case (a standard type, people left to
 * their usual person). Set mode's rows are fixed to the trail type's own
 * activities, in order, each pre-filled with its usual person and days —
 * choosing the people myself mostly means changing one or two dropdowns,
 * not filling in every row from scratch. Custom mode has no defaults to
 * pre-fill from, so every row starts blank; it renders exactly the number
 * of rows page 1 asked for (`customSteps`, a blank one is dropped by
 * `parseTrailSteps`, not by this builder, which doesn't know which will
 * end up used).
 *
 * `error` and `values` are what makes a refusal survivable. A page-2
 * failure used to be a `notification` toast on the closing dialog — the
 * founder's vet (2026-09-03) saw the dialog shut with nothing said and no
 * trail opened, because a toast is not a warning. So every page-2 failure
 * now re-draws this same page with the sentence at the top and every box
 * exactly as the person left it: `values` wins over the defaults for any
 * input it has an entry for, so a corrected form is one dropdown away
 * rather than the whole page typed again.
 *
 * The Open trail button carries what page 1 already decided — `unit`,
 * `set`, `start`, and `mode` — plus how many rows to read back (`count`)
 * and, in set mode, which activity each row is (`activities`, so the door
 * needs no memory between the two dialog pages: `parseTrailSteps` reads
 * everything else straight off this page's own form values.
 */
export function trailStepsDialog(input: {
  mode: "set" | "custom";
  steps: StepDefault[];
  people: PersonOption[];
  activities: ActivityOption[];
  params: { unit: string; set: string; start: boolean };
  submitUrl: string;
  customSteps?: number;
  error?: string | null;
  values?: Record<string, string | null>;
}): Record<string, unknown> {
  const { mode, steps, people, activities, params, submitUrl, error, values } = input;
  const widgets: Record<string, unknown>[] = [];

  const customRows = customStepCount(input.customSteps ?? null);

  // "The person left this box like that" and "nobody has touched this box
  // yet" are different answers: a re-drawn page keeps a dropdown someone
  // cleared cleared, while a first draw falls back to the type's default.
  const wasSubmitted = (name: string): boolean => values !== undefined && name in values;
  const submitted = (name: string): string => values?.[name] ?? "";

  const personDropdown = (name: string, defaultId: string | null): Record<string, unknown> => {
    const selectedId = wasSubmitted(name) ? submitted(name) : (defaultId ?? "");
    return {
      selectionInput: {
        name,
        label: "Who carries it",
        type: "DROPDOWN",
        items: people.map((p) => ({ text: p.name, value: p.id, selected: p.id === selectedId })),
      },
    };
  };

  if (error) {
    widgets.push({
      textParagraph: { text: `<font color="#b3261e"><b>${escapeHtml(error)}</b></font>` },
    });
  }

  if (mode === "set") {
    steps.forEach((step, index) => {
      const stepNo = index + 1;
      widgets.push({
        decoratedText: {
          topLabel: `Step ${stepNo}`,
          text: `<b>${escapeHtml(step.activityName)}</b>`,
        },
      });
      widgets.push(personDropdown(`person_${stepNo}`, step.assigneeId));
      const daysName = `days_${stepNo}`;
      widgets.push({
        textInput: {
          name: daysName,
          label: "Days",
          value: wasSubmitted(daysName) ? submitted(daysName) : String(step.expectedDays),
        },
      });
    });
  } else {
    widgets.push({
      textInput: {
        name: "title",
        label: "What is this trail for",
        hintText: "Optional",
        ...(wasSubmitted("title") ? { value: submitted("title") } : {}),
      },
    });
    for (let stepNo = 1; stepNo <= customRows; stepNo++) {
      const activityName = `activity_${stepNo}`;
      const activityChosen = wasSubmitted(activityName) ? submitted(activityName) : "";
      widgets.push({
        selectionInput: {
          name: activityName,
          label: `Step ${stepNo} · activity`,
          type: "DROPDOWN",
          items: activities.map((a) => ({
            text: a.name,
            value: a.id,
            selected: a.id === activityChosen,
          })),
        },
      });
      widgets.push(personDropdown(`person_${stepNo}`, null));
      const daysName = `days_${stepNo}`;
      widgets.push({
        textInput: {
          name: daysName,
          label: "Days",
          hintText: "e.g. 5",
          ...(wasSubmitted(daysName) ? { value: submitted(daysName) } : {}),
        },
      });
    }
  }

  widgets.push({
    buttonList: {
      buttons: [
        {
          text: "Open trail",
          onClick: {
            action: {
              function: submitUrl,
              parameters: [
                { key: "action", value: "newtrail-open" },
                { key: "unit", value: params.unit },
                { key: "set", value: params.set },
                { key: "start", value: params.start ? "on" : "" },
                { key: "mode", value: mode },
                {
                  key: "count",
                  value: mode === "set" ? String(steps.length) : String(customRows),
                },
                ...(mode === "set"
                  ? [{ key: "activities", value: steps.map((s) => s.activityId).join(",") }]
                  : []),
              ],
            },
          },
        },
      ],
    },
  });

  return { sections: [{ widgets }] };
}

/** The public confirmation's extra line for a custom trail — it has no departments yet. */
export function customDepartmentsNote(): string {
  return "Add its departments on the trail page if it needs them.";
}

/**
 * "on Villa 12" — every write sentence below says where a trail lives
 * the same way: the villa when it has one, the project alone when it
 * doesn't (a project-level trail, or a unit read that came back bare).
 */
function trailWhere(trail: TrailSummary): string {
  return `on ${trail.unitName ?? trail.projectName}`;
}

/** " · Client sign-off" — omitted when the leg the sentence is about carries no label. */
function trailLegPart(trail: TrailSummary): string {
  return trail.legLabel ? ` · ${trail.legLabel}` : "";
}

/**
 * Public confirmations, posted to the space as an ordinary message —
 * `text`, not a card, so *asterisks* are Chat's own way of saying bold
 * and nothing here goes through escapeHtml (see the file header). Built
 * from the fresh TrailSummary a write's own confirmation read returns,
 * so the leg, the label and the holder are all where the write actually
 * left them, never the state the button was pressed from.
 */
export function pushedText(firstName: string, trail: TrailSummary): string {
  const holder = trail.holderName ?? "nobody named";
  return `*${firstName}* pushed *${trail.activityName}* ${trailWhere(trail)} to leg ${trail.currentLeg} of ${trail.legCount}${trailLegPart(trail)} — now with ${holder}.`;
}

export function finishedText(firstName: string, trail: TrailSummary): string {
  return `*${firstName}* finished *${trail.activityName}* ${trailWhere(trail)} 🎉`;
}

export function bouncedText(
  firstName: string,
  trail: TrailSummary,
  reasonText: string,
  note: string,
): string {
  const holder = trail.holderName ?? "nobody named";
  return `*${firstName}* bounced *${trail.activityName}* ${trailWhere(trail)} back to leg ${trail.currentLeg} of ${trail.legCount}${trailLegPart(trail)} — with ${holder}. ${reasonText}: ${note}`;
}

export function heldText(firstName: string, trail: TrailSummary): string {
  return `*${firstName}* marked *${trail.activityName}* ${trailWhere(trail)} as with the client.`;
}

export function returnedText(firstName: string, trail: TrailSummary): string {
  return `*${firstName}* took *${trail.activityName}* ${trailWhere(trail)} back from the client.`;
}

/** currentLeg null means the trail was opened queued, not started; otherwise it says where it landed. */
export function openedText(firstName: string, trail: TrailSummary): string {
  if (trail.currentLeg === null) {
    return `*${firstName}* queued *${trail.activityName}* ${trailWhere(trail)} — not started yet.`;
  }
  const holder = trail.holderName ?? "nobody named";
  return `*${firstName}* opened *${trail.activityName}* ${trailWhere(trail)} — leg ${trail.currentLeg} of ${trail.legCount}${trailLegPart(trail)}, with ${holder}.`;
}

/** The close navigation's private toast when a dialog write actually succeeded. */
export function doneText(): string {
  return "Done.";
}

/** actAs() failed at any step — the session couldn't be minted, or was lost mid-write. */
export function cannotActNow(): string {
  return "I couldn't act as you just now. Please try again in a moment.";
}

/** /newtrail answered outside a dialog event: the console's dialog tick is missing, same as /link's. */
export function newTrailNeedsDialog(): string {
  return "The /newtrail command needs 'Opens a dialog' ticked in the Chat app's configuration — an admin can do that in the Google Cloud console.";
}
