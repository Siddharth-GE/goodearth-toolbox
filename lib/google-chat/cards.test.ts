/**
 * Pins the bot's fixed sentences — one assertion per refusal, both
 * greeting shapes, and a check that none of them leaks an email address.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  askForWords,
  bounceDialog,
  bouncedText,
  cannotActNow,
  courtCard,
  customDepartmentsNote,
  dialogNotEnabled,
  dmCannotLink,
  doneText,
  finishedText,
  greeting,
  heldText,
  identityRefusal,
  joinHello,
  linkConfirmation,
  linkDialog,
  newTrailDialog,
  newTrailNeedsDialog,
  noticeDialog,
  linkSaveFailed,
  openedText,
  pushedText,
  returnedText,
  trailCard,
  trailStepsDialog,
  type LinkTarget,
  type RefusalKind,
} from "./cards";
import { CUSTOM_SET, DEFAULT_CUSTOM_STEPS, MAX_CUSTOM_STEPS } from "./trail-rules";
import type { LegOption, StepDefault, TrailSetOption, TrailSummary } from "./trail-rules";

const SUBMIT_URL = "https://example.test/api/google-chat";

test("no-email refusal", () => {
  assert.equal(
    identityRefusal("no-email"),
    "Google didn't tell me who you are, so I can't act for you. Ask an admin to check the Relay bot.",
  );
});

test("unknown refusal", () => {
  assert.equal(
    identityRefusal("unknown"),
    "I don't know you yet: there's no toolbox account for this email. Ask an admin in Settings.",
  );
});

test("inactive refusal", () => {
  assert.equal(
    identityRefusal("inactive"),
    "Your toolbox account is switched off, so I can't act for you. Ask an admin in Settings.",
  );
});

test("no-relay refusal", () => {
  assert.equal(
    identityRefusal("no-relay"),
    "You don't have the Relay tool yet. Ask an admin to grant it in Settings.",
  );
});

test("failed refusal", () => {
  assert.equal(
    identityRefusal("failed"),
    "I couldn't check who you are just now. Please try again in a moment.",
  );
});

test("greeting names the command when one was typed", () => {
  assert.equal(
    greeting("Siddharth", "/court"),
    "Hi Siddharth! I heard /court — it isn't wired up yet, but now I know who's asking.",
  );
});

test("greeting without a command points at /court and /trail", () => {
  assert.equal(
    greeting("Siddharth", null),
    "Hi Siddharth! Try /court to see what's in your hand, or /trail followed by a villa name.",
  );
});

test("no refusal and no greeting ever contains an email", () => {
  const kinds: RefusalKind[] = ["no-email", "unknown", "inactive", "no-relay", "failed"];
  for (const kind of kinds) {
    assert.ok(!identityRefusal(kind).includes("@"));
  }
  assert.ok(!greeting("Siddharth", "/court").includes("@"));
  assert.ok(!greeting("there", null).includes("@"));
});

test("joinHello with a label names it and points at /link", () => {
  assert.equal(
    joinHello("Saarang · Villa 12"),
    "Hello! I'm the Relay bot. I've linked this space to Saarang · Villa 12. Commands here default to it; /link changes that.",
  );
});

test("joinHello without a label explains /link", () => {
  assert.equal(
    joinHello(null),
    "Hello! I'm the Relay bot. Use /link to tell me which villa or project this space is for — until then, commands here span everything.",
  );
});

test("dmCannotLink", () => {
  assert.equal(dmCannotLink(), "A DM can't be linked — commands here already span everything.");
});

test("dialogNotEnabled", () => {
  assert.equal(
    dialogNotEnabled(),
    "The /link command needs 'Opens a dialog' ticked in the Chat app's configuration — an admin can do that in the Google Cloud console.",
  );
});

test("linkSaveFailed", () => {
  assert.equal(linkSaveFailed(), "I couldn't save that just now. Please try again in a moment.");
});

test("linkConfirmation with a label", () => {
  assert.equal(
    linkConfirmation("Saarang (whole project)"),
    "This space is now linked to Saarang (whole project).",
  );
});

test("linkConfirmation without a label", () => {
  assert.equal(
    linkConfirmation(null),
    "This space is no longer linked — commands here span everything.",
  );
});

test("linkDialog shapes a dropdown named target with one Save button", () => {
  const targets: LinkTarget[] = [
    { value: "none", text: "Not linked — commands here span everything" },
    { value: "project:1", text: "Saarang (whole project)" },
    { value: "unit:2", text: "Saarang · Villa 12" },
  ];
  const dialog = linkDialog(targets, "unit:2", "https://example.test/api/google-chat") as {
    sections: {
      widgets: [
        {
          selectionInput: {
            name: string;
            label: string;
            type: string;
            items: { text: string; value: string; selected: boolean }[];
          };
        },
        { buttonList: { buttons: { text: string; onClick: { action: { function: string } } }[] } },
      ];
    }[];
  };

  const [section] = dialog.sections;
  const [selectionWidget, buttonWidget] = section.widgets;

  assert.equal(selectionWidget.selectionInput.name, "target");
  assert.equal(selectionWidget.selectionInput.label, "Link this space to");
  assert.equal(selectionWidget.selectionInput.type, "DROPDOWN");
  assert.deepEqual(
    selectionWidget.selectionInput.items.map((i) => [i.value, i.text]),
    [
      ["none", "Not linked — commands here span everything"],
      ["project:1", "Saarang (whole project)"],
      ["unit:2", "Saarang · Villa 12"],
    ],
  );

  assert.equal(buttonWidget.buttonList.buttons.length, 1);
  assert.equal(buttonWidget.buttonList.buttons[0].text, "Save");
  assert.equal(
    buttonWidget.buttonList.buttons[0].onClick.action.function,
    "https://example.test/api/google-chat",
  );
});

test("linkDialog selects exactly the current item", () => {
  const targets: LinkTarget[] = [
    { value: "none", text: "Not linked" },
    { value: "project:1", text: "Saarang" },
    { value: "unit:2", text: "Saarang · Villa 12" },
  ];
  const dialog = linkDialog(targets, "project:1", "https://example.test/api/google-chat") as {
    sections: {
      widgets: [{ selectionInput: { items: { value: string; selected: boolean }[] } }, unknown];
    }[];
  };

  const items = dialog.sections[0].widgets[0].selectionInput.items;
  const selected = items.filter((i) => i.selected);

  assert.equal(selected.length, 1);
  assert.equal(selected[0].value, "project:1");
});

test("none of the Phase 4 sentences contains an email", () => {
  assert.ok(!joinHello("Saarang · Villa 12").includes("@"));
  assert.ok(!joinHello(null).includes("@"));
  assert.ok(!dmCannotLink().includes("@"));
  assert.ok(!dialogNotEnabled().includes("@"));
  assert.ok(!linkSaveFailed().includes("@"));
  assert.ok(!linkConfirmation("Saarang (whole project)").includes("@"));
  assert.ok(!linkConfirmation(null).includes("@"));
});

test("noticeDialog is one paragraph and nothing else", () => {
  const dialog = noticeDialog("A DM can't be linked.") as {
    sections: { widgets: { textParagraph: { text: string } }[] }[];
  };
  assert.equal(dialog.sections.length, 1);
  assert.equal(dialog.sections[0].widgets.length, 1);
  assert.equal(dialog.sections[0].widgets[0].textParagraph.text, "A DM can't be linked.");
});

// --- Phase 5: /court and /trail cards --------------------------------

type CardButton = {
  text: string;
  onClick: {
    openLink?: { url: string };
    action?: {
      function: string;
      parameters: { key: string; value: string }[];
      interaction?: string;
    };
  };
};

type Widget =
  | { decoratedText: Record<string, unknown> }
  | { buttonList: { buttons: CardButton[] } }
  | { textParagraph: { text: string } }
  | { selectionInput: Record<string, unknown> }
  | { textInput: Record<string, unknown> };

type ChatCard = {
  cardId?: string;
  card?: { header: { title: string; subtitle: string }; sections: { widgets: Widget[] }[] };
  sections?: { widgets: Widget[] }[];
};

function widgetsOf(built: Record<string, unknown>): Widget[] {
  const card = built as ChatCard;
  const sections = card.card?.sections ?? card.sections ?? [];
  return sections.flatMap((s) => s.widgets);
}

function decoratedTexts(built: Record<string, unknown>) {
  return widgetsOf(built)
    .filter(
      (w): w is Extract<Widget, { decoratedText: Record<string, unknown> }> => "decoratedText" in w,
    )
    .map((w) => w.decoratedText as { topLabel: string; text: string; bottomLabel: string });
}

function paragraphs(built: Record<string, unknown>) {
  return widgetsOf(built)
    .filter((w): w is Extract<Widget, { textParagraph: unknown }> => "textParagraph" in w)
    .map((w) => w.textParagraph.text);
}

/** Every row's buttonList, in card order — one array of buttons per trail row. */
function buttonLists(built: Record<string, unknown>): CardButton[][] {
  return widgetsOf(built)
    .filter((w): w is Extract<Widget, { buttonList: unknown }> => "buttonList" in w)
    .map((w) => w.buttonList.buttons);
}

