/**
 * A usage test for the Google Chat door, run from this machine.
 *
 *   npm run chat:usage -- --as siddharth@goodearthkannur.org
 *   npm run chat:usage -- --as siddharth@goodearthkannur.org --dm --bounce
 *   npm run chat:usage -- --as siddharth@goodearthkannur.org --press push --commit
 *
 * WHAT IT IS FOR. Every gate this repo has is blind to the bot: a green
 * build never talks to Google, the tests pin our own card shapes, and
 * the only way to exercise the door has been for a person to type a
 * command in a real Chat space on staging. This script closes most of
 * that gap. It builds the envelopes Google sends — a slash command, a
 * dialog request, a button press with the bot's own card behind it — and
 * hands them straight to `handleChatRequest` (lib/google-chat/dispatch.ts)
 * in this process, against the STAGING database, as a named person. So
 * identity, the reads, the card renderers, an act-as write and the card
 * refresh all run for real, and the answers come back to be classified.
 *
 * WHAT IT CANNOT PROVE. Google is still the only judge of the JSON we
 * send it (BUGCATCHER #17): a card that classifies perfectly here can
 * still be "Relay not responding" in a space. What this proves is our
 * side — that nothing throws, that the envelope is the right KIND for
 * the event, that the rows are the person's real rows, and what the
 * door's own log lines say. The founder's vet in a real space stays
 * exactly as required as it was.
 *
 * THE LOCK IS NOT DRIVEN. verify.ts is never called: this script starts
 * where the route hands over, after Google has been proven. That is the
 * whole reason the dispatch was moved out of route.ts — a Next.js route
 * file may export nothing but its handlers.
 *
 * SAFETY. It refuses to run against anything but the staging database,
 * because with `--commit` it moves a real baton as a real person. Reads
 * are always allowed; the one write (`--press`) needs `--commit` and
 * says which row it would press otherwise. It prints no email but the
 * one given on the command line, and never a token or a key.
 *
 * WHY THE LOADER. `server-only` is not an installed package and
 * `next/cache` throws outside a Next request, so plain Node cannot
 * import the door. `scripts/google-chat-usage-loader.mjs` stubs those
 * two specifiers in the module loader rather than weakening anything
 * under lib/ — which is why this script is run through the npm alias
 * and not with a bare `npx tsx`.
 */
import { config } from "dotenv";
import { resolve } from "node:path";

import type { ChatEvent } from "../lib/google-chat/events";

config({ path: resolve(import.meta.dirname, "..", ".env.local") });

/** The only database this script will speak to. */
const STAGING_REF = "ipstebqawrvhkyntctrv";

/**
 * The registered endpoint of the staging Chat app. `chatAudience()` and
 * `chatOrigin()` are read all over the door — a button's callback URL,
 * every "Open in the toolbox" link — and they throw when it is unset.
 * The lock never runs here, so this value is a label, not a credential.
 */
const DEFAULT_AUDIENCE = "https://staging.goodearthkannur.org/api/google-chat";

/** A space nothing is linked to, so a run cannot disturb a real space's scope. */
const DEFAULT_SPACE = "spaces/USAGE-TEST";

/** The pressed card's resource name. Deliberately fake: no such message exists. */
const PRESSED_MESSAGE_ID = "USAGE-TEST";

const PRESS_ACTIONS = ["push", "finish", "hold", "return"] as const;
type PressAction = (typeof PRESS_ACTIONS)[number];

const COURT_COMMAND_ID = 1;
const TRAIL_COMMAND_ID = 5;
const NEWTRAIL_COMMAND_ID = 6;
const LINK_COMMAND_ID = 7;

type Options = {
  as: string;
  space: string;
  dm: boolean;
  press: PressAction | null;
  bounce: boolean;
  commit: boolean;
};

// --- the command line ----------------------------------------------------

function flagValue(argv: string[], flag: string): string | undefined {
  const at = argv.indexOf(flag);
  return at === -1 ? undefined : argv[at + 1];
}

