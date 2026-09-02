/**
 * Database error → sentence rules.
 *
 * Worth pinning because the two modes replaced seven private copies: the
 * guard-phrase mode (a trigger's refusal passes through, anything else is
 * hidden behind the fallback) and the pass-everything mode. An empty
 * message must never come back as an empty error, which a form reads as
 * success.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { dbErrorMessage, guardError, stripDbPrefix } from "./db-error";

test("stripDbPrefix drops the Postgres prefix up to the first colon", () => {
  assert.equal(
    stripDbPrefix("P0001: A draft can no longer be edited"),
    "A draft can no longer be edited",
  );
  assert.equal(stripDbPrefix("No colon here"), "No colon here");
  assert.equal(stripDbPrefix("Time is 10:30 today"), "30 today");
});

test("with phrases, only a guard's own words pass through", () => {
  const phrases = ["draft", "short code"];
  assert.equal(
    dbErrorMessage({ message: "P0001: A draft can no longer be edited" }, "Fallback.", phrases),
    "A draft can no longer be edited",
  );
  assert.equal(
    dbErrorMessage(
      { message: 'duplicate key value violates "indents_pkey"' },
      "Fallback.",
      phrases,
    ),
    "Fallback.",
  );
});

test("without phrases, every message passes through", () => {
  assert.equal(
    dbErrorMessage({ message: "P0001: Pick a stage first" }, "Fallback."),
    "Pick a stage first",
  );
});

test("an empty message never becomes an empty error", () => {
  assert.equal(dbErrorMessage({ message: "" }, "Fallback."), "Fallback.");
  assert.equal(dbErrorMessage({ message: "P0001: " }, "Fallback.", ["P0001"]), "Fallback.");
  assert.deepEqual(guardError({ message: "" }, "Fallback.", []), { error: "Fallback." });
});

test("guardError wraps the message as an ActionState", () => {
  assert.deepEqual(
    guardError({ message: "P0001: Only the holder can push" }, "Could not push.", ["holder"]),
    {
      error: "Only the holder can push",
    },
  );
});
