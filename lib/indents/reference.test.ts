import assert from "node:assert/strict";
import { test } from "node:test";

import { indentReference } from "./reference";

test("builds IND/<code>/<3-digit number>", () => {
  assert.equal(indentReference("ASHRAM", 1), "IND/ASHRAM/001");
  assert.equal(indentReference("ASHRAM", 42), "IND/ASHRAM/042");
});

test("indent 1000 is IND/X/1000, never truncated to 100", () => {
  // SQL's lpad('1234', 3, '0') truncates to '123'; the migration guards with greatest(3, length(n)).
  assert.equal(indentReference("X", 1000), "IND/X/1000");
});

test("spacing and case cannot mint two references for one project", () => {
  assert.equal(indentReference("ashram", 7), indentReference("ASH RAM", 7));
});