function readOptions(argv: string[]): Options {
  const as = flagValue(argv, "--as");
  if (!as || !as.includes("@")) {
    throw new Error(
      "--as <email> is required — the toolbox account to act as.\n" +
        "On staging that is siddharth@goodearthkannur.org or the probe account.",
    );
  }

  const press = flagValue(argv, "--press");
  if (press !== undefined && !PRESS_ACTIONS.includes(press as PressAction)) {
    throw new Error(`--press must be one of ${PRESS_ACTIONS.join(", ")}.`);
  }

  const space = flagValue(argv, "--space") ?? DEFAULT_SPACE;
  if (!/^spaces\/[^/]+$/.test(space)) {
    throw new Error("--space must look like spaces/<id>.");
  }

  return {
    as: as.trim().toLowerCase(),
    space,
    dm: argv.includes("--dm"),
    press: (press as PressAction | undefined) ?? null,
    bounce: argv.includes("--bounce"),
    commit: argv.includes("--commit"),
  };
}

// --- the envelopes Google sends -----------------------------------------

function chatUser(options: Options) {
  return {
    name: "users/usage-test",
    email: options.as,
    displayName: "Usage test",
    type: "HUMAN" as const,
  };
}

function chatSpace(options: Options) {
  return {
    name: options.space,
    displayName: "Usage test",
    spaceType: options.dm ? "DIRECT_MESSAGE" : "SPACE",
  };
}

/**
 * A typed slash command. Google sends the int64 command id as a string,
 * so it is a string here too — `commandId()` normalises it, and sending
 * a number would test a shape Google never sends.
 */
function commandEvent(
  options: Options,
  id: number,
  text: string,
  argumentText: string,
  dialog = false,
): ChatEvent {
  return {
    chat: {
      user: chatUser(options),
      appCommandPayload: {
        appCommandMetadata: { appCommandId: String(id), appCommandType: "SLASH_COMMAND" },
        message: { text, argumentText, sender: chatUser(options) },
        space: chatSpace(options),
        ...(dialog ? { isDialogEvent: true, dialogEventType: "REQUEST_DIALOG" } : {}),
      },
    },
  };
}

/**
 * A press on one of the bot's own card buttons. The message behind the
 * press is the CARD, whose sender is the bot, and the person is in
 * `chat.user` — trap (k) in BUGCATCHER #17, the shape that once made
 * every button answer "Google didn't tell me who you are".
 *
 * The card's resource name is a real-looking handle for a message that
 * does not exist, which is the point: the refresh path runs all the way
 * to Google and its log line says whether the key works.
 */
function pressEvent(
  options: Options,
  parameters: Record<string, string>,
  dialog = false,
): ChatEvent {
  return {
    chat: {
      user: chatUser(options),
      buttonClickedPayload: {
        message: {
          name: `${options.space}/messages/${PRESSED_MESSAGE_ID}`,
          sender: { name: "users/relay-bot", displayName: "Relay", type: "BOT" },
        },
        space: chatSpace(options),
        ...(dialog ? { isDialogEvent: true, dialogEventType: "REQUEST_DIALOG" } : {}),
      },
    },
    commonEventObject: {
      invokedFunction: process.env.GOOGLE_CHAT_AUDIENCE,
      parameters,
    },
  };
}

// --- reading the answer --------------------------------------------------

/** One row of a card: what the person sees, and what its buttons would send back. */
type CardRow = {
  topLabel: string;
  text: string;
  bottomLabel: string;
  buttons: { text: string; parameters: Record<string, string> }[];
};

type CardView = { title: string; subtitle: string; rows: CardRow[]; notes: string[] };

type Answer =
  | { kind: "message"; privateTo: string | null; text: string | null; cards: CardView[] }
  | {
      kind: "dialog";
      how: "pushCard" | "updateCard";
      title: string | null;
      widgets: number;
      firstLine: string | null;
    }
  | { kind: "close"; notification: string | null }
  | { kind: "empty" }
  | { kind: "unexpected"; body: unknown };

