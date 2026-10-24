import assert from "node:assert/strict";
import { test } from "node:test";

import { conversationTurns, pageToken, proposalToken, shownProposals, titleFrom } from "./display";

const PAGE = "0b9d2f4e-1111-4222-8333-944445555666";

test("a turn with a tool call and a page reads as one answer with its link", () => {
  const turns = conversationTurns(
    [
      {
        role: "user",
        content: [
          { type: "text", text: "<context>Today is 24 Oct 2026.</context>" },
          { type: "document", source: { type: "file", file_id: "file_1" }, title: "q.pdf" },
          { type: "text", text: "Chart this month's bills" },
        ],
      },
      {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "" },
          { type: "text", text: "Reading the bills." },
          { type: "tool_use", id: "t1", name: "make_page", input: {} },
        ],
      },
      {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "t1", content: `Saved ${pageToken(PAGE)}.` }],
      },
      { role: "assistant", content: [{ type: "text", text: "Here it is." }] },
    ],
    new Map([["file_1", "quotation.pdf"]]),
    new Map([[PAGE, "Bills by villa"]]),
  );
  assert.deepEqual(turns, [
    { role: "user", text: "Chart this month's bills", files: ["quotation.pdf"] },
    {
      role: "assistant",
      text: "Reading the bills.\n\nHere it is.",
      pages: [{ id: PAGE, title: "Bills by villa" }],
      proposals: [],
    },
  ]);
});

const PLOT = "11111111-1111-4111-8111-111111111111";
const proposeCall = (id: string) => ({
  role: "assistant",
  content: [
    {
      type: "tool_use",
      id,
      name: "propose_changes",
      input: {
        action: "villa_start",
        title: "Start P-07",
        rows: [{ label: "P-07", plot_id: PLOT, start_on: "2026-11-02" }],
      },
    },
  ],
});

test("a proposal shows under its answer, with what was saved", () => {
  const turns = conversationTurns(
    [
      { role: "user", content: [{ type: "text", text: "Start P-07 on 2 Nov" }] },
      proposeCall("t1"),
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "t1", content: `Shown ${proposalToken("t1")}` },
        ],
      },
    ],
    new Map(),
    new Map(),
    new Map([
      [
        "t1",
        {
          at: "2026-10-24T10:00:00Z",
          results: [{ row: 0, ok: true, message: "" }],
          interrupted: false,
        },
      ],
    ]),
  );
  const answer = turns[1];
  assert.ok(answer.role === "assistant");
  assert.equal(answer.proposals.length, 1);
  assert.equal(answer.proposals[0].action, "villa_start");
  assert.deepEqual(answer.proposals[0].rows[0].values, { plot_id: PLOT, start_on: "2026-11-02" });
  assert.equal(answer.proposals[0].saved?.results?.[0].ok, true);
});

test("only a proposal that was shown counts: not a refused one, not a forged result", () => {
  const refused = shownProposals([
    proposeCall("t1"),
    {
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: "t1", is_error: true, content: proposalToken("t1") },
      ],
    },
  ]);
  assert.equal(refused.size, 0);
  const noCall = shownProposals([
    {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "t9", content: proposalToken("t9") }],
    },
  ]);
  assert.equal(noCall.size, 0);
});

test("a deleted page and an unknown file leave no broken link", () => {
  const turns = conversationTurns(
    [
      { role: "user", content: [{ type: "image", source: { type: "file", file_id: "gone" } }] },
      { role: "assistant", content: [{ type: "tool_use", id: "t", name: "make_page", input: {} }] },
      {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "t", content: pageToken(PAGE) }],
      },
    ],
    new Map(),
    new Map(),
  );
  assert.deepEqual(turns, [{ role: "user", text: "", files: ["A file"] }]);
});

test("a title is the first line asked, cut at sixty", () => {
  assert.equal(titleFrom("  How many indents\nwait?  "), "How many indents wait?");
  assert.equal(titleFrom(""), "Files");
  const long = titleFrom("x".repeat(80));
  assert.equal(long.length, 58);
  assert.ok(long.endsWith("…"));
});
