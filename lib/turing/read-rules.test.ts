import assert from "node:assert/strict";
import { test } from "node:test";

import { BULK_LIMIT, checkRead, checkRecipe, DIRECT_LIMIT } from "./read-rules";
import type { Schema } from "./schema";

const schema: Schema = {
  indents: { kind: "table", columns: { id: "string", status: "string", created_at: "string" } },
  po_facts: { kind: "view", columns: { po_id: "string", vendor: "string | null" } },
};

test("a bare read takes every column and a hundred rows", () => {
  const read = checkRead({ table: "indents" }, schema, DIRECT_LIMIT);
  assert.ok(read.ok);
  assert.deepEqual(read.value.columns, ["id", "status", "created_at"]);
  assert.equal(read.value.limit, 100);
  assert.equal(read.value.countOnly, false);
});

test("unknown tables and columns are refused, by name", () => {
  const table = checkRead({ table: "auth.users" }, schema, DIRECT_LIMIT);
  assert.equal(table.ok, false);
  const column = checkRead({ table: "indents", columns: ["id", "vendors(name)"] }, schema, 10);
  assert.ok(!column.ok && column.error.includes("vendors(name)"));
  const inherited = checkRead({ table: "constructor" }, schema, DIRECT_LIMIT);
  assert.equal(inherited.ok, false);
});

test("filters are checked and written the way PostgREST reads them", () => {
  const read = checkRead(
    {
      table: "indents",
      filters: [
        { column: "status", op: "in", value: ["submitted", 'say "hi", (now)'] },
        { column: "created_at", op: "gte", value: "2026-10-01" },
        { column: "status", op: "is", value: null },
      ],
    },
    schema,
    DIRECT_LIMIT,
  );
  assert.ok(read.ok);
  assert.deepEqual(read.value.filters, [
    { column: "status", op: "in", value: '("submitted","say \\"hi\\", (now)")' },
    { column: "created_at", op: "gte", value: "2026-10-01" },
    { column: "status", op: "is", value: "null" },
  ]);
});

test("bad filters are refused", () => {
  for (const filter of [
    { column: "status", op: "like", value: "x" },
    { column: "status", op: "is", value: "null" },
    { column: "status", op: "in", value: [] },
    { column: "status", op: "eq", value: { a: 1 } },
    { column: "nope", op: "eq", value: 1 },
  ]) {
    assert.equal(checkRead({ table: "indents", filters: [filter] }, schema, 10).ok, false);
  }
});

test("the limit depends on who asks", () => {
  assert.equal(checkRead({ table: "indents", limit: 600 }, schema, DIRECT_LIMIT).ok, false);
  const bulk = checkRead({ table: "indents", limit: 600 }, schema, BULK_LIMIT);
  assert.ok(bulk.ok && bulk.value.limit === 600);
  assert.equal(checkRead({ table: "indents", limit: 0 }, schema, BULK_LIMIT).ok, false);
});

test("a recipe names each read once and checks each", () => {
  const recipe = checkRecipe(
    [
      {
        name: "open_indents",
        table: "indents",
        filters: [{ column: "status", op: "eq", value: "submitted" }],
      },
      { name: "pos", table: "po_facts", columns: ["po_id"] },
    ],
    schema,
  );
  assert.ok(recipe.ok && recipe.value.length === 2);
  assert.equal(checkRecipe([], schema).ok, false);
  assert.equal(
    checkRecipe(
      [
        { name: "a", table: "indents" },
        { name: "a", table: "indents" },
      ],
      schema,
    ).ok,
    false,
  );
  assert.equal(checkRecipe([{ name: "Bad Name", table: "indents" }], schema).ok, false);
  const nested = checkRecipe([{ name: "x", table: "nope" }], schema);
  assert.ok(!nested.ok && nested.error.startsWith("x:"));
});