/** The Open in the toolbox link out of each row — always the buttonList's last button. */
function openLinks(built: Record<string, unknown>) {
  return buttonLists(built).map((buttons) => buttons[buttons.length - 1].onClick.openLink?.url);
}

function headerOf(built: Record<string, unknown>) {
  return (built as ChatCard).card!.header;
}

function selectionInputs(built: Record<string, unknown>) {
  return widgetsOf(built)
    .filter(
      (w): w is Extract<Widget, { selectionInput: Record<string, unknown> }> =>
        "selectionInput" in w,
    )
    .map((w) => w.selectionInput);
}

function textInputs(built: Record<string, unknown>) {
  return widgetsOf(built)
    .filter((w): w is Extract<Widget, { textInput: Record<string, unknown> }> => "textInput" in w)
    .map((w) => w.textInput);
}

function row(overrides: Partial<TrailSummary> = {}): TrailSummary {
  return {
    chainId: "c1",
    projectId: "p-saarang",
    projectName: "Saarang",
    unitId: "u-villa-12",
    unitName: "Villa 12",
    activityName: "Structural drawings",
    title: null,
    currentLeg: 2,
    legCount: 5,
    legLabel: "Structural drawings",
    holderName: "Anil",
    daysInLeg: 4,
    expectedDays: 3,
    isStuck: true,
    isWithClient: false,
    withClientDays: 0,
    ...overrides,
  };
}

const ORIGIN = "https://staging.goodearthkannur.org";

test("askForWords", () => {
  assert.equal(
    askForWords(),
    "Tell me what to look for — a villa, a project or an activity, e.g. /trail villa 12.",
  );
});

test("courtCard: on time", () => {
  const built = courtCard({
    firstName: "Siddharth",
    scopeLabel: null,
    rows: [row({ isStuck: false, isWithClient: false, daysInLeg: 2, expectedDays: 3 })],
    more: 0,
    moreElsewhere: 0,
    origin: ORIGIN,
    submitUrl: SUBMIT_URL,
  });
  assert.match(decoratedTexts(built)[0].bottomLabel, /day 2 of 3, on time$/);
});

test("courtCard: cold", () => {
  const built = courtCard({
    firstName: "Siddharth",
    scopeLabel: null,
    rows: [row({ isStuck: true, isWithClient: false, daysInLeg: 4, expectedDays: 3 })],
    more: 0,
    moreElsewhere: 0,
    origin: ORIGIN,
    submitUrl: SUBMIT_URL,
  });
  assert.match(decoratedTexts(built)[0].bottomLabel, /day 4 of 3, cold$/);
});

test("courtCard: with the client", () => {
  const built = courtCard({
    firstName: "Siddharth",
    scopeLabel: null,
    rows: [
      row({ isStuck: false, isWithClient: true, withClientDays: 4, daysInLeg: 6, expectedDays: 3 }),
    ],
    more: 0,
    moreElsewhere: 0,
    origin: ORIGIN,
    submitUrl: SUBMIT_URL,
  });
  assert.match(decoratedTexts(built)[0].bottomLabel, /day 6 of 3, with the client 4 days$/);
});

test("courtCard: cold and with the client at once", () => {
  const built = courtCard({
    firstName: "Siddharth",
    scopeLabel: null,
    rows: [
      row({ isStuck: true, isWithClient: true, withClientDays: 4, daysInLeg: 6, expectedDays: 3 }),
    ],
    more: 0,
    moreElsewhere: 0,
    origin: ORIGIN,
    submitUrl: SUBMIT_URL,
  });
  assert.match(decoratedTexts(built)[0].bottomLabel, /cold, with the client 4 days$/);
});

test("courtCard: a single with-client day is not pluralised", () => {
  const built = courtCard({
    firstName: "Siddharth",
    scopeLabel: null,
    rows: [row({ isStuck: false, isWithClient: true, withClientDays: 1 })],
    more: 0,
    moreElsewhere: 0,
    origin: ORIGIN,
    submitUrl: SUBMIT_URL,
  });
  assert.match(decoratedTexts(built)[0].bottomLabel, /with the client 1 day$/);
});

