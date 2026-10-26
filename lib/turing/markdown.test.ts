import assert from "node:assert/strict";
import { test } from "node:test";

import { parseInline, parseMarkdown } from "./markdown";

test("bold and code inside a line", () => {
  assert.deepEqual(parseInline("**12** indents wait, see `IND-0042`."), [
    { text: "12", bold: true },
    { text: " indents wait, see " },
    { text: "IND-0042", code: true },
    { text: "." },
  ]);
});

test("an answer with a heading, a list, a table and a paragraph", () => {
  const blocks = parseMarkdown(
    [
      "## Waiting indents",
      "",
      "- Plot 7: **3**",
      "- Plot 9: 1",
      "",
      "| Villa | Lines |",
      "| --- | ---: |",
      "| P-07 | 12 |",
      "| P-09 | 4 |",
      "",
      "That is all",
      "for today.",
      "1. First",
      "2. Second",
    ].join("\n"),
  );
  assert.deepEqual(
    blocks.map((block) => block.type),
    ["heading", "list", "table", "paragraph", "list"],
  );
  const table = blocks[2];
  assert.ok(table.type === "table");
  assert.deepEqual(table.header, [[{ text: "Villa" }], [{ text: "Lines" }]]);
  assert.equal(table.rows.length, 2);
  const paragraph = blocks[3];
  assert.ok(paragraph.type === "paragraph");
  assert.deepEqual(paragraph.inline, [{ text: "That is all for today." }]);
  const ordered = blocks[4];
  assert.ok(ordered.type === "list" && ordered.ordered && ordered.items.length === 2);
});

test("a fenced block stays as written, and HTML stays text", () => {
  const blocks = parseMarkdown("```\nconst a = 1;\n```\n<script>alert(1)</script>");
  assert.deepEqual(blocks[0], { type: "code", text: "const a = 1;" });
  assert.deepEqual(blocks[1], {
    type: "paragraph",
    inline: [{ text: "<script>alert(1)</script>" }],
  });
});
