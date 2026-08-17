/**
 * Which read failures get retried. What these protect: a dropped
 * connection self-healing instead of blanking an Operations page, and —
 * just as important — a refusal or a constraint violation still failing
 * immediately, with its own message, instead of three times slower.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { isTransient, withRetry } from "./transient";

test("connection-level SQLSTATEs are transient", () => {
  for (const code of ["08006", "08003", "53300", "57P03", "40001", "40P01"]) {
    assert.equal(isTransient({ code, message: "boom" }), true, code);
  }
});

test("a definite answer from the database is never transient", () => {
  // RLS refusal, not-null, foreign key, check, raise_exception, undefined column.
  for (const code of ["42501", "23502", "23503", "23514", "P0001", "42703"]) {
    assert.equal(isTransient({ code, message: "refused" }), false, code);
  }
});

test("a real SQLSTATE wins over a misleading message", () => {
  // The guard text below contains "timeout", but P0001 is a decision.
  assert.equal(isTransient({ code: "P0001", message: "request timeout window closed" }), false);
});

test("gateway and back-pressure HTTP statuses are transient", () => {
  for (const status of [408, 429, 500, 502, 503, 504]) {
    assert.equal(isTransient({ status, message: "" }), true, String(status));
  }
  for (const status of [400, 401, 403, 404, 409, 422]) {
    assert.equal(isTransient({ status, message: "" }), false, String(status));
  }
});

test("network failures with no SQLSTATE are transient", () => {
  assert.equal(isTransient({ message: "fetch failed" }), true);
  assert.equal(isTransient({ message: "socket hang up" }), true);
  assert.equal(isTransient(new TypeError("fetch failed")), true);
  assert.equal(isTransient({ message: "ECONNRESET" }), true);
});

test("undici's nested cause is inspected", () => {
  assert.equal(isTransient({ message: "fetch failed", cause: { code: "ECONNRESET" } }), true);
  assert.equal(isTransient({ message: "something else", cause: { code: "ETIMEDOUT" } }), true);
});

test("nothing recognisable is treated as permanent", () => {
  assert.equal(isTransient(null), false);
  assert.equal(isTransient(undefined), false);
  assert.equal(isTransient("fetch failed"), false);
  assert.equal(isTransient({ message: "could not find that budget" }), false);
});

test("a self-referencing cause does not loop forever", () => {
  const error: { message: string; cause?: unknown } = { message: "odd" };
  error.cause = error;
  assert.equal(isTransient(error), false);
});

const noDelay = { delaysMs: [0, 0] };

test("withRetry returns the first success without retrying", async () => {
  let calls = 0;
  const result = await withRetry(async () => {
    calls++;
    return { data: "ok", error: null };
  }, noDelay);
  assert.equal(calls, 1);
  assert.equal(result.data, "ok");
});

test("withRetry retries a transient failure and returns the eventual success", async () => {
  let calls = 0;
  const result = await withRetry(async () => {
    calls++;
    if (calls < 3) return { data: null, error: { code: "08006", message: "connection failure" } };
    return { data: "ok", error: null };
  }, noDelay);
  assert.equal(calls, 3);
  assert.equal(result.data, "ok");
  assert.equal(result.error, null);
});

test("withRetry gives up after the last try and hands back the real error", async () => {
  let calls = 0;
  const result = await withRetry(async () => {
    calls++;
    return { data: null, error: { code: "08006", message: "connection failure" } };
  }, noDelay);
  assert.equal(calls, 3);
  assert.deepEqual(result.error, { code: "08006", message: "connection failure" });
});

test("withRetry does not retry a permanent failure", async () => {
  let calls = 0;
  const result = await withRetry(async () => {
    calls++;
    return { data: null, error: { code: "42501", message: "permission denied" } };
  }, noDelay);
  assert.equal(calls, 1);
  assert.deepEqual(result.error, { code: "42501", message: "permission denied" });
});

test("withRetry retries a thrown transient error but rethrows a permanent one", async () => {
  let calls = 0;
  const result = await withRetry(async () => {
    calls++;
    if (calls === 1) throw new TypeError("fetch failed");
    return { data: "ok", error: null };
  }, noDelay);
  assert.equal(calls, 2);
  assert.equal(result.data, "ok");

  await assert.rejects(
    () =>
      withRetry(async () => {
        throw new Error("programmer error");
      }, noDelay),
    /programmer error/,
  );
});