/** The bot writes `<b>`, `<br>` and escaped entities into card text; this reads it back as a person would. */
function strip(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/<br\s*\/?>/gi, " / ")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function dig(value: unknown, ...path: string[]): unknown {
  let current: unknown = value;
  for (const key of path) {
    const record = asRecord(current);
    if (!record) return undefined;
    current = record[key];
  }
  return current;
}

/** A button's `[{key,value}]` parameters, read back as the record a press carries. */
function buttonParameters(button: unknown): Record<string, string> {
  const raw = dig(button, "onClick", "action", "parameters");
  const parameters: Record<string, string> = {};
  if (!Array.isArray(raw)) return parameters;
  for (const entry of raw) {
    const record = asRecord(entry);
    const key = record?.key;
    const value = record?.value;
    if (typeof key === "string" && typeof value === "string") parameters[key] = value;
  }
  return parameters;
}

/**
 * A card's widgets, read as rows. A `decoratedText` starts a row and the
 * `buttonList` that follows it belongs to it — which is exactly how
 * `rowWidgets` in cards.ts builds them, and how a person reads them.
 * Anything else (the "and N more" lines, "Court cleared") is a note.
 */
function readCard(entry: unknown): CardView {
  const card = dig(entry, "card");
  const title = String(dig(card, "header", "title") ?? "");
  const subtitle = String(dig(card, "header", "subtitle") ?? "");
  const rows: CardRow[] = [];
  const notes: string[] = [];

  const sections = dig(card, "sections");
  const widgets: unknown[] = [];
  if (Array.isArray(sections)) {
    for (const section of sections) {
      const list = dig(section, "widgets");
      if (Array.isArray(list)) widgets.push(...list);
    }
  }

  for (const widget of widgets) {
    const decorated = dig(widget, "decoratedText");
    if (decorated) {
      rows.push({
        topLabel: strip(dig(decorated, "topLabel")),
        text: strip(dig(decorated, "text")),
        bottomLabel: strip(dig(decorated, "bottomLabel")),
        buttons: [],
      });
      continue;
    }
    const buttons = dig(widget, "buttonList", "buttons");
    if (Array.isArray(buttons) && rows.length > 0) {
      rows[rows.length - 1].buttons = buttons.map((button) => ({
        text: String(dig(button, "text") ?? ""),
        parameters: buttonParameters(button),
      }));
      continue;
    }
    const paragraph = dig(widget, "textParagraph", "text");
    if (paragraph) notes.push(strip(paragraph));
  }

  return { title, subtitle, rows, notes };
}

/** Which of the five envelopes the door answered with. */
function classify(body: unknown): Answer {
  const message = dig(
    body,
    "hostAppDataAction",
    "chatDataAction",
    "createMessageAction",
    "message",
  );
  if (message) {
    const cards = dig(message, "cardsV2");
    return {
      kind: "message",
      privateTo: (dig(message, "privateMessageViewer", "name") as string | undefined) ?? null,
      text: (dig(message, "text") as string | undefined) ?? null,
      cards: Array.isArray(cards) ? cards.map(readCard) : [],
    };
  }

  const navigations = dig(body, "action", "navigations");
  const navigationRecord = Array.isArray(navigations) ? asRecord(navigations[0]) : null;

  if (navigationRecord) {
    for (const how of ["pushCard", "updateCard"] as const) {
      const card = navigationRecord[how];
      if (!card) continue;
      const view = readCard({ card });
      return {
        kind: "dialog",
        how,
        title: view.title || null,
        // A dialog is mostly inputs, which `readCard` doesn't turn into
        // rows, so the honest count is every widget in it.
        widgets: countWidgets(card),
        firstLine: view.notes[0] ?? view.rows[0]?.text ?? null,
      };
    }
    if (navigationRecord.endNavigation) {
      return {
        kind: "close",
        notification: (dig(body, "action", "notification", "text") as string | undefined) ?? null,
      };
    }
  }

  const record = asRecord(body);
  if (record && Object.keys(record).length === 0) return { kind: "empty" };
  return { kind: "unexpected", body };
}

