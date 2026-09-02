/**
 * What the door is allowed to conclude from Google's envelope. Google's
 * docs are silent on where the sender's email actually lands for
 * add-on-style events, so every place it might sit is pinned here — as
 * is the answer when it sits nowhere, which must be a null, never a
 * throw.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  COMMANDS,
  commandId,
  dialogEventType,
  formValue,
  isDirectMessage,
  senderEmail,
  senderName,
  spaceDisplayName,
  spaceName,
} from "./events";

test("the email is read from chat.user", () => {
  assert.equal(
    senderEmail({ chat: { user: { email: "Sid@Goodearth.test" } } }),
    "sid@goodearth.test",
  );
});

test("the email falls back to the message sender on a plain message", () => {
  assert.equal(
    senderEmail({ chat: { messagePayload: { message: { sender: { email: "  A@B.test  " } } } } }),
    "a@b.test",
  );
});

test("the email falls back to the message sender on a slash command", () => {
  assert.equal(
    senderEmail({ chat: { appCommandPayload: { message: { sender: { email: "c@d.test" } } } } }),
    "c@d.test",
  );
});

test("chat.user wins over the message sender", () => {
  assert.equal(
    senderEmail({
      chat: {
        user: { email: "first@goodearth.test" },
        messagePayload: { message: { sender: { email: "second@goodearth.test" } } },
      },
    }),
    "first@goodearth.test",
  );
});

test("no email anywhere is null, not a throw", () => {
  assert.equal(senderEmail({}), null);
  assert.equal(senderEmail({ chat: {} }), null);
  assert.equal(senderEmail({ chat: { user: { displayName: "Nameless" } } }), null);
});

test("something that isn't an address is null", () => {
  assert.equal(senderEmail({ chat: { user: { email: "not-an-address" } } }), null);
  assert.equal(senderEmail({ chat: { user: { email: "   " } } }), null);
});

test("a bot sender is refused even when it carries an email", () => {
  assert.equal(senderEmail({ chat: { user: { type: "BOT", email: "bot@goodearth.test" } } }), null);
  assert.equal(
    senderEmail({
      chat: {
        user: { type: "BOT" },
        messagePayload: { message: { sender: { email: "person@goodearth.test" } } },
      },
    }),
    null,
  );
});

test("the sender's resource name is what a private reply is addressed to", () => {
  assert.equal(senderName({ chat: { user: { name: "users/12345" } } }), "users/12345");
  assert.equal(
    senderName({ chat: { appCommandPayload: { message: { sender: { name: "users/99" } } } } }),
    "users/99",
  );
  assert.equal(senderName({ chat: { user: { displayName: "No resource name" } } }), null);
  assert.equal(senderName({}), null);
});

test("the space name is read from whichever payload arrived", () => {
  assert.equal(
    spaceName({ chat: { addedToSpacePayload: { space: { name: "spaces/a" } } } }),
    "spaces/a",
  );
  assert.equal(
    spaceName({ chat: { messagePayload: { space: { name: "spaces/b" } } } }),
    "spaces/b",
  );
  assert.equal(
    spaceName({ chat: { appCommandPayload: { space: { name: "spaces/c" } } } }),
    "spaces/c",
  );
  assert.equal(
    spaceName({ chat: { removedFromSpacePayload: { space: { name: "spaces/d" } } } }),
    "spaces/d",
  );
  assert.equal(spaceName({}), "");
});

test("the command id is normalised from both shapes and both types", () => {
  assert.equal(
    commandId({ chat: { appCommandPayload: { appCommandMetadata: { appCommandId: "1" } } } }),
    1,
  );
  assert.equal(
    commandId({ chat: { appCommandPayload: { appCommandMetadata: { appCommandId: 5 } } } }),
    5,
  );
  assert.equal(
    commandId({ chat: { messagePayload: { message: { slashCommand: { commandId: "7" } } } } }),
    7,
  );
});

test("no command means null, and so does nonsense", () => {
  assert.equal(commandId({}), null);
  assert.equal(commandId({ chat: { messagePayload: { message: { text: "hello" } } } }), null);
  assert.equal(
    commandId({ chat: { appCommandPayload: { appCommandMetadata: { appCommandId: "abc" } } } }),
    null,
  );
});

test("every declared command id maps to a slash command name", () => {
  assert.deepEqual(Object.keys(COMMANDS), ["1", "2", "3", "4", "5", "6", "7"]);
  for (const name of Object.values(COMMANDS)) {
    assert.match(name, /^\/[a-z]+$/);
  }
});

test("a button click names its space and its sender like any other event", () => {
  const event = {
    chat: {
      buttonClickedPayload: {
        space: { name: "spaces/e" },
        message: { sender: { name: "users/7", email: "Sid@Goodearth.test" } },
      },
    },
  };
  assert.equal(spaceName(event), "spaces/e");
  assert.equal(senderName(event), "users/7");
  assert.equal(senderEmail(event), "sid@goodearth.test");
});

test("the space's display name is what the join match reads", () => {
  assert.equal(
    spaceDisplayName({
      chat: {
        addedToSpacePayload: { space: { name: "spaces/a", displayName: "Saarang Villa 12" } },
      },
    }),
    "Saarang Villa 12",
  );
  assert.equal(
    spaceDisplayName({ chat: { appCommandPayload: { space: { displayName: "  Baveli 1  " } } } }),
    "Baveli 1",
  );
  assert.equal(spaceDisplayName({ chat: { messagePayload: { space: { name: "spaces/b" } } } }), "");
  assert.equal(spaceDisplayName({}), "");
});

test("a DM is recognised from either field Google uses", () => {
  assert.equal(isDirectMessage({ chat: { messagePayload: { space: { type: "DM" } } } }), true);
  assert.equal(
    isDirectMessage({ chat: { appCommandPayload: { space: { spaceType: "DIRECT_MESSAGE" } } } }),
    true,
  );
  assert.equal(
    isDirectMessage({
      chat: { addedToSpacePayload: { space: { type: "ROOM", spaceType: "SPACE" } } },
    }),
    false,
  );
  assert.equal(isDirectMessage({}), false);
});

test("the dialog step is read from the command and from the button click", () => {
  assert.equal(
    dialogEventType({
      chat: { appCommandPayload: { isDialogEvent: true, dialogEventType: "REQUEST_DIALOG" } },
    }),
    "REQUEST_DIALOG",
  );
  assert.equal(
    dialogEventType({ chat: { buttonClickedPayload: { dialogEventType: "SUBMIT_DIALOG" } } }),
    "SUBMIT_DIALOG",
  );
  assert.equal(
    dialogEventType({ chat: { buttonClickedPayload: { dialogEventType: "CANCEL_DIALOG" } } }),
    "CANCEL_DIALOG",
  );
});

test("a command that arrived without the dialog tick has no dialog step", () => {
  assert.equal(
    dialogEventType({ chat: { appCommandPayload: { appCommandMetadata: { appCommandId: 7 } } } }),
    null,
  );
  assert.equal(
    dialogEventType({ chat: { appCommandPayload: { dialogEventType: "SOMETHING_NEW" } } }),
    null,
  );
  assert.equal(dialogEventType({}), null);
});

test("a form value is the first string under its input name, or null", () => {
  const event = {
    commonEventObject: {
      formInputs: { target: { stringInputs: { value: ["unit:u-villa-12"] } } },
    },
  };
  assert.equal(formValue(event, "target"), "unit:u-villa-12");
  assert.equal(formValue(event, "other"), null);
  assert.equal(formValue({}, "target"), null);
  assert.equal(
    formValue(
      { commonEventObject: { formInputs: { target: { stringInputs: { value: [] } } } } },
      "target",
    ),
    null,
  );
  assert.equal(
    formValue(
      { commonEventObject: { formInputs: { target: { stringInputs: { value: ["  "] } } } } },
      "target",
    ),
    null,
  );
});
