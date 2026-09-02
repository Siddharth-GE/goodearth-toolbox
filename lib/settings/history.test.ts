/**
 * The access history on a person's Settings page is read straight from
 * audit_log, so what each row *says* is the only place a mistake would
 * show. A grant and a revoke must never read alike, an update that
 * touched two columns must report both, and a row Settings didn't write
 * must drop out rather than be narrated wrongly.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { appLabel, describeAccessEvent, describeAccessHistory } from "./history";

const at = "2026-08-05T10:00:00Z";
const base = { at, actorName: "Siddharth" };

test("a grant and a revoke read as opposites, named by their app", () => {
  const granted = describeAccessEvent({
    ...base,
    table_name: "user_apps",
    action: "INSERT",
    old_data: null,
    new_data: { app: "/purchase-orders" },
  });
  assert.equal(granted?.what, "Granted Purchase Orders");

  const revoked = describeAccessEvent({
    ...base,
    table_name: "user_apps",
    action: "DELETE",
    old_data: { app: "/bills" },
    new_data: null,
  });
  assert.equal(revoked?.what, "Removed Bills");
});

test("the actor and time carry through untouched", () => {
  const event = describeAccessEvent({
    ...base,
    table_name: "user_apps",
    action: "INSERT",
    old_data: null,
    new_data: { app: "/masters" },
  });
  assert.equal(event?.actorName, "Siddharth");
  assert.equal(event?.at, at);
});

test("a rename says the new name, and a cleared one doesn't claim a name", () => {
  const renamed = describeAccessEvent({
    ...base,
    table_name: "profiles",
    action: "UPDATE",
    old_data: { full_name: null, role: "staff" },
    new_data: { full_name: "Anu", role: "staff" },
  });
  assert.equal(renamed?.what, 'Name set to "Anu"');

  const cleared = describeAccessEvent({
    ...base,
    table_name: "profiles",
    action: "UPDATE",
    old_data: { full_name: "Anu", role: "staff" },
    new_data: { full_name: null, role: "staff" },
  });
  assert.equal(cleared?.what, "Name cleared");
});

test("promotion and demotion are distinguishable", () => {
  const promoted = describeAccessEvent({
    ...base,
    table_name: "profiles",
    action: "UPDATE",
    old_data: { role: "staff" },
    new_data: { role: "admin" },
  });
  assert.equal(promoted?.what, "Made an admin");

  const demoted = describeAccessEvent({
    ...base,
    table_name: "profiles",
    action: "UPDATE",
    old_data: { role: "admin" },
    new_data: { role: "staff" },
  });
  assert.equal(demoted?.what, "Admin removed");
});

test("deactivation and reactivation are reported, not silently dropped", () => {
  const off = describeAccessEvent({
    ...base,
    table_name: "profiles",
    action: "UPDATE",
    old_data: { is_active: true },
    new_data: { is_active: false },
  });
  assert.equal(off?.what, "Deactivated");

  const on = describeAccessEvent({
    ...base,
    table_name: "profiles",
    action: "UPDATE",
    old_data: { is_active: false },
    new_data: { is_active: true },
  });
  assert.equal(on?.what, "Reactivated");
});

test("one update touching two columns reports both, not just the first", () => {
  const event = describeAccessEvent({
    ...base,
    table_name: "profiles",
    action: "UPDATE",
    old_data: { full_name: "Anu", role: "staff" },
    new_data: { full_name: "Anu Mary", role: "admin" },
  });
  assert.equal(event?.what, 'Name set to "Anu Mary" · Made an admin');
});

test("an update that changed nothing readable produces no line", () => {
  const event = describeAccessEvent({
    ...base,
    table_name: "profiles",
    action: "UPDATE",
    old_data: { full_name: "Anu", role: "staff", team: "design" },
    new_data: { full_name: "Anu", role: "staff", team: "site" },
  });
  assert.equal(event, null);
});

test("a table Settings never writes is dropped rather than narrated", () => {
  const event = describeAccessEvent({
    ...base,
    table_name: "items",
    action: "UPDATE",
    old_data: { name: "Tap" },
    new_data: { name: "Tap 2" },
  });
  assert.equal(event, null);
});

test("the history keeps order and silently drops what it can't explain", () => {
  const events = describeAccessHistory([
    {
      ...base,
      table_name: "user_apps",
      action: "INSERT",
      old_data: null,
      new_data: { app: "/indents" },
    },
    { ...base, table_name: "items", action: "UPDATE", old_data: {}, new_data: {} },
    { ...base, table_name: "profiles", action: "INSERT", old_data: null, new_data: { id: "u1" } },
  ]);
  assert.deepEqual(
    events.map((event) => event.what),
    ["Granted Indents", "Account created"],
  );
});

test("app labels are readable, not slugs", () => {
  assert.equal(appLabel("/masters"), "Projects & Masters");
  assert.equal(appLabel("/purchase-orders"), "Purchase Orders");
  assert.equal(appLabel("/management-dashboard"), "Management dashboard");
});