test("courtCard: leg number and label lead the bottom label, label omitted when null", () => {
  const withLabel = courtCard({
    firstName: "S",
    scopeLabel: null,
    rows: [row({ currentLeg: 2, legCount: 5, legLabel: "Structural drawings" })],
    more: 0,
    moreElsewhere: 0,
    origin: ORIGIN,
    submitUrl: SUBMIT_URL,
  });
  assert.match(decoratedTexts(withLabel)[0].bottomLabel, /^Leg 2 of 5 · Structural drawings —/);

  const withoutLabel = courtCard({
    firstName: "S",
    scopeLabel: null,
    rows: [row({ currentLeg: 2, legCount: 5, legLabel: null })],
    more: 0,
    moreElsewhere: 0,
    origin: ORIGIN,
    submitUrl: SUBMIT_URL,
  });
  assert.match(decoratedTexts(withoutLabel)[0].bottomLabel, /^Leg 2 of 5 —/);
});

test("courtCard: an empty court says the app's own sentence", () => {
  const built = courtCard({
    firstName: "Siddharth",
    scopeLabel: null,
    rows: [],
    more: 0,
    moreElsewhere: 0,
    origin: ORIGIN,
    submitUrl: SUBMIT_URL,
  });
  assert.deepEqual(paragraphs(built), ["Court cleared — nothing is waiting on you."]);
});

test("courtCard: header names the scope, or everything", () => {
  const everything = courtCard({
    firstName: "S",
    scopeLabel: null,
    rows: [],
    more: 0,
    moreElsewhere: 0,
    origin: ORIGIN,
    submitUrl: SUBMIT_URL,
  });
  assert.equal(headerOf(everything).title, "Your court");
  assert.equal(headerOf(everything).subtitle, "everything");

  const scoped = courtCard({
    firstName: "S",
    scopeLabel: "Saarang · Villa 12",
    rows: [],
    more: 0,
    moreElsewhere: 0,
    origin: ORIGIN,
    submitUrl: SUBMIT_URL,
  });
  assert.equal(headerOf(scoped).subtitle, "Saarang · Villa 12");
});

test("courtCard: more and moreElsewhere footers, singular and plural", () => {
  const one = courtCard({
    firstName: "S",
    scopeLabel: "Saarang · Villa 12",
    rows: [row()],
    more: 3,
    moreElsewhere: 1,
    origin: ORIGIN,
    submitUrl: SUBMIT_URL,
  });
  const lines = paragraphs(one);
  assert.ok(lines.some((line) => line.startsWith("and 3 more —") && line.includes(ORIGIN)));
  assert.ok(lines.includes("You also hold 1 trail outside this space."));

  const many = courtCard({
    firstName: "S",
    scopeLabel: "Saarang · Villa 12",
    rows: [row()],
    more: 0,
    moreElsewhere: 5,
    origin: ORIGIN,
    submitUrl: SUBMIT_URL,
  });
  assert.ok(paragraphs(many).includes("You also hold 5 trails outside this space."));
});

test("courtCard: every row's link lands on that trail, on the given origin", () => {
  const built = courtCard({
    firstName: "S",
    scopeLabel: null,
    rows: [row({ chainId: "c-42" })],
    more: 0,
    moreElsewhere: 0,
    origin: ORIGIN,
    submitUrl: SUBMIT_URL,
  });
  assert.deepEqual(openLinks(built), [`${ORIGIN}/relay/trails/c-42`]);
});

test("trailCard: the bottom label keeps the leg and adds who holds it, Unnamed when there is none", () => {
  const withHolder = trailCard({
    words: ["villa"],
    scopeLabel: null,
    rows: [
      row({
        currentLeg: 2,
        legCount: 5,
        legLabel: "Structural drawings",
        holderName: "Anil",
        isStuck: true,
        daysInLeg: 4,
        expectedDays: 3,
      }),
    ],
    more: 0,
    origin: ORIGIN,
  });
  assert.equal(
    decoratedTexts(withHolder)[0].bottomLabel,
    "Leg 2 of 5 · Structural drawings · with Anil — day 4 of 3, cold",
  );

  const noHolder = trailCard({
    words: ["villa"],
    scopeLabel: null,
    rows: [row({ holderName: null })],
    more: 0,
    origin: ORIGIN,
  });
  assert.match(decoratedTexts(noHolder)[0].bottomLabel, /· with Unnamed —/);
});

test("trailCard: subtitle names the words searched, or the scope", () => {
  const searched = trailCard({
    words: ["villa", "12"],
    scopeLabel: null,
    rows: [],
    more: 0,
    origin: ORIGIN,
  });
  assert.equal(headerOf(searched).subtitle, "matching 'villa 12'");

  const scoped = trailCard({
    words: [],
    scopeLabel: "Saarang · Villa 12",
    rows: [],
    more: 0,
    origin: ORIGIN,
  });
  assert.equal(headerOf(scoped).subtitle, "Saarang · Villa 12");

  const everything = trailCard({ words: [], scopeLabel: null, rows: [], more: 0, origin: ORIGIN });
  assert.equal(headerOf(everything).subtitle, "everything");
});

test("trailCard: no words and nothing running says so plainly", () => {
  const built = trailCard({
    words: [],
    scopeLabel: "Saarang · Villa 12",
    rows: [],
    more: 0,
    origin: ORIGIN,
  });
  assert.deepEqual(paragraphs(built), ["Nothing is running here right now."]);
});

test("trailCard: words with no match names them and links the toolbox", () => {
  const built = trailCard({
    words: ["villa", "12"],
    scopeLabel: null,
    rows: [],
    more: 0,
    origin: ORIGIN,
  });
  const [text] = paragraphs(built);
  assert.match(text, /^Nothing running matches 'villa 12'\./);
  assert.match(text, new RegExp(`href="${ORIGIN}/relay/trails"`));
});

test("trailCard: more matches link the toolbox too", () => {
  const built = trailCard({
    words: ["villa"],
    scopeLabel: null,
    rows: [row()],
    more: 4,
    origin: ORIGIN,
  });
  const lines = paragraphs(built);
  assert.ok(lines.some((line) => line.startsWith("and 4 more —") && line.includes(ORIGIN)));
});

test("cards escape a title or search word that carries HTML-special characters", () => {
  const built = trailCard({
    words: ["<script>"],
    scopeLabel: null,
    rows: [row({ title: "Plan A < Plan B", projectName: "R&D wing" })],
    more: 0,
    origin: ORIGIN,
  });

  const [decorated] = decoratedTexts(built);
  assert.ok(decorated.text.includes("Plan A &lt; Plan B"));
  assert.ok(decorated.topLabel.includes("R&amp;D wing"));
  assert.ok(!decorated.text.includes("Plan A < Plan B"));

  const empty = trailCard({
    words: ["<script>"],
    scopeLabel: null,
    rows: [],
    more: 0,
    origin: ORIGIN,
  });
  const [text] = paragraphs(empty);
  assert.ok(text.includes("&lt;script&gt;"));
  assert.ok(!text.includes("<script>"));
});

