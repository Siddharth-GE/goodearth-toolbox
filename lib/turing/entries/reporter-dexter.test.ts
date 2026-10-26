import assert from "node:assert/strict";
import { test } from "node:test";

import { checkProposal } from "../catalogue-fields";

const ID = "11111111-1111-4111-8111-111111111111";

const ok = (action: string, row: object) =>
  checkProposal({ action, title: "x", rows: [{ label: "a", ...row }] }).ok;

test("a report or project change says what changes, and never empties the name", () => {
  assert.equal(ok("report_change", { report_id: ID }), false);
  assert.equal(ok("report_change", { report_id: ID, description: "" }), true);
  assert.equal(ok("report_change", { report_id: ID, name: "" }), false);
  assert.equal(ok("report_change", { report_id: ID, description: "x".repeat(301) }), false);
  assert.equal(ok("dexter_project_change", { project_id: ID }), false);
  assert.equal(ok("dexter_project_change", { project_id: ID, client_name: "" }), true);
  assert.equal(ok("dexter_project_change", { project_id: ID, name: "" }), false);
});

test("a deck's link is said on or off, and its title is Dexter's length", () => {
  assert.equal(ok("dexter_deck_link", { deck_id: ID }), false);
  assert.equal(ok("dexter_deck_link", { deck_id: ID, link_on: false }), true);
  assert.equal(ok("dexter_deck_rename", { deck_id: ID, title: "x".repeat(121) }), false);
  assert.equal(ok("dexter_project_new", { name: "Saarang pitch" }), true);
});
