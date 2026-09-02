/**
 * Pins the bot's fixed sentences — one assertion per refusal, both
 * greeting shapes, and a check that none of them leaks an email address.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  dialogNotEnabled,
  dmCannotLink,
  greeting,
  identityRefusal,
  joinHello,
  linkConfirmation,
  linkDialog,
  linkSaveFailed,
  type LinkTarget,
  type RefusalKind,
} from "./cards";

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

test("greeting without a command says nothing is wired up yet", () => {
  assert.equal(
    greeting("Siddharth", null),
    "Hi Siddharth! Slash commands are on their way — nothing to run just yet.",
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
  const dialog = linkDialog(targets, "unit:2") as {
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
  assert.equal(buttonWidget.buttonList.buttons[0].onClick.action.function, "link");
});

test("linkDialog selects exactly the current item", () => {
  const targets: LinkTarget[] = [
    { value: "none", text: "Not linked" },
    { value: "project:1", text: "Saarang" },
    { value: "unit:2", text: "Saarang · Villa 12" },
  ];
  const dialog = linkDialog(targets, "project:1") as {
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