test("row text: a title shows under the activity only when it says something new", () => {
  const withTitle = courtCard({
    firstName: "Sid",
    scopeLabel: null,
    rows: [row({ title: "Ground floor" })],
    more: 0,
    moreElsewhere: 0,
    origin: ORIGIN,
    submitUrl: SUBMIT_URL,
  });
  assert.equal(decoratedTexts(withTitle)[0].text, "<b>Structural drawings</b><br>Ground floor");

  const repeated = courtCard({
    firstName: "Sid",
    scopeLabel: null,
    rows: [row({ activityName: "Standard villa", title: "standard villa " })],
    more: 0,
    moreElsewhere: 0,
    origin: ORIGIN,
    submitUrl: SUBMIT_URL,
  });
  assert.equal(decoratedTexts(repeated)[0].text, "<b>Standard villa</b>");
});

// --- Phase 6/7: action buttons, the two dialogs, and every write sentence --

test("courtCard: a row's buttons follow buttonsFor for its state, Open in the toolbox last", () => {
  const built = courtCard({
    firstName: "S",
    scopeLabel: null,
    rows: [row({ currentLeg: 2, legCount: 5, isWithClient: false })],
    more: 0,
    moreElsewhere: 0,
    origin: ORIGIN,
    submitUrl: SUBMIT_URL,
  });
  const [buttons] = buttonLists(built);
  assert.deepEqual(
    buttons.map((b) => b.text),
    ["Push", "Bounce", "With client", "Open in the toolbox"],
  );
});

test("courtCard: a queued row (no current leg) offers only Open in the toolbox", () => {
  const built = courtCard({
    firstName: "S",
    scopeLabel: null,
    rows: [row({ currentLeg: null })],
    more: 0,
    moreElsewhere: 0,
    origin: ORIGIN,
    submitUrl: SUBMIT_URL,
  });
  const [buttons] = buttonLists(built);
  assert.deepEqual(
    buttons.map((b) => b.text),
    ["Open in the toolbox"],
  );
});

test("courtCard: the last leg offers Finish instead of Push", () => {
  const built = courtCard({
    firstName: "S",
    scopeLabel: null,
    rows: [row({ currentLeg: 5, legCount: 5, isWithClient: false })],
    more: 0,
    moreElsewhere: 0,
    origin: ORIGIN,
    submitUrl: SUBMIT_URL,
  });
  const [buttons] = buttonLists(built);
  assert.deepEqual(
    buttons.map((b) => b.text),
    ["Finish", "Bounce", "With client", "Open in the toolbox"],
  );
});

test("courtCard: with the client swaps 'With client' for 'Back from client'", () => {
  const built = courtCard({
    firstName: "S",
    scopeLabel: null,
    rows: [row({ currentLeg: 2, legCount: 5, isWithClient: true })],
    more: 0,
    moreElsewhere: 0,
    origin: ORIGIN,
    submitUrl: SUBMIT_URL,
  });
  const [buttons] = buttonLists(built);
  assert.deepEqual(
    buttons.map((b) => b.text),
    ["Push", "Bounce", "Back from client", "Open in the toolbox"],
  );
});

test("courtCard: Bounce alone opens a dialog; every other button acts straight away", () => {
  const built = courtCard({
    firstName: "S",
    scopeLabel: null,
    rows: [row({ currentLeg: 2, legCount: 5, isWithClient: false })],
    more: 0,
    moreElsewhere: 0,
    origin: ORIGIN,
    submitUrl: SUBMIT_URL,
  });
  const [buttons] = buttonLists(built);
  for (const button of buttons) {
    // The marker lives INSIDE the action: one level up, Google rejects
    // the whole card (trap (i)).
    if (button.text === "Bounce") {
      assert.equal(button.onClick.action?.interaction, "OPEN_DIALOG");
    } else {
      assert.equal(button.onClick.action?.interaction, undefined);
    }
  }
});

test("courtCard: every action button carries action/chain/leg; Open in the toolbox carries an openLink instead", () => {
  const built = courtCard({
    firstName: "S",
    scopeLabel: null,
    rows: [row({ chainId: "c-9", currentLeg: 2, legCount: 5, isWithClient: false })],
    more: 0,
    moreElsewhere: 0,
    origin: ORIGIN,
    submitUrl: SUBMIT_URL,
  });
  const [buttons] = buttonLists(built);
  const [push, bounce, hold, open] = buttons;

  assert.equal(push.onClick.action?.function, SUBMIT_URL);
  assert.deepEqual(push.onClick.action?.parameters, [
    { key: "action", value: "push" },
    { key: "chain", value: "c-9" },
    { key: "leg", value: "2" },
  ]);
  assert.deepEqual(bounce.onClick.action?.parameters, [
    { key: "action", value: "bounce" },
    { key: "chain", value: "c-9" },
    { key: "leg", value: "2" },
  ]);
  assert.deepEqual(hold.onClick.action?.parameters, [
    { key: "action", value: "hold" },
    { key: "chain", value: "c-9" },
    { key: "leg", value: "2" },
  ]);
  assert.equal(open.onClick.action, undefined);
  assert.equal(open.onClick.openLink?.url, `${ORIGIN}/relay/trails/c-9`);
});

test("trailCard rows carry only the Open in the toolbox link, no action buttons", () => {
  const built = trailCard({
    words: [],
    scopeLabel: null,
    rows: [row({ currentLeg: 2, legCount: 5, isWithClient: false })],
    more: 0,
    origin: ORIGIN,
  });
  const [buttons] = buttonLists(built);
  assert.deepEqual(
    buttons.map((b) => b.text),
    ["Open in the toolbox"],
  );
});

function legOption(overrides: Partial<LegOption> = {}): LegOption {
  return { legNo: 1, label: "Client sign-off", assigneeName: "Anil", ...overrides };
}

test("bounceDialog: names the trail and its current leg", () => {
  const dialog = bounceDialog({
    trail: row({ activityName: "Standard villa", currentLeg: 3, legCount: 8 }),
    legs: [legOption()],
    submitUrl: SUBMIT_URL,
  });
  const [paragraph] = paragraphs(dialog);
  assert.match(paragraph, /Standard villa/);
  assert.match(paragraph, /leg 3 of 8/);
});

