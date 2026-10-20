import assert from "node:assert/strict";
import { test } from "node:test";

import { CHAT_BOT_SCOPE, REFRESH_TIMEOUT_MS, patchUrl } from "./outbound-rules";

test("CHAT_BOT_SCOPE is chat.bot and nothing wider", () => {
  assert.equal(CHAT_BOT_SCOPE, "https://www.googleapis.com/auth/chat.bot");
});

test("patchUrl builds the cardsV2 update address for a given message", () => {
  assert.equal(
    patchUrl("spaces/AAAA/messages/BBBB"),
    "https://chat.googleapis.com/v1/spaces/AAAA/messages/BBBB?updateMask=cardsV2",
  );
});

test("REFRESH_TIMEOUT_MS is five seconds", () => {
  assert.equal(REFRESH_TIMEOUT_MS, 5000);
});
