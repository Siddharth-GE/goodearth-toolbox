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
  exceedsApprovalLimit,
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

// The limit matrix (0033). A ceiling that leaked would either block a
// legitimate approval or, far worse, let one through — so every corner
// is pinned: at the limit, either side of it, unlimited, and admin.
const capped = { isAdmin: false, isApprover: true, approvalLimit: 50000 };

test("an approver's limit passes below and at the number, and stops above it", () => {
  assert.equal(canApprove("recorded", capped, 49000), true);
  assert.equal(canApprove("recorded", capped, 50000), true, "a limit means up to and including");
  assert.equal(canApprove("recorded", capped, 51000), false);
});

test("no limit means unlimited, not nothing — every approver who predates limits", () => {
  const unlimited = { isAdmin: false, isApprover: true, approvalLimit: null };
  assert.equal(canApprove("recorded", unlimited, 10_000_000), true);
  // Absent field, the shape callers used before 0033.
  assert.equal(canApprove("recorded", { isAdmin: false, isApprover: true }, 10_000_000), true);
});

test("an admin is never capped, whatever the amount or the stored limit", () => {
  const cappedAdmin = { isAdmin: true, isApprover: true, approvalLimit: 1000 };
  assert.equal(canApprove("recorded", cappedAdmin, 10_000_000), true);
  assert.equal(exceedsApprovalLimit(cappedAdmin, 10_000_000), false);
});

test("a limit never promotes a bystander into an approver", () => {
  assert.equal(
    canApprove("recorded", { isAdmin: false, isApprover: false, approvalLimit: 1e9 }, 1),
    false,
  );
});

test("an unknown amount is not treated as zero, nor as over the limit", () => {
  assert.equal(canApprove("recorded", capped, null), true);
  assert.equal(exceedsApprovalLimit(capped, null), false);
});

test("send-back is not capped — a big bill must still be returnable", () => {
  assert.equal(canSendBack("approved", capped), true);
});

test("a contract is capped by the same limit as a bill", () => {
  assert.equal(canApproveContract("pending_approval", capped, 40000), true);
  assert.equal(canApproveContract("pending_approval", capped, 60000), false);
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