test("bounceDialog: the to_leg dropdown lists every leg given, the last one selected", () => {
  const dialog = bounceDialog({
    trail: row({ currentLeg: 3, legCount: 8 }),
    legs: [
      { legNo: 1, label: "Intake", assigneeName: "Priya" },
      { legNo: 2, label: "Client sign-off", assigneeName: "Anil" },
    ],
    submitUrl: SUBMIT_URL,
  });
  const [toLeg] = selectionInputs(dialog) as {
    name: string;
    label: string;
    items: { text: string; value: string; selected: boolean }[];
  }[];
  assert.equal(toLeg.name, "to_leg");
  assert.equal(toLeg.label, "Send it back to");
  assert.deepEqual(
    toLeg.items.map((i) => [i.text, i.value, i.selected]),
    [
      ["Leg 1 · Intake · Priya", "1", false],
      ["Leg 2 · Client sign-off · Anil", "2", true],
    ],
  );
});

test("bounceDialog: a leg with no label or no assignee still reads plainly", () => {
  const dialog = bounceDialog({
    trail: row({ currentLeg: 2, legCount: 8 }),
    legs: [{ legNo: 1, label: null, assigneeName: null }],
    submitUrl: SUBMIT_URL,
  });
  const [toLeg] = selectionInputs(dialog) as { items: { text: string }[] }[];
  assert.equal(toLeg.items[0].text, "Leg 1 · Unnamed");
});

test("bounceDialog: builds even with an empty legs list", () => {
  const dialog = bounceDialog({
    trail: row({ currentLeg: 1, legCount: 5 }),
    legs: [],
    submitUrl: SUBMIT_URL,
  });
  const [toLeg] = selectionInputs(dialog) as { items: unknown[] }[];
  assert.deepEqual(toLeg.items, []);
});

test("bounceDialog: the reason dropdown lists BOUNCE_REASONS in order, none selected", () => {
  const dialog = bounceDialog({
    trail: row({ currentLeg: 3, legCount: 8 }),
    legs: [legOption()],
    submitUrl: SUBMIT_URL,
  });
  const [, reasonInput] = selectionInputs(dialog) as {
    name: string;
    label: string;
    items: { text: string; value: string; selected: boolean }[];
  }[];
  assert.equal(reasonInput.name, "reason");
  assert.equal(reasonInput.label, "Reason");
  assert.deepEqual(
    reasonInput.items.map((i) => i.value),
    ["rework", "missing_info", "wrong_person", "client_change", "other"],
  );
  assert.ok(reasonInput.items.every((i) => i.selected === false));
});

test("bounceDialog: the note is a required multi-line input with the right hint", () => {
  const dialog = bounceDialog({
    trail: row({ currentLeg: 3, legCount: 8 }),
    legs: [legOption()],
    submitUrl: SUBMIT_URL,
  });
  const [note] = textInputs(dialog) as {
    name: string;
    label: string;
    type: string;
    hintText: string;
  }[];
  assert.equal(note.name, "note");
  assert.equal(note.label, "What needs to change");
  assert.equal(note.type, "MULTIPLE_LINE");
  assert.equal(note.hintText, "A bounce is never silent.");
});

test("bounceDialog: Save posts action bounce with the trail's chain and current leg", () => {
  const dialog = bounceDialog({
    trail: row({ chainId: "c-7", currentLeg: 3, legCount: 8 }),
    legs: [legOption()],
    submitUrl: SUBMIT_URL,
  });
  const [buttons] = buttonLists(dialog);
  const [save] = buttons;
  assert.equal(save.text, "Save");
  assert.equal(save.onClick.action?.function, SUBMIT_URL);
  assert.deepEqual(save.onClick.action?.parameters, [
    { key: "action", value: "bounce" },
    { key: "chain", value: "c-7" },
    { key: "leg", value: "3" },
  ]);
});

function trailSetOption(overrides: Partial<TrailSetOption> = {}): TrailSetOption {
  return { id: "set-1", name: "Standard villa", ...overrides };
}

test("newTrailDialog: unit dropdown lists every unit, pre-selecting the given one", () => {
  const dialog = newTrailDialog({
    units: [
      { value: "u-1", text: "Saarang · Villa 1" },
      { value: "u-12", text: "Saarang · Villa 12" },
    ],
    sets: [trailSetOption()],
    selectedUnit: "u-12",
    submitUrl: SUBMIT_URL,
  });
  const [unitInput] = selectionInputs(dialog) as {
    name: string;
    label: string;
    items: { text: string; value: string; selected: boolean }[];
  }[];
  assert.equal(unitInput.name, "unit");
  assert.equal(unitInput.label, "Which house");
  assert.deepEqual(
    unitInput.items.map((i) => [i.value, i.selected]),
    [
      ["u-1", false],
      ["u-12", true],
    ],
  );
});

test("newTrailDialog: no selectedUnit pre-selects nothing", () => {
  const dialog = newTrailDialog({
    units: [{ value: "u-1", text: "Saarang · Villa 1" }],
    sets: [trailSetOption()],
    selectedUnit: null,
    submitUrl: SUBMIT_URL,
  });
  const [unitInput] = selectionInputs(dialog) as { items: { selected: boolean }[] }[];
  assert.ok(unitInput.items.every((i) => i.selected === false));
});

test("newTrailDialog: trail type dropdown lists every set, none pre-selected", () => {
  const dialog = newTrailDialog({
    units: [{ value: "u-1", text: "Saarang · Villa 1" }],
    sets: [
      trailSetOption({ id: "s1", name: "Standard villa" }),
      trailSetOption({ id: "s2", name: "Fast track" }),
    ],
    selectedUnit: "u-1",
    submitUrl: SUBMIT_URL,
  });
  const [, setInput] = selectionInputs(dialog) as {
    name: string;
    label: string;
    items: { text: string; value: string; selected: boolean }[];
  }[];
  assert.equal(setInput.name, "set");
  assert.equal(setInput.label, "Trail type");
  assert.deepEqual(
    setInput.items.map((i) => [i.text, i.value]),
    [
      ["Custom — I'll pick the steps", CUSTOM_SET],
      ["Standard villa", "s1"],
      ["Fast track", "s2"],
    ],
  );
  assert.ok(setInput.items.every((i) => i.selected === false));
});

test("newTrailDialog: the start switch defaults on", () => {
  const dialog = newTrailDialog({
    units: [{ value: "u-1", text: "Saarang · Villa 1" }],
    sets: [trailSetOption()],
    selectedUnit: "u-1",
    submitUrl: SUBMIT_URL,
  });
  const decoratedWidgets = widgetsOf(dialog).filter(
    (w): w is { decoratedText: Record<string, unknown> } => "decoratedText" in w,
  );
  // index 0 is "Choose the people myself" (Phase 7b); "Start now" is second.
  const decorated = decoratedWidgets[1].decoratedText as {
    text: string;
    bottomLabel: string;
    switchControl: { name: string; value: string; selected: boolean; controlType: string };
  };
  assert.equal(decorated.text, "Start now");
  assert.deepEqual(decorated.switchControl, {
    name: "start",
    value: "on",
    selected: true,
    controlType: "SWITCH",
  });
});

