// Light by default; dark only when chosen. An unreadable cookie means no choice.
import assert from "node:assert/strict";
import { test } from "node:test";

import { effectiveTheme, nextTheme, resolveTheme, THEME_COOKIE, themeCookie } from "./theme";

test("the two real choices survive the round trip", () => {
  assert.equal(resolveTheme("light"), "light");
  assert.equal(resolveTheme("dark"), "dark");
});

test("no cookie means no choice", () => {
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

test("an explicit choice is what shows", () => {
  assert.equal(effectiveTheme("light"), "light");
  assert.equal(effectiveTheme("dark"), "dark");
});

test("with no choice made, it is light, whatever the device says", () => {
  assert.equal(effectiveTheme(undefined), "light");
  assert.equal(effectiveTheme("system"), "light");
});

test("the first press of the switch gives dark", () => {
  assert.equal(nextTheme(effectiveTheme(undefined)), "dark");
});

test("the written cookie is one the reader accepts back", () => {
  const written = themeCookie("dark");
  const value = written.split(";")[0].slice(`${THEME_COOKIE}=`.length);
  assert.equal(resolveTheme(value), "dark");
  assert.match(written, /path=\//);
  assert.match(written, /SameSite=Lax/);
});
