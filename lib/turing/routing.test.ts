import assert from "node:assert/strict";
import { test } from "node:test";

import { fallsBackOnServer, judgeInput, lastQuestion, levelFrom, MODEL_FOR } from "./routing";

const context = { type: "text", text: "<context>It is Thursday in Kannur.</context>" };
const ask = (text: string, route: string | null) => ({
  role: "user",
  content: [context, { type: "text", text }],
  route,
});
const say = (text: string) => ({
  role: "assistant",
  content: [{ type: "text", text }],
  route: null,
});

test("the last routed question is the one followed, Think harder counting as deep", () => {
  assert.equal(lastQuestion([]), null);
  assert.equal(lastQuestion([ask("old", null), say("hi")]), null);
  assert.deepEqual(lastQuestion([ask("a", "quick"), say("x"), ask("b", "standard"), say("y")]), {
    level: "standard",
    text: "b",
  });
  assert.equal(lastQuestion([ask("a", "asked"), say("x")])?.level, "deep");
  assert.equal(lastQuestion([ask("a", "nonsense")]), null);
});

test("the judge sees what was typed, never the context line", () => {
  const input = judgeInput(
    [context, { type: "document", source: { file_id: "f" } }, { type: "text", text: "Check this" }],
    { level: "deep", text: "Make a dashboard" },
  );
  assert.ok(!input.includes("<context>"));
  assert.match(input, /Previous level: deep/);
  assert.match(input, /Make a dashboard/);
  assert.match(input, /Files dropped in with it: 1/);
  assert.match(input, /Check this/);
  assert.match(judgeInput([context], null), /first message[\s\S]*only the files/);
});

test("a long message is clipped for the judge", () => {
  const input = judgeInput([{ type: "text", text: "x".repeat(5000) }], null);
  assert.match(input, /1000 more characters/);
});

test("only a known level is taken from the judge", () => {
  assert.equal(levelFrom('{"level":"quick"}'), "quick");
  assert.equal(levelFrom('{"level":"asked"}'), null);
  assert.equal(levelFrom("deep"), null);
  assert.equal(levelFrom(""), null);
});

test("Haiku alone answers without the server-side fallback", () => {
  assert.equal(fallsBackOnServer(MODEL_FOR.quick), false);
  assert.equal(fallsBackOnServer(MODEL_FOR.standard), true);
  assert.equal(fallsBackOnServer(MODEL_FOR.deep), true);
});