/** Every widget in a dialog card, including the inputs `readCard` doesn't turn into rows. */
function countWidgets(card: unknown): number {
  const sections = dig(card, "sections");
  if (!Array.isArray(sections)) return 0;
  let total = 0;
  for (const section of sections) {
    const widgets = dig(section, "widgets");
    if (Array.isArray(widgets)) total += widgets.length;
  }
  return total;
}

// --- the transcript ------------------------------------------------------

let failures = 0;
let door: ((request: Request) => Promise<Response>) | null = null;

function line(label: string, said: string) {
  console.log(`${label.padEnd(22)} ${said}`);
}

function printAnswer(label: string, answer: Answer) {
  if (answer.kind === "message") {
    const privacy = answer.privateTo ? "private" : "to the space";
    const parts = [`message (${privacy})`];
    if (answer.text) parts.push(`"${answer.text}"`);
    if (answer.cards.length) parts.push(`${answer.cards.length} card`);
    line(label, parts.join(" · "));
    for (const card of answer.cards) {
      console.log(`${" ".repeat(23)}card "${card.title}" — ${card.subtitle}`);
      for (const row of card.rows) {
        const where = row.topLabel ? `${row.topLabel} | ` : "";
        console.log(
          `${" ".repeat(25)}${where}${row.text}${row.bottomLabel ? ` | ${row.bottomLabel}` : ""}`,
        );
        if (row.buttons.length) {
          console.log(
            `${" ".repeat(27)}buttons: ${row.buttons.map((button) => button.text).join(", ")}`,
          );
        }
      }
      for (const note of card.notes) console.log(`${" ".repeat(25)}${note}`);
    }
    return;
  }
  if (answer.kind === "dialog") {
    line(
      label,
      `dialog (${answer.how}) · ${answer.widgets} widget${answer.widgets === 1 ? "" : "s"}` +
        (answer.title ? ` · "${answer.title}"` : "") +
        (answer.firstLine ? ` · "${answer.firstLine}"` : ""),
    );
    return;
  }
  if (answer.kind === "close") {
    line(label, `close${answer.notification ? ` · private note "${answer.notification}"` : ""}`);
    return;
  }
  if (answer.kind === "empty") {
    line(label, "empty envelope {}");
    return;
  }
  line(label, "UNEXPECTED");
  console.log(JSON.stringify(answer.body, null, 2));
}

/**
 * One event through the door, exactly as Google would post it: a POST to
 * the registered audience with a JSON body. A throw, a status that isn't
 * 200 or a body that isn't JSON is a failure — the door's whole contract
 * is that it always answers Google with 200 and a well-formed envelope.
 */
