/**
 * The PO status machine's button rules — who may do what, at which
 * status. The trigger (migration 0021) is the real boundary; these pin
 * the mirror that decides what renders.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canApproveDeletion,
  canDeleteDraft,
  canEditPo,
  canIssue,
  canRequestDeletion,
  canWithdrawDeletion,
} from "./workflow";

const admin = { isAdmin: true, userId: "a" };
const creator = { isAdmin: false, userId: "c" };
const stranger = { isAdmin: false, userId: "s" };

test("editable only as a draft", () => {
  assert.equal(canEditPo("draft"), true);
  assert.equal(canEditPo("issued"), false);
  assert.equal(canEditPo("deletion_requested"), false);
});

test("issuing needs lines and full pricing", () => {
  assert.equal(canIssue("draft", 3, true), true);
  assert.equal(canIssue("draft", 0, true), false);
  assert.equal(canIssue("draft", 3, false), false);
  assert.equal(canIssue("issued", 3, true), false);
});

test("a draft is its creator's (or an admin's) to delete", () => {
  assert.equal(canDeleteDraft("draft", creator, "c"), true);
  assert.equal(canDeleteDraft("draft", admin, "c"), true);
  assert.equal(canDeleteDraft("draft", stranger, "c"), false);
  assert.equal(canDeleteDraft("issued", creator, "c"), false);
});

test("deletion: anyone asks, the requester or an admin withdraws, only an admin approves", () => {
  assert.equal(canRequestDeletion("issued"), true);
  assert.equal(canRequestDeletion("draft"), false);

  assert.equal(canWithdrawDeletion("deletion_requested", creator, "c"), true);
  assert.equal(canWithdrawDeletion("deletion_requested", admin, "c"), true);
  assert.equal(canWithdrawDeletion("deletion_requested", stranger, "c"), false);

  assert.equal(canApproveDeletion("deletion_requested", admin), true);
  assert.equal(canApproveDeletion("deletion_requested", creator), false);
  assert.equal(canApproveDeletion("issued", admin), false);
});
