// An unreadable cookie means "follow the device", never a guessed colour.
import assert from "node:assert/strict";
import { test } from "node:test";

import { effectiveTheme, nextTheme, resolveTheme, THEME_COOKIE, themeCookie } from "./theme";

test("the two real choices survive the round trip", () => {
  assert.equal(resolveTheme("light"), "light");
  assert.equal(resolveTheme("dark"), "dark");
});

test("no cookie means follow the device, not a default colour", () => {
  assert.equal(resolveTheme(undefined), null);
  assert.equal(resolveTheme(null), null);
  assert.equal(resolveTheme(""), null);
});

test("a junk or stale cookie falls back rather than sticking", () => {
  assert.equal(resolveTheme("Dark"), null);
  assert.equal(resolveTheme("system"), null);
  assert.equal(resolveTheme("auto"), null);
  assert.equal(resolveTheme("dark; DROP TABLE"), null);
});

test("the switch flips both ways", () => {
  assert.equal(nextTheme("light"), "dark");
  assert.equal(nextTheme("dark"), "light");
});

test("an explicit choice beats the device, both ways round", () => {
  assert.equal(effectiveTheme("light", true), "light");
  assert.equal(effectiveTheme("dark", false), "dark");
});

test("with no choice made, the device decides", () => {
  assert.equal(effectiveTheme(undefined, true), "dark");
  assert.equal(effectiveTheme(undefined, false), "light");
});

test("the switch always flips away from what is on screen", () => {
  // Device dark, no choice yet: one press must give light.
  assert.equal(nextTheme(effectiveTheme(undefined, true)), "light");
  assert.equal(nextTheme(effectiveTheme(undefined, false)), "dark");
});

test("the written cookie is one the reader accepts back", () => {
  const written = themeCookie("dark");
  const value = written.split(";")[0].slice(`${THEME_COOKIE}=`.length);
  assert.equal(resolveTheme(value), "dark");
  assert.match(written, /path=\//);
  assert.match(written, /SameSite=Lax/);
});
