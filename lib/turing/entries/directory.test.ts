import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { checkProposal } from "../catalogue-fields";
import { BLOOD_GROUPS } from "./directory";

const PERSON = "11111111-1111-4111-8111-111111111111";
const DEPARTMENT = "22222222-2222-4222-8222-222222222222";

const ok = (action: string, row: object) =>
  checkProposal({ action, title: "x", rows: [{ label: "a", ...row }] }).ok;

test("the blood groups are Directory's own", () => {
  const source = readFileSync("lib/directory/people.ts", "utf8");
  const theirs = source.match(/BLOOD_GROUPS = \[([^\]]+)\]/)?.[1];
  assert.ok(theirs);
  assert.deepEqual(
    [...theirs.matchAll(/"([^"]+)"/g)].map((m) => m[1]),
    [...BLOOD_GROUPS],
  );
});

test("a posting says what changes; empty clears a field", () => {
  assert.equal(ok("directory_posting", { person_id: PERSON }), false);
  assert.equal(ok("directory_posting", { person_id: PERSON, designation: "Site Engineer" }), true);
  assert.equal(ok("directory_posting", { person_id: PERSON, reports_to_id: "" }), true);
  assert.equal(ok("directory_posting", { person_id: PERSON, joined_on: "2026-02-30" }), false);
});

test("a department is renamed or switched, never left with no name", () => {
  assert.equal(ok("directory_department_change", { department_id: DEPARTMENT }), false);
  assert.equal(ok("directory_department_change", { department_id: DEPARTMENT, name: "" }), false);
  assert.equal(
    ok("directory_department_change", { department_id: DEPARTMENT, active: false }),
    true,
  );
  assert.equal(ok("directory_department_new", { name: "x".repeat(41) }), false);
});

test("my card takes a listed blood group, and says what changes", () => {
  assert.equal(ok("directory_my_details", {}), false);
  assert.equal(ok("directory_my_details", { blood_group: "B+" }), true);
  assert.equal(ok("directory_my_details", { blood_group: "B" }), false);
  assert.equal(ok("directory_my_details", { phone: "" }), true);
});
