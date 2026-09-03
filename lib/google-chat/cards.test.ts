/**
 * Pins the bot's fixed sentences — one assertion per refusal, both
 * greeting shapes, and a check that none of them leaks an email address.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  askForWords,
  buttonsComingNote,
  courtCard,
  dialogNotEnabled,
  dmCannotLink,
  greeting,
  identityRefusal,
  joinHello,
  linkConfirmation,
  linkDialog,
  noticeDialog,
  linkSaveFailed,
  trailCard,
  type LinkTarget,
  type RefusalKind,
} from "./cards";
import type { TrailSummary } from "./trail-rules";

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

type Widget =
  | { decoratedText: { topLabel: string; text: string; bottomLabel: string; wrapText: boolean } }
  | { buttonList: { buttons: { text: string; onClick: { openLink: { url: string } } }[] } }
  | { textParagraph: { text: string } };

type ChatCard = {
  cardId: string;
  card: { header: { title: string; subtitle: string }; sections: { widgets: Widget[] }[] };
};

function widgetsOf(built: Record<string, unknown>): Widget[] {
  return (built as ChatCard).card.sections[0].widgets;
}

function decoratedTexts(built: Record<string, unknown>) {
  return widgetsOf(built)
    .filter((w): w is Extract<Widget, { decoratedText: unknown }> => "decoratedText" in w)
    .map((w) => w.decoratedText);
}

function paragraphs(built: Record<string, unknown>) {
  return widgetsOf(built)
    .filter((w): w is Extract<Widget, { textParagraph: unknown }> => "textParagraph" in w)
    .map((w) => w.textParagraph.text);
}

function openLinks(built: Record<string, unknown>) {
  return widgetsOf(built)
    .filter((w): w is Extract<Widget, { buttonList: unknown }> => "buttonList" in w)
    .map((w) => w.buttonList.buttons[0].onClick.openLink.url);
}

function headerOf(built: Record<string, unknown>) {
  return (built as ChatCard).card.header;
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

test("buttonsComingNote", () => {
  assert.equal(
    buttonsComingNote(),
    "Push, Bounce and Finish buttons arrive with the next release — Open a trail to move it in the toolbox.",
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
  });
  assert.match(decoratedTexts(withLabel)[0].bottomLabel, /^Leg 2 of 5 · Structural drawings —/);

  const withoutLabel = courtCard({
    firstName: "S",
    scopeLabel: null,
    rows: [row({ currentLeg: 2, legCount: 5, legLabel: null })],
    more: 0,
    moreElsewhere: 0,
    origin: ORIGIN,
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
  });
  assert.deepEqual(paragraphs(built), ["Court cleared — nothing is waiting on you."]);
});

test("courtCard: header names the scope, or everything, and the note when given", () => {
  const everything = courtCard({
    firstName: "S",
    scopeLabel: null,
    rows: [],
    more: 0,
    moreElsewhere: 0,
    origin: ORIGIN,
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
  });
  assert.equal(headerOf(scoped).subtitle, "Saarang · Villa 12");

  const noted = courtCard({
    firstName: "S",
    scopeLabel: "Saarang · Villa 12",
    rows: [],
    more: 0,
    moreElsewhere: 0,
    origin: ORIGIN,
    note: buttonsComingNote(),
  });
  assert.equal(headerOf(noted).subtitle, `Saarang · Villa 12 · ${buttonsComingNote()}`);
});

test("courtCard: more and moreElsewhere footers, singular and plural", () => {
  const one = courtCard({
    firstName: "S",
    scopeLabel: "Saarang · Villa 12",
    rows: [row()],
    more: 3,
    moreElsewhere: 1,
    origin: ORIGIN,
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
  });
  assert.equal(decoratedTexts(withTitle)[0].text, "<b>Structural drawings</b><br>Ground floor");

  const repeated = courtCard({
    firstName: "Sid",
    scopeLabel: null,
    rows: [row({ activityName: "Standard villa", title: "standard villa " })],
    more: 0,
    moreElsewhere: 0,
    origin: ORIGIN,
  });
  assert.equal(decoratedTexts(repeated)[0].text, "<b>Standard villa</b>");
});
