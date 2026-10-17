// The last class a caller passes must win, even a custom one (shadow-float, animate-*) declared in lib/utils.ts.
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
