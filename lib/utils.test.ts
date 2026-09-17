/**
 * The rule worth pinning: the last class a caller passes wins, even when
 * the class is one of ours. tailwind-merge ships knowing Tailwind's own
 * scales only, so `shadow-float`, `ease-out-quint` and the `animate-*`
 * names from app/globals.css have to be declared in lib/utils.ts. Without
 * that declaration cn() keeps both classes and a component's shadow or
 * animation can never be overridden from outside — measured, and the
 * reason these four lines exist.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { cn } from "./utils";

test("a custom shadow can still be turned off by the caller", () => {
  assert.equal(cn("shadow-float", "shadow-none"), "shadow-none");
});

test("a custom easing can still be replaced by the caller", () => {
  assert.equal(cn("ease-out-quint", "ease-linear"), "ease-linear");
});

test("a custom animation can still be replaced by the caller", () => {
  assert.equal(cn("animate-pop-in", "animate-none"), "animate-none");
});

test("extending the merge did not break the ordinary merge", () => {
  assert.equal(cn("px-2", "px-4"), "px-4");
});
