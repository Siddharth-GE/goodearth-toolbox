import assert from "node:assert/strict";
import { test } from "node:test";

import { ANSWER_LIMITS, formatAnswer, parseAnswers, readAnswerFields } from "./answers";

function body(fields: unknown, submitted?: unknown): string {
  return JSON.stringify(submitted === undefined ? { fields } : { fields, submitted });
}

// ---------------------------------------------------------------------
// parseAnswers
// ---------------------------------------------------------------------

test("parseAnswers accepts a string, a boolean and a list of strings", () => {
  const result = parseAnswers(body({ a: "hello", b: true, c: false, d: ["x", "y"], e: [] }));
  assert.deepEqual(result, {
    fields: { a: "hello", b: true, c: false, d: ["x", "y"], e: [] },
    submitted: false,
  });
});

test("parseAnswers defaults submitted to false and keeps true", () => {
  assert.deepEqual(parseAnswers(body({})), { fields: {}, submitted: false });
  assert.deepEqual(parseAnswers(body({ a: "b" }, true)), { fields: { a: "b" }, submitted: true });
});

test("parseAnswers insists submitted is a boolean when present", () => {
  assert.ok("error" in parseAnswers(body({}, "yes")));
  assert.ok("error" in parseAnswers(body({}, 1)));
  assert.ok("error" in parseAnswers(body({}, null)));
});

test("parseAnswers refuses a body that is not JSON", () => {
  assert.ok("error" in parseAnswers("not json"));
  assert.ok("error" in parseAnswers(""));
});

test("parseAnswers refuses a top level or fields that is not a plain object", () => {
  assert.ok("error" in parseAnswers("[]"));
  assert.ok("error" in parseAnswers("null"));
  assert.ok("error" in parseAnswers('"text"'));
  assert.ok("error" in parseAnswers("{}"));
  assert.ok("error" in parseAnswers(body([])));
  assert.ok("error" in parseAnswers(body(null)));
  assert.ok("error" in parseAnswers(body("text")));
});

test("parseAnswers refuses nested objects, numbers, null and mixed lists", () => {
  assert.ok("error" in parseAnswers(body({ a: { b: "c" } })));
  assert.ok("error" in parseAnswers(body({ a: 5 })));
  assert.ok("error" in parseAnswers(body({ a: null })));
  assert.ok("error" in parseAnswers(body({ a: ["x", 1] })));
  assert.ok("error" in parseAnswers(body({ a: [["x"]] })));
});

test("parseAnswers refuses an oversize body", () => {
  const big = "a".repeat(ANSWER_LIMITS.bytes + 1);
  assert.ok("error" in parseAnswers(big));
});

test("parseAnswers refuses too many fields", () => {
  const atLimit = Object.fromEntries(
    Array.from({ length: ANSWER_LIMITS.fields }, (_, i) => [`f${i}`, "x"]),
  );
  assert.ok("fields" in parseAnswers(body(atLimit)));
  assert.ok("error" in parseAnswers(body({ ...atLimit, extra: "x" })));
});

test("parseAnswers refuses an empty or too-long field name", () => {
  assert.ok("error" in parseAnswers(body({ "": "x" })));
  assert.ok("error" in parseAnswers(body({ "   ": "x" })));
  assert.ok("fields" in parseAnswers(body({ [`${"n".repeat(ANSWER_LIMITS.nameLength)}`]: "x" })));
  assert.ok(
    "error" in parseAnswers(body({ [`${"n".repeat(ANSWER_LIMITS.nameLength + 1)}`]: "x" })),
  );
});

test("parseAnswers refuses a text answer that is too long", () => {
  assert.ok("fields" in parseAnswers(body({ a: "x".repeat(ANSWER_LIMITS.textLength) })));
  assert.ok("error" in parseAnswers(body({ a: "x".repeat(ANSWER_LIMITS.textLength + 1) })));
});

test("parseAnswers refuses a list that is too long or has a long item", () => {
  const full = Array.from({ length: ANSWER_LIMITS.listItems }, () => "x");
  assert.ok("fields" in parseAnswers(body({ a: full })));
  assert.ok("error" in parseAnswers(body({ a: [...full, "x"] })));
  assert.ok("fields" in parseAnswers(body({ a: ["x".repeat(ANSWER_LIMITS.listItemLength)] })));
  assert.ok("error" in parseAnswers(body({ a: ["x".repeat(ANSWER_LIMITS.listItemLength + 1)] })));
});

// ---------------------------------------------------------------------
// readAnswerFields
// ---------------------------------------------------------------------

test("readAnswerFields keeps good entries and drops the rest", () => {
  const read = readAnswerFields({
    a: "text",
    b: true,
    c: ["x"],
    d: 5,
    e: null,
    f: { g: "h" },
    h: ["x", 1],
    i: "x".repeat(ANSWER_LIMITS.textLength + 1),
    "": "no name",
  });
  assert.deepEqual(read, { a: "text", b: true, c: ["x"] });
});

test("readAnswerFields returns an empty object for anything that is not an object", () => {
  assert.deepEqual(readAnswerFields(null), {});
  assert.deepEqual(readAnswerFields(undefined), {});
  assert.deepEqual(readAnswerFields("text"), {});
  assert.deepEqual(readAnswerFields(["a"]), {});
  assert.deepEqual(readAnswerFields(5), {});
});

// ---------------------------------------------------------------------
// formatAnswer
// ---------------------------------------------------------------------

test("formatAnswer reads each kind in plain English", () => {
  assert.equal(formatAnswer(true), "Yes");
  assert.equal(formatAnswer(false), "No");
  assert.equal(formatAnswer(["a", "b"]), "a, b");
  assert.equal(formatAnswer("hello"), "hello");
});

test("formatAnswer shows a dash for an empty string or empty list", () => {
  assert.equal(formatAnswer(""), "—");
  assert.equal(formatAnswer([]), "—");
});
