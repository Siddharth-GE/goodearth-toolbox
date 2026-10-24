import assert from "node:assert/strict";
import { test } from "node:test";

import { claudeFailure } from "./errors";

test("running out of credits says so, by status or by type", () => {
  assert.match(claudeFailure(402, undefined), /credits have run out/);
  assert.match(claudeFailure(undefined, "billing_error"), /credits have run out/);
});

test("each failure gets its own plain sentence", () => {
  assert.match(claudeFailure(401, "authentication_error"), /key/);
  assert.match(claudeFailure(529, undefined), /busy/);
  assert.match(claudeFailure(undefined, "overloaded_error"), /busy/);
  assert.match(claudeFailure(429, "rate_limit_error"), /in a minute/);
  assert.match(claudeFailure(undefined, undefined), /could not reach Claude/);
});
