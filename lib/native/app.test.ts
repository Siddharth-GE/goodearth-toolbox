import assert from "node:assert/strict";
import { test } from "node:test";

import { APP_USER_AGENT_MARK, isPhoneApp } from "./app";

const ANDROID_WEB_VIEW =
  "Mozilla/5.0 (Linux; Android 16; Pixel 7 Build/BP2A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0.0.0 Mobile Safari/537.36";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 16; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36";

test("the app's web view carries the mark Capacitor appends", () => {
  assert.equal(isPhoneApp(`${ANDROID_WEB_VIEW} ${APP_USER_AGENT_MARK}`), true);
});

test("Chrome, the Play wrapper and a plain web view are the website", () => {
  assert.equal(isPhoneApp(ANDROID_CHROME), false);
  assert.equal(isPhoneApp(ANDROID_WEB_VIEW), false);
});

test("no user agent is the website", () => {
  assert.equal(isPhoneApp(null), false);
  assert.equal(isPhoneApp(undefined), false);
  assert.equal(isPhoneApp(""), false);
});

test("the mark must stand alone, not inside another word", () => {
  assert.equal(isPhoneApp(`${ANDROID_CHROME} NotKaadalToolboxApp`), false);
  assert.equal(isPhoneApp(`${ANDROID_CHROME} KaadalToolboxAppX`), false);
  assert.equal(isPhoneApp(`${ANDROID_CHROME} KaadalToolboxApp/2.0.0`), true);
});