test("newTrailDialog: Save posts action newtrail", () => {
  const dialog = newTrailDialog({
    units: [{ value: "u-1", text: "Saarang · Villa 1" }],
    sets: [trailSetOption()],
    selectedUnit: "u-1",
    submitUrl: SUBMIT_URL,
  });
  const [buttons] = buttonLists(dialog);
  const [save] = buttons;
  assert.equal(save.text, "Save");
  assert.equal(save.onClick.action?.function, SUBMIT_URL);
  assert.deepEqual(save.onClick.action?.parameters, [{ key: "action", value: "newtrail" }]);
});

function pushedRow(overrides: Partial<TrailSummary> = {}): TrailSummary {
  return row({
    activityName: "Standard villa",
    projectName: "Saarang",
    unitName: "Villa 12",
    currentLeg: 3,
    legCount: 8,
    legLabel: "Client sign-off",
    holderName: "Anil",
    ...overrides,
  });
}

test("pushedText", () => {
  assert.equal(
    pushedText("Sid", pushedRow()),
    "*Sid* pushed *Standard villa* on Villa 12 to leg 3 of 8 · Client sign-off — now with Anil.",
  );
});

test("pushedText: no leg label, no holder, no unit are each omitted or worded gracefully", () => {
  assert.equal(
    pushedText("Sid", pushedRow({ legLabel: null })),
    "*Sid* pushed *Standard villa* on Villa 12 to leg 3 of 8 — now with Anil.",
  );
  assert.equal(
    pushedText("Sid", pushedRow({ holderName: null })),
    "*Sid* pushed *Standard villa* on Villa 12 to leg 3 of 8 · Client sign-off — now with nobody named.",
  );
  assert.equal(
    pushedText("Sid", pushedRow({ unitName: null })),
    "*Sid* pushed *Standard villa* on Saarang to leg 3 of 8 · Client sign-off — now with Anil.",
  );
});

test("finishedText", () => {
  assert.equal(finishedText("Sid", pushedRow()), "*Sid* finished *Standard villa* on Villa 12 🎉");
});

test("bouncedText", () => {
  assert.equal(
    bouncedText("Sid", pushedRow({ currentLeg: 1 }), "Rework needed", "Wrong finish colour"),
    "*Sid* bounced *Standard villa* on Villa 12 back to leg 1 of 8 · Client sign-off — with Anil. Rework needed: Wrong finish colour",
  );
});

test("heldText", () => {
  assert.equal(
    heldText("Sid", pushedRow()),
    "*Sid* marked *Standard villa* on Villa 12 as with the client.",
  );
});

test("returnedText", () => {
  assert.equal(
    returnedText("Sid", pushedRow()),
    "*Sid* took *Standard villa* on Villa 12 back from the client.",
  );
});

test("openedText: a started trail names the leg it landed on", () => {
  assert.equal(
    openedText("Sid", pushedRow({ currentLeg: 1 })),
    "*Sid* opened *Standard villa* on Villa 12 — leg 1 of 8 · Client sign-off, with Anil.",
  );
});

test("openedText: a queued trail says so instead of naming a leg", () => {
  assert.equal(
    openedText("Sid", pushedRow({ currentLeg: null })),
    "*Sid* queued *Standard villa* on Villa 12 — not started yet.",
  );
});

test("doneText, cannotActNow and newTrailNeedsDialog", () => {
  assert.equal(doneText(), "Done.");
  assert.equal(cannotActNow(), "I couldn't act as you just now. Please try again in a moment.");
  assert.equal(
    newTrailNeedsDialog(),
    "The /newtrail command needs 'Opens a dialog' ticked in the Chat app's configuration — an admin can do that in the Google Cloud console.",
  );
});

// --- Phase 7b: page 1's custom row and pick_people switch, page 2 ------

test("newTrailDialog: the trail type dropdown starts with Custom, before every saved type", () => {
  const dialog = newTrailDialog({
    units: [{ value: "u-1", text: "Saarang · Villa 1" }],
    sets: [
      trailSetOption({ id: "s1", name: "Standard villa" }),
      trailSetOption({ id: "s2", name: "Fast track" }),
    ],
    selectedUnit: "u-1",
    submitUrl: SUBMIT_URL,
  });
  const [, setInput] = selectionInputs(dialog) as {
    items: { text: string; value: string; selected: boolean }[];
  }[];
  assert.deepEqual(
    setInput.items.map((i) => [i.text, i.value, i.selected]),
    [
      ["Custom — I'll pick the steps", CUSTOM_SET, false],
      ["Standard villa", "s1", false],
      ["Fast track", "s2", false],
    ],
  );
});

test("newTrailDialog: the 'choose the people myself' switch is off by default", () => {
  const dialog = newTrailDialog({
    units: [{ value: "u-1", text: "Saarang · Villa 1" }],
    sets: [trailSetOption()],
    selectedUnit: "u-1",
    submitUrl: SUBMIT_URL,
  });
  const decoratedWidgets = widgetsOf(dialog).filter(
    (w): w is { decoratedText: Record<string, unknown> } => "decoratedText" in w,
  );
  const pickPeople = decoratedWidgets[0].decoratedText as {
    text: string;
    switchControl: { name: string; value: string; selected: boolean; controlType: string };
  };
  assert.equal(pickPeople.text, "Choose the people myself");
  assert.deepEqual(pickPeople.switchControl, {
    name: "pick_people",
    value: "on",
    selected: false,
    controlType: "SWITCH",
  });

  // Start now still follows it, unchanged, still on by default.
  const start = decoratedWidgets[1].decoratedText as {
    text: string;
    switchControl: { selected: boolean };
  };
  assert.equal(start.text, "Start now");
  assert.equal(start.switchControl.selected, true);
});

test("newTrailDialog: the steps dropdown offers 1..MAX_CUSTOM_STEPS, four by default", () => {
  const dialog = newTrailDialog({
    units: [{ value: "u-1", text: "Saarang · Villa 1" }],
    sets: [trailSetOption()],
    selectedUnit: "u-1",
    submitUrl: SUBMIT_URL,
  });
  const inputs = selectionInputs(dialog) as {
    name: string;
    label: string;
    type: string;
    items: { text: string; value: string; selected: boolean }[];
  }[];

  // It sits right after the trail type, the choice it belongs to.
  assert.deepEqual(
    inputs.map((i) => i.name),
    ["unit", "set", "steps"],
  );

  const steps = inputs[2];
  assert.equal(steps.label, "Steps (custom trails only)");
  assert.equal(steps.type, "DROPDOWN");
  assert.deepEqual(
    steps.items.map((i) => [i.text, i.value]),
    Array.from({ length: MAX_CUSTOM_STEPS }, (_, i) => [String(i + 1), String(i + 1)]),
  );
  assert.deepEqual(
    steps.items.filter((i) => i.selected).map((i) => i.value),
    [String(DEFAULT_CUSTOM_STEPS)],
  );
});

