/**
 * The sign-in lockout arithmetic. Ten failures in a rolling ten-minute
 * window locks for ten minutes; these tests pin the edges — the roll,
 * the reset-on-lock, and the wording someone locked out actually reads.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { lockoutMessage, MAX_FAILURES, nextAttempt, WINDOW_MINUTES } from "./lockout";

const now = new Date("2026-08-14T10:00:00Z");
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000).toISOString();

test("a first failure starts a window of one", () => {
  const next = nextAttempt(null, now);
  assert.equal(next.failedCount, 1);
  assert.equal(next.lockedUntil, null);
  assert.equal(next.windowStartedAt.getTime(), now.getTime());
});

test("failures inside the window accumulate", () => {
  const next = nextAttempt({ failed_count: 3, window_started_at: minutesAgo(5) }, now);
  assert.equal(next.failedCount, 4);
  assert.equal(next.lockedUntil, null);
  // The window keeps its original start — it rolls, it doesn't restart.
  assert.equal(next.windowStartedAt.toISOString(), minutesAgo(5));
});

test("a stale window starts over instead of accumulating", () => {
  const next = nextAttempt(
    { failed_count: MAX_FAILURES - 1, window_started_at: minutesAgo(WINDOW_MINUTES + 1) },
    now,
  );
  assert.equal(next.failedCount, 1);
  assert.equal(next.lockedUntil, null);
  assert.equal(next.windowStartedAt.getTime(), now.getTime());
});

test("the tenth failure locks, and resets the counter for the next round", () => {
  const next = nextAttempt(
    { failed_count: MAX_FAILURES - 1, window_started_at: minutesAgo(2) },
    now,
  );
  assert.ok(next.lockedUntil);
  assert.equal(next.lockedUntil.getTime(), now.getTime() + 10 * 60_000);
  // Stored count goes to zero so the NEXT lockout needs another full run
  // of failures, not one more slip.
  assert.equal(next.failedCount, 0);
});

test("the lockout message rounds up and never promises 'any second now'", () => {
  const lockedUntil = new Date(now.getTime() + 30_000);
  assert.match(lockoutMessage(lockedUntil, now), /1 minute\./);
  const nine = new Date(now.getTime() + 8.2 * 60_000);
  assert.match(lockoutMessage(nine, now), /9 minutes\./);
});
