import assert from "node:assert/strict";
import { test } from "node:test";

import { checkProposal, entryFor } from "../catalogue-fields";

const ID = "11111111-1111-4111-8111-111111111111";
const ITEM = "22222222-2222-4222-8222-222222222222";

const propose = (action: string, row: Record<string, unknown>) =>
  checkProposal({ action, title: "Decide", rows: [{ label: "a", ...row }] });

test("each decision is its own tool's, about one record", () => {
  const decisions: [string, string, string][] = [
    ["indent_approve", "/indents", "indent_id"],
    ["indent_send_back", "/indents", "indent_id"],
    ["po_cancel_approve", "/purchase-orders", "po_id"],
    ["work_order_approve", "/bills", "work_order_id"],
    ["bill_approve", "/bills", "bill_id"],
    ["bill_send_back", "/bills", "bill_id"],
    ["item_request_accept", "/masters", "request_id"],
    ["item_request_merge", "/masters", "request_id"],
    ["item_request_reject", "/masters", "request_id"],
  ];
  for (const [key, tool, record] of decisions) {
    const entry = entryFor(key);
    assert.ok(entry, key);
    assert.equal(entry.tool, tool, key);
    assert.deepEqual(
      entry.fields.filter((field) => field.record).map((field) => field.key),
      [record],
      key,
    );
    assert.equal(entry.adds, undefined, key);
  }
});

test("a send-back needs its note, as the screens' dialogs do", () => {
  for (const key of ["indent_send_back", "bill_send_back"]) {
    const record = key.startsWith("indent") ? "indent_id" : "bill_id";
    assert.equal(propose(key, { [record]: ID }).ok, false, key);
    assert.equal(propose(key, { [record]: ID, note: "  " }).ok, false, key);
    assert.ok(propose(key, { [record]: ID, note: "Rates are last month's." }).ok, key);
  }
});

test("an item request is accepted with a code or none", () => {
  const none = propose("item_request_accept", { request_id: ID });
  assert.ok(none.ok);
  assert.equal("code" in none.value.rows[0].values, false);
  const code = propose("item_request_accept", { request_id: ID, code: "WALL338" });
  assert.ok(code.ok);
  assert.equal(code.value.rows[0].values.code, "WALL338");
});

test("a merge names the item it is the same as", () => {
  assert.equal(propose("item_request_merge", { request_id: ID }).ok, false);
  assert.ok(propose("item_request_merge", { request_id: ID, item_id: ITEM }).ok);
});