function stepDefault(overrides: Partial<StepDefault> = {}): StepDefault {
  return {
    activityId: "a1",
    activityName: "Client sign-off",
    assigneeId: "p1",
    expectedDays: 3,
    ...overrides,
  };
}

const PEOPLE = [
  { id: "p1", name: "Anil" },
  { id: "p2", name: "Priya" },
];
const ACTIVITIES = [
  { id: "a1", name: "Client sign-off" },
  { id: "a2", name: "Structural drawings" },
];
const PAGE1_PARAMS = { unit: "u-12", set: "s1", start: true };

test("trailStepsDialog: set mode, one row per step, pre-filled from the type's defaults", () => {
  const dialog = trailStepsDialog({
    mode: "set",
    steps: [
      stepDefault({ activityId: "a1", activityName: "Client sign-off", assigneeId: "p1" }),
      stepDefault({
        activityId: "a2",
        activityName: "Structural drawings",
        assigneeId: null,
        expectedDays: 5,
      }),
    ],
    people: PEOPLE,
    activities: ACTIVITIES,
    params: PAGE1_PARAMS,
    submitUrl: SUBMIT_URL,
  });

  const decorated = decoratedTexts(dialog);
  assert.equal(decorated.length, 2);
  assert.equal(decorated[0].topLabel, "Step 1");
  assert.equal(decorated[0].text, "<b>Client sign-off</b>");
  assert.equal(decorated[1].topLabel, "Step 2");
  assert.equal(decorated[1].text, "<b>Structural drawings</b>");

  const persons = selectionInputs(dialog) as {
    name: string;
    label: string;
    items: { value: string; selected: boolean }[];
  }[];
  assert.equal(persons.length, 2);
  assert.equal(persons[0].name, "person_1");
  assert.equal(persons[0].label, "Who carries it");
  assert.deepEqual(
    persons[0].items.map((i) => [i.value, i.selected]),
    [
      ["p1", true],
      ["p2", false],
    ],
  );
  assert.equal(persons[1].name, "person_2");
  assert.ok(persons[1].items.every((i) => i.selected === false)); // no usual person for step 2

  const days = textInputs(dialog) as { name: string; label: string; value: string }[];
  assert.equal(days.length, 2);
  assert.deepEqual(
    days.map((d) => [d.name, d.label, d.value]),
    [
      ["days_1", "Days", "3"],
      ["days_2", "Days", "5"],
    ],
  );
});

test("trailStepsDialog: custom mode, a title field then as many blank rows as page 1 asked for", () => {
  const dialog = trailStepsDialog({
    mode: "custom",
    steps: [],
    people: PEOPLE,
    activities: ACTIVITIES,
    customSteps: 3,
    params: PAGE1_PARAMS,
    submitUrl: SUBMIT_URL,
  });

  const texts = textInputs(dialog) as { name: string; label: string; hintText?: string }[];
  assert.equal(texts[0].name, "title");
  assert.equal(texts[0].label, "What is this trail for");
  assert.equal(texts[0].hintText, "Optional");

  const dayInputs = texts.slice(1);
  assert.equal(dayInputs.length, 3);
  assert.deepEqual(
    dayInputs.map((d) => [d.name, d.label, d.hintText]),
    Array.from({ length: 3 }, (_, i) => [`days_${i + 1}`, "Days", "e.g. 5"]),
  );

  const activityInputs = (
    selectionInputs(dialog) as {
      name: string;
      label: string;
      items: { selected: boolean }[];
    }[]
  ).filter((s) => s.name.startsWith("activity_"));
  assert.equal(activityInputs.length, 3);
  assert.equal(activityInputs[0].label, "Step 1 · activity");
  assert.equal(activityInputs[2].label, "Step 3 · activity");
  assert.ok(activityInputs.every((s) => s.items.every((i) => i.selected === false)));

  const personInputs = (
    selectionInputs(dialog) as {
      name: string;
      label: string;
      items: { selected: boolean }[];
    }[]
  ).filter((s) => s.name.startsWith("person_"));
  assert.equal(personInputs.length, 3);
  assert.ok(personInputs.every((s) => s.label === "Who carries it"));
  assert.ok(personInputs.every((s) => s.items.every((i) => i.selected === false)));
});

test("trailStepsDialog: custom mode, the row count is page 1's, pinned to 1..MAX", () => {
  const rowsFor = (customSteps: number | undefined) => {
    const dialog = trailStepsDialog({
      mode: "custom",
      steps: [],
      people: PEOPLE,
      activities: ACTIVITIES,
      customSteps,
      params: PAGE1_PARAMS,
      submitUrl: SUBMIT_URL,
    });
    return (selectionInputs(dialog) as { name: string }[]).filter((s) =>
      s.name.startsWith("activity_"),
    ).length;
  };

  assert.equal(rowsFor(1), 1);
  assert.equal(rowsFor(MAX_CUSTOM_STEPS), MAX_CUSTOM_STEPS);
  assert.equal(rowsFor(99), MAX_CUSTOM_STEPS);
  assert.equal(rowsFor(0), 1);
  assert.equal(rowsFor(undefined), DEFAULT_CUSTOM_STEPS);
});

test("trailStepsDialog: an activity name with HTML-special characters is escaped", () => {
  const dialog = trailStepsDialog({
    mode: "set",
    steps: [stepDefault({ activityName: "A < B review" })],
    people: PEOPLE,
    activities: ACTIVITIES,
    params: PAGE1_PARAMS,
    submitUrl: SUBMIT_URL,
  });
  const [decorated] = decoratedTexts(dialog);
  assert.equal(decorated.text, "<b>A &lt; B review</b>");
});

