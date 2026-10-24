import assert from "node:assert/strict";
import { test } from "node:test";

import { redirect } from "next/navigation";

import { idFrom, redirectedTo } from "./redirects";

const ID = "11111111-1111-4111-8111-111111111111";

test("a real redirect() is read as where it was going", () => {
  // Pins Next's internal helpers: an upgrade that moves them fails here, not on a save.
  let thrown: unknown;
  try {
    redirect(`/indents/${ID}`);
  } catch (error) {
    thrown = error;
  }
  assert.equal(redirectedTo(thrown), `/indents/${ID}`);
  assert.equal(redirectedTo(new Error("boom")), null);
});

test("the new record's id is read from its address, and only an id", () => {
  assert.equal(idFrom(`/indents/${ID}`, "/indents/"), ID);
  assert.equal(idFrom(`/indents/${ID}?new=1`, "/indents/"), ID);
  assert.equal(idFrom("/indents/list", "/indents/"), null);
  assert.equal(idFrom(`/bills/${ID}`, "/indents/"), null);
  assert.equal(idFrom(null, "/indents/"), null);
});
