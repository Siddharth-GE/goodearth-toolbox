import assert from "node:assert/strict";
import { test } from "node:test";

import { replayable } from "./replay";

const ask = (text: string) => ({ role: "user", content: [{ type: "text", text }] });
const say = (text: string) => ({ role: "assistant", content: [{ type: "text", text }] });
const call = (id: string, caller = "direct") => ({
  role: "assistant",
  content: [{ type: "tool_use", id, name: "fetch_rows", input: {}, caller: { type: caller } }],
});
const result = (id: string) => ({
  role: "user",
  content: [{ type: "tool_result", tool_use_id: id, content: "[]" }],
});

test("finished exchanges replay whole", () => {
  const history = [ask("a"), call("t1"), result("t1"), say("done"), ask("b"), say("ok")];
  assert.deepEqual(replayable(history), history);
});

test("a turn stopped while a tool ran keeps only its question", () => {
  const history = [ask("a"), say("fine"), ask("b"), call("t1", "code_execution_20260120")];
  assert.deepEqual(replayable(history), [ask("a"), say("fine"), ask("b")]);
});

test("a turn stopped after the results were saved keeps only its question", () => {
  const history = [ask("a"), call("t1"), result("t1")];
  assert.deepEqual(replayable(history), [ask("a")]);
});

test("a paused turn whose code never finished keeps only its question", () => {
  const paused = {
    role: "assistant",
    content: [{ type: "server_tool_use", id: "s1", name: "code_execution", input: {} }],
  };
  const resumed = {
    role: "assistant",
    content: [
      { type: "server_tool_use", id: "s1", name: "code_execution", input: {} },
      { type: "bash_code_execution_tool_result", tool_use_id: "s1", content: {} },
      { type: "text", text: "12" },
    ],
  };
  assert.deepEqual(replayable([ask("a"), paused]), [ask("a")]);
  assert.deepEqual(replayable([ask("a"), paused, resumed]), [ask("a"), paused, resumed]);
});

test("the same history trims the same way every time, whatever follows", () => {
  const broken = [ask("a"), call("t1")];
  const later = [...broken, ask("b"), say("ok")];
  assert.deepEqual(replayable(later), [ask("a"), ask("b"), say("ok")]);
  assert.deepEqual(replayable(replayable(later)), replayable(later));
});