async function deliver(label: string, event: ChatEvent): Promise<Answer | null> {
  if (!door) throw new Error("The door was not loaded.");

  const request = new Request(process.env.GOOGLE_CHAT_AUDIENCE as string, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(event),
  });

  let response: Response;
  try {
    response = await door(request);
  } catch (error) {
    failures += 1;
    line(label, `THREW — ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }

  if (response.status !== 200) {
    failures += 1;
    line(label, `HTTP ${response.status} — the door must always answer 200`);
    return null;
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    failures += 1;
    line(label, "the answer was not JSON");
    return null;
  }

  const answer = classify(body);
  if (answer.kind === "unexpected") failures += 1;
  printAnswer(label, answer);

  // The door's own apology is a well-formed 200 and the right kind of
  // envelope, so nothing above catches it — but it means a read failed,
  // which is exactly the sort of thing this script exists to notice.
  if (apologised(answer)) {
    failures += 1;
    line("", "^ the door apologised, so a read failed — this step counts as a failure");
  }
  return answer;
}

/** Did the door fall back on "Something went wrong on our side"? */
function apologised(answer: Answer): boolean {
  const said =
    answer.kind === "message"
      ? (answer.text ?? "")
      : answer.kind === "close"
        ? (answer.notification ?? "")
        : answer.kind === "dialog"
          ? (answer.firstLine ?? "")
          : "";
  return said.startsWith("Something went wrong on our side");
}

// --- the run -------------------------------------------------------------

/** The first row of a court card offering this action, and what its button would send. */
function findRow(
  answer: Answer | null,
  action: PressAction | "bounce",
): { row: CardRow; parameters: Record<string, string> } | null {
  if (!answer || answer.kind !== "message") return null;
  for (const card of answer.cards) {
    for (const row of card.rows) {
      for (const button of row.buttons) {
        if (button.parameters.action === action) return { row, parameters: button.parameters };
      }
    }
  }
  return null;
}

function describe(row: CardRow): string {
  return [row.topLabel, row.text, row.bottomLabel].filter(Boolean).join(" | ");
}

async function main() {
  const options = readOptions(process.argv.slice(2));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!supabaseUrl.includes(STAGING_REF)) {
    throw new Error(
      "This script only runs against the staging database.\n" +
        `NEXT_PUBLIC_SUPABASE_URL in .env.local must contain ${STAGING_REF}; it does not.\n` +
        "It can write as a real person, so it will not point anywhere else.",
    );
  }

  // Never verified here — the lock stays in route.ts — but every card the
  // door builds needs it for its buttons and its links.
  process.env.GOOGLE_CHAT_AUDIENCE ??= DEFAULT_AUDIENCE;

  console.log("Google Chat usage test");
  line("Database", `${STAGING_REF} (staging)`);
  line("Audience", process.env.GOOGLE_CHAT_AUDIENCE);
  line("Space", `${options.space} (${options.dm ? "direct message" : "space"})`);
  line("Acting as", options.as);
  line(
    "Card refresh key",
    process.env.GOOGLE_CHAT_SERVICE_ACCOUNT_KEY
      ? "set — a press will really call Google and log the result"
      : 'not set — a refresh logs "off"',
  );
  line(
    "Mode",
    options.commit ? "COMMIT — a press moves a real baton" : "dry run — nothing written",
  );
  console.log("");

  const loaded = await import("../lib/google-chat/dispatch");
  door = loaded.handleChatRequest;

  const court = await deliver("/court", commandEvent(options, COURT_COMMAND_ID, "/court", ""));
  await deliver("/trail villa", commandEvent(options, TRAIL_COMMAND_ID, "/trail villa", "villa"));
  await deliver("/newtrail", commandEvent(options, NEWTRAIL_COMMAND_ID, "/newtrail", "", true));
  await deliver("/link", commandEvent(options, LINK_COMMAND_ID, "/link", "", true));

  if (options.bounce) {
    const found = findRow(court, "bounce");
    if (!found) {
      line("Bounce dialog", "no row on the court offers Bounce — nothing to open");
    } else {
      line("Bounce on", describe(found.row));
      await deliver("Bounce dialog", pressEvent(options, found.parameters, true));
    }
  }

  if (options.press) {
    const found = findRow(court, options.press);
    if (!found) {
      line(`Press ${options.press}`, `no row on the court offers it — nothing pressed`);
    } else if (!options.commit) {
      line(`Press ${options.press} on`, describe(found.row));
      line(`Press ${options.press}`, "would press, but this is a dry run (add --commit)");
    } else {
      line(`Press ${options.press} on`, describe(found.row));
      await deliver(`Press ${options.press}`, pressEvent(options, found.parameters));
      // The same command again, so the transcript itself shows the move.
      await deliver("/court (after)", commandEvent(options, COURT_COMMAND_ID, "/court", ""));
    }
  }

  console.log("");
  if (failures > 0) {
    console.log(`${failures} step${failures === 1 ? "" : "s"} failed.`);
    process.exitCode = 1;
    return;
  }
  console.log("Every step answered 200 with an envelope of the expected kind.");
  console.log("Google is still the only judge of the card JSON — BUGCATCHER #17.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
