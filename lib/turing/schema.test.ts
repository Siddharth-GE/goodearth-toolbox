import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { TURING_SCHEMA } from "./schema.generated";
import { parseSchema, schemaModule } from "./schema";

test("the generated schema matches the database types", () => {
  const fresh = schemaModule(parseSchema(readFileSync("lib/supabase/database.types.ts", "utf8")));
  assert.equal(
    readFileSync("lib/turing/schema.generated.ts", "utf8"),
    fresh,
    "run: npx tsx scripts/turing-schema.ts",
  );
});

test("tables and views are both read, with their row columns only", () => {
  assert.equal(TURING_SCHEMA.indents?.kind, "table");
  assert.equal(TURING_SCHEMA.po_facts?.kind, "view");
  assert.ok("id" in TURING_SCHEMA.indents.columns);
  assert.equal(TURING_SCHEMA.functions_should_not_appear, undefined);
});

test("Turing's own tables are never readable through it", () => {
  const text = schemaModule({
    indents: { kind: "table", columns: { id: "string" } },
    turing_messages: { kind: "table", columns: { content: "Json" } },
  });
  assert.ok(text.includes('"indents"'));
  assert.ok(!text.includes("turing_messages"));
});

test("a wrapped union joins onto its column", () => {
  const source = [
    "export type Database = {",
    "  public: {",
    "    Tables: {",
    "      things: {",
    "        Row: {",
    "          id: string",
    "          status:",
    '            | "open"',
    '            | "closed"',
    "        }",
    "        Insert: {",
    "          id?: string",
    "        }",
    "      }",
    "    }",
    "    Views: {",
    "      thing_facts: {",
    "        Row: {",
    "          total: number | null",
    "        }",
    "      }",
    "    }",
    "    Functions: {",
    "      do_it: {",
    "        Args: { x: string }",
    "      }",
    "    }",
    "  }",
    "}",
  ].join("\n");
  assert.deepEqual(parseSchema(source), {
    things: { kind: "table", columns: { id: "string", status: '"open" | "closed"' } },
    thing_facts: { kind: "view", columns: { total: "number | null" } },
  });
});
