/**
 * The bill status machine's button rules — who may do what, at which
 * status. The trigger (migration 0025) is the real boundary; these pin
 * the mirror that decides what renders.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canApprove,
  canApproveContract,
  canDeleteBill,
  canEditBill,
  canEditContract,
  canMarkPaid,
  canSendBack,
  exceedsAnchor,
  isContractBillable,
} from "./workflow";

const adminDecider = { isAdmin: true, isApprover: false };
const approver = { isAdmin: false, isApprover: true };
const bystander = { isAdmin: false, isApprover: false };

const admin = { isAdmin: true, userId: "a" };
const recorder = { isAdmin: false, userId: "r" };
const stranger = { isAdmin: false, userId: "s" };

test("editable only while recorded", () => {
  assert.equal(canEditBill("recorded"), true);
  assert.equal(canEditBill("approved"), false);
  assert.equal(canEditBill("paid"), false);
});

test("approving takes a recorded bill and a named approver or an admin", () => {
  assert.equal(canApprove("recorded", approver), true);
  assert.equal(canApprove("recorded", adminDecider), true);
  assert.equal(canApprove("recorded", bystander), false);
  assert.equal(canApprove("approved", approver), false);
  assert.equal(canApprove("paid", approver), false);
});

test("send-back takes an approved bill and a decider", () => {
  assert.equal(canSendBack("approved", approver), true);
  assert.equal(canSendBack("approved", adminDecider), true);
  assert.equal(canSendBack("approved", bystander), false);
  assert.equal(canSendBack("recorded", approver), false);
  assert.equal(canSendBack("paid", approver), false);
});

test("paying takes an approved bill and a real payment reference", () => {
  assert.equal(canMarkPaid("approved", "UTR123"), true);
  assert.equal(canMarkPaid("approved", "   "), false);
  assert.equal(canMarkPaid("recorded", "UTR123"), false);
  assert.equal(canMarkPaid("paid", "UTR123"), false);
});

test("a recorded bill is its recorder's (or an admin's) to delete, never once approved", () => {
  assert.equal(canDeleteBill("recorded", recorder, "r"), true);
  assert.equal(canDeleteBill("recorded", admin, "r"), true);
  assert.equal(canDeleteBill("recorded", stranger, "r"), false);
  assert.equal(canDeleteBill("approved", recorder, "r"), false);
  assert.equal(canDeleteBill("paid", admin, "r"), false);
});

test("a contract is approved by a decider, and only while pending", () => {
  assert.equal(canApproveContract("pending_approval", approver), true);
  assert.equal(canApproveContract("pending_approval", adminDecider), true);
  assert.equal(canApproveContract("pending_approval", bystander), false);
  assert.equal(canApproveContract("approved", approver), false);
});

test("a contract takes bills only once approved and while active", () => {
  assert.equal(isContractBillable("approved", true), true);
  assert.equal(isContractBillable("approved", false), false);
  assert.equal(isContractBillable("pending_approval", true), false);
});

test("a contract's terms lock on approval", () => {
  assert.equal(canEditContract("pending_approval"), true);
  assert.equal(canEditContract("approved"), false);
});

test("over-billing warns past the anchor total, never at or under it", () => {
  assert.equal(exceedsAnchor(1000, 900, 100), false); // lands exactly on it
  assert.equal(exceedsAnchor(1000, 900, 100.01), true);
  assert.equal(exceedsAnchor(1000, 0, 1500), true);
  // Nothing to compare against — no warning.
  assert.equal(exceedsAnchor(null, 900, 100000), false);
});
