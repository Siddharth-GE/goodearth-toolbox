import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PUSH_CHANNEL,
  fcmErrorCode,
  fcmMessage,
  fcmSendUrl,
  isGoneDevice,
  pushRecipients,
  safePushPath,
} from "./rules";

test("pushRecipients: each person once, the actor and blanks left out", () => {
  assert.deepEqual(pushRecipients(["a", "b", "a", null, undefined, "", "me"], "me"), ["a", "b"]);
  assert.deepEqual(pushRecipients(["me"], "me"), []);
  assert.deepEqual(pushRecipients([], "me"), []);
});

test("safePushPath: our own pages pass, anything else opens the home page", () => {
  assert.equal(safePushPath("/indents/abc"), "/indents/abc");
  assert.equal(safePushPath("/relay/trails/x?tab=1"), "/relay/trails/x?tab=1");
  assert.equal(safePushPath("https://evil.example/"), "/");
  assert.equal(safePushPath("//evil.example/"), "/");
  assert.equal(safePushPath("/\\evil.example"), "/");
  assert.equal(safePushPath("javascript:alert(1)"), "/");
  assert.equal(safePushPath(""), "/");
  assert.equal(safePushPath(undefined), "/");
  assert.equal(safePushPath(42), "/");
});

test("fcmSendUrl names the project", () => {
  assert.equal(
    fcmSendUrl("kaadal-toolbox"),
    "https://fcm.googleapis.com/v1/projects/kaadal-toolbox/messages:send",
  );
});

test("fcmMessage: the token, the words, the page and the channel", () => {
  const sent = fcmMessage("tok", { title: "Indent approved", body: "IND-1", url: "/indents/1" });
  assert.deepEqual(sent, {
    message: {
      token: "tok",
      notification: { title: "Indent approved", body: "IND-1" },
      data: { url: "/indents/1" },
      android: { priority: "HIGH", notification: { channel_id: PUSH_CHANNEL } },
      apns: { payload: { aps: { sound: "default" } } },
    },
  });
});

test("fcmMessage: long or ragged words are tidied, a foreign page is refused", () => {
  const sent = fcmMessage("tok", {
    title: "x".repeat(100),
    body: "  two\n lines  ",
    url: "https://evil.example",
  });
  assert.equal(sent.message.notification.title.length, 80);
  assert.ok(sent.message.notification.title.endsWith("…"));
  assert.equal(sent.message.notification.body, "two lines");
  assert.equal(sent.message.data.url, "/");
});

test("fcmErrorCode: reads Firebase's code, and nothing from other shapes", () => {
  const body = {
    error: {
      status: "NOT_FOUND",
      details: [
        { "@type": "type.googleapis.com/google.rpc.Other" },
        {
          "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError",
          errorCode: "UNREGISTERED",
        },
      ],
    },
  };
  assert.equal(fcmErrorCode(body), "UNREGISTERED");
  assert.equal(fcmErrorCode({ error: { status: "INTERNAL" } }), null);
  assert.equal(fcmErrorCode("<html>proxy error</html>"), null);
  assert.equal(fcmErrorCode(null), null);
});

test("isGoneDevice: only Firebase's 'not here any more' forgets a phone", () => {
  assert.equal(isGoneDevice(404, null), true);
  assert.equal(isGoneDevice(400, "UNREGISTERED"), true);
  assert.equal(isGoneDevice(400, "INVALID_ARGUMENT"), false);
  assert.equal(isGoneDevice(401, null), false);
  assert.equal(isGoneDevice(500, null), false);
});