test("trailStepsDialog: Open trail carries page 1's choices, the mode, and set mode's activities", () => {
  const setDialog = trailStepsDialog({
    mode: "set",
    steps: [stepDefault({ activityId: "a1" }), stepDefault({ activityId: "a2" })],
    people: PEOPLE,
    activities: ACTIVITIES,
    params: { unit: "u-12", set: "s1", start: true },
    submitUrl: SUBMIT_URL,
  });
  const [setButtons] = buttonLists(setDialog);
  const [openSet] = setButtons;
  assert.equal(openSet.text, "Open trail");
  assert.equal(openSet.onClick.action?.function, SUBMIT_URL);
  assert.deepEqual(openSet.onClick.action?.parameters, [
    { key: "action", value: "newtrail-open" },
    { key: "unit", value: "u-12" },
    { key: "set", value: "s1" },
    { key: "start", value: "on" },
    { key: "mode", value: "set" },
    { key: "count", value: "2" },
    { key: "activities", value: "a1,a2" },
  ]);

  const customDialog = trailStepsDialog({
    mode: "custom",
    steps: [],
    people: PEOPLE,
    activities: ACTIVITIES,
    customSteps: 7,
    params: { unit: "u-12", set: CUSTOM_SET, start: false },
    submitUrl: SUBMIT_URL,
  });
  const [customButtons] = buttonLists(customDialog);
  const [openCustom] = customButtons;
  assert.deepEqual(openCustom.onClick.action?.parameters, [
    { key: "action", value: "newtrail-open" },
    { key: "unit", value: "u-12" },
    { key: "set", value: CUSTOM_SET },
    { key: "start", value: "" },
    { key: "mode", value: "custom" },
    // The count the door reads back is the number of rows actually drawn.
    { key: "count", value: "7" },
  ]);
});

test("trailStepsDialog: an error is the first widget, in its own paragraph", () => {
  const dialog = trailStepsDialog({
    mode: "custom",
    steps: [],
    people: PEOPLE,
    activities: ACTIVITIES,
    customSteps: 2,
    params: PAGE1_PARAMS,
    submitUrl: SUBMIT_URL,
    error: "Step 2 needs someone to carry it.",
  });

  const first = widgetsOf(dialog)[0];
  assert.ok("textParagraph" in first);
  assert.equal(
    (first as { textParagraph: { text: string } }).textParagraph.text,
    '<font color="#b3261e"><b>Step 2 needs someone to carry it.</b></font>',
  );

  // And the form is still there below it, unchanged.
  const activityInputs = (selectionInputs(dialog) as { name: string }[]).filter((s) =>
    s.name.startsWith("activity_"),
  );
  assert.equal(activityInputs.length, 2);
});

test("trailStepsDialog: no error means no paragraph at all", () => {
  const dialog = trailStepsDialog({
    mode: "set",
    steps: [stepDefault()],
    people: PEOPLE,
    activities: ACTIVITIES,
    params: PAGE1_PARAMS,
    submitUrl: SUBMIT_URL,
  });
  assert.deepEqual(paragraphs(dialog), []);

  const nulled = trailStepsDialog({
    mode: "set",
    steps: [stepDefault()],
    people: PEOPLE,
    activities: ACTIVITIES,
    params: PAGE1_PARAMS,
    submitUrl: SUBMIT_URL,
    error: null,
  });
  assert.deepEqual(paragraphs(nulled), []);
});

test("trailStepsDialog: an error with HTML-special characters is escaped", () => {
  const dialog = trailStepsDialog({
    mode: "set",
    steps: [stepDefault()],
    people: PEOPLE,
    activities: ACTIVITIES,
    params: PAGE1_PARAMS,
    submitUrl: SUBMIT_URL,
    error: 'Step 1 & "A < B" needs someone to carry it.',
  });
  assert.deepEqual(paragraphs(dialog), [
    '<font color="#b3261e"><b>Step 1 &amp; "A &lt; B" needs someone to carry it.</b></font>',
  ]);
});

test("trailStepsDialog: set mode, submitted values win over the type's defaults", () => {
  const dialog = trailStepsDialog({
    mode: "set",
    steps: [
      stepDefault({ activityId: "a1", assigneeId: "p1", expectedDays: 3 }),
      stepDefault({ activityId: "a2", assigneeId: "p1", expectedDays: 5 }),
    ],
    people: PEOPLE,
    activities: ACTIVITIES,
    params: PAGE1_PARAMS,
    submitUrl: SUBMIT_URL,
    error: "Step 2 needs a whole number of days, at least 1.",
    values: { person_1: "p2", days_1: "9", person_2: null, days_2: "soon" },
  });

  const persons = selectionInputs(dialog) as {
    name: string;
    items: { value: string; selected: boolean }[];
  }[];
  // Step 1's person was changed to Priya — the default (Anil) does not win.
  assert.deepEqual(
    persons[0].items.map((i) => [i.value, i.selected]),
    [
      ["p1", false],
      ["p2", true],
    ],
  );
  // Step 2's dropdown came back empty: it stays empty rather than
  // silently re-filling itself with the usual person.
  assert.ok(persons[1].items.every((i) => i.selected === false));

  const days = textInputs(dialog) as { name: string; value: string }[];
  assert.deepEqual(
    days.map((d) => [d.name, d.value]),
    [
      ["days_1", "9"],
      ["days_2", "soon"],
    ],
  );
});

test("trailStepsDialog: custom mode, every box comes back as it was left", () => {
  const dialog = trailStepsDialog({
    mode: "custom",
    steps: [],
    people: PEOPLE,
    activities: ACTIVITIES,
    customSteps: 2,
    params: { unit: "u-12", set: CUSTOM_SET, start: true },
    submitUrl: SUBMIT_URL,
    error: "Step 2 needs an activity.",
    values: {
      title: "Snag list",
      activity_1: "a2",
      person_1: "p2",
      days_1: "4",
      activity_2: null,
      person_2: "p1",
      days_2: "2",
    },
  });

  const texts = textInputs(dialog) as { name: string; value?: string }[];
  assert.deepEqual(
    texts.map((t) => [t.name, t.value]),
    [
      ["title", "Snag list"],
      ["days_1", "4"],
      ["days_2", "2"],
    ],
  );

  const selects = selectionInputs(dialog) as {
    name: string;
    items: { value: string; selected: boolean }[];
  }[];
  const chosen = (name: string) =>
    selects
      .find((s) => s.name === name)!
      .items.filter((i) => i.selected)
      .map((i) => i.value);
  assert.deepEqual(chosen("activity_1"), ["a2"]);
  assert.deepEqual(chosen("person_1"), ["p2"]);
  assert.deepEqual(chosen("activity_2"), []);
  assert.deepEqual(chosen("person_2"), ["p1"]);
});

test("customDepartmentsNote", () => {
  assert.equal(customDepartmentsNote(), "Add its departments on the trail page if it needs them.");
});

test("none of the write sentences leak an email", () => {
  const trail = pushedRow();
  const sentences = [
    pushedText("Sid", trail),
    finishedText("Sid", trail),
    bouncedText("Sid", trail, "Rework needed", "note"),
    heldText("Sid", trail),
    returnedText("Sid", trail),
    openedText("Sid", trail),
    doneText(),
    cannotActNow(),
    newTrailNeedsDialog(),
  ];
  for (const sentence of sentences) assert.ok(!sentence.includes("@"));
});
