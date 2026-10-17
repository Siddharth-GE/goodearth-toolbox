/**
 * A usage test for the Google Chat door, run from this machine.
 *
 *   npm run chat:usage -- --as siddharth@goodearthkannur.org
 *   npm run chat:usage -- --as siddharth@goodearthkannur.org --dm --bounce
 *   npm run chat:usage -- --as siddharth@goodearthkannur.org --press push --commit
 *
 * Builds the envelopes Google sends (slash command, dialog request, button press) and hands
 * them to `handleChatRequest` (lib/google-chat/dispatch.ts) against STAGING as a named
 * person, so identity, reads, renderers, an act-as write and card refresh run for real.
 * It cannot prove Google accepts our JSON (BUGCATCHER #17); verify.ts (the lock) is never called.
 * Safety: it refuses any database but staging, because `--commit` moves a real baton.
 * The one write (`--press`) needs `--commit`. It prints no email but the one given.
 * Run it through the npm alias: google-chat-usage-loader.mjs stubs `server-only` and `next/cache`.
 */
import { config } from "dotenv";
import { resolve } from "node:path";

import { DATABASES } from "../lib/environment";
import type { ChatEvent } from "../lib/google-chat/events";

config({ path: resolve(import.meta.dirname, "..", ".env.local") });

const STAGING_REF = DATABASES.practice;

// The staging Chat app's registered endpoint. chatAudience() and chatOrigin()
// throw when unset. The lock never runs here, so it is a label, not a credential.
const DEFAULT_AUDIENCE = "https://staging.goodearthkannur.org/api/google-chat";

const DEFAULT_SPACE = "spaces/USAGE-TEST";

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

// A typed slash command. Google sends the int64 command id as a string, so this does too.
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

// A press on one of the bot's own card buttons. The sender is the bot and the
// person is in `chat.user` (BUGCATCHER #17 trap (k)). The card name is fake,
// so the refresh path runs to Google and its log line says whether the key works.
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

// A card's widgets as rows: a `decoratedText` starts a row and the following
// `buttonList` belongs to it, as in `rowWidgets` in cards.ts. Anything else is a note.
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
        // A dialog is mostly inputs that `readCard` skips, so count every widget.
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

// One event through the door as Google would post it. A throw, a non-200 or a
// non-JSON body fails: the door must always answer 200 with a well-formed envelope.
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

  // The door's apology is a well-formed 200, so nothing above catches it, but it means a read failed.
  if (apologised(answer)) {
    failures += 1;
    line("", "^ the door apologised, so a read failed — this step counts as a failure");
  }
  return answer;
}

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

  // Never verified here (the lock stays in route.ts); cards need it for buttons and links.
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
      // The same command again, so the transcript shows the move.
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
