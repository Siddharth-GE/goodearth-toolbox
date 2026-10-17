// birdwing_stays_guard (0115) is the real boundary; these pin the mirror and must list exactly the guard's moves.
import assert from "node:assert/strict";
import { test } from "node:test";

import { STAY_STATUSES } from "./shared";
import {
  canEditCharges,
  canEditDetails,
  canEditRooms,
  canMove,
  isUndo,
  issueBlocker,
  moveLabel,
  nextStatuses,
} from "./workflow";

test("the forward path, and nothing jumps", () => {
  assert.deepEqual(nextStatuses("enquiry"), ["confirmed", "cancelled"]);
  assert.deepEqual(nextStatuses("confirmed"), ["checked_in", "cancelled"]);
  assert.equal(canMove("confirmed", "checked_out"), false);
  assert.equal(canMove("enquiry", "checked_in"), false);
});

test("check-in and check-out can each be undone, one step", () => {
  assert.equal(canMove("checked_in", "confirmed"), true);
  assert.equal(canMove("checked_out", "checked_in"), true);
  assert.equal(canMove("checked_out", "confirmed"), false);
  assert.equal(isUndo("checked_in", "confirmed"), true);
  assert.equal(isUndo("confirmed", "checked_in"), false);
});

test("cancelled is final; a stay in the house is not cancelled", () => {
  assert.deepEqual(nextStatuses("cancelled"), []);
  assert.equal(canMove("checked_in", "cancelled"), false);
  assert.equal(canMove("checked_out", "cancelled"), false);
});

test("a room block is only ever removed", () => {
  assert.deepEqual(nextStatuses("blocked"), ["cancelled"]);
  assert.equal(moveLabel("blocked", "cancelled"), "Remove block");
  assert.equal(moveLabel("confirmed", "cancelled"), "Cancel stay");
});

test("the button words", () => {
  assert.equal(moveLabel("enquiry", "confirmed"), "Confirm");
  assert.equal(moveLabel("confirmed", "checked_in"), "Check in");
  assert.equal(moveLabel("checked_in", "checked_out"), "Check out");
  assert.equal(moveLabel("checked_in", "confirmed"), "Undo check-in");
  assert.equal(moveLabel("checked_out", "checked_in"), "Undo check-out");
});

test("every status has a list, and every move lands on a real status", () => {
  for (const status of STAY_STATUSES) {
    for (const next of nextStatuses(status)) assert.ok(STAY_STATUSES.includes(next));
  }
});

test("rooms freeze once the stay has ended or been cancelled", () => {
  assert.equal(canEditRooms("confirmed"), true);
  assert.equal(canEditRooms("checked_in"), true);
  assert.equal(canEditRooms("checked_out"), false);
  assert.equal(canEditRooms("cancelled"), false);
  assert.equal(canEditDetails("checked_out"), true);
  assert.equal(canEditDetails("cancelled"), false);
});

test("charges: never on a block, frozen by an issued invoice", () => {
  assert.equal(canEditCharges({ isBlock: false, hasIssuedInvoice: false }), true);
  assert.equal(canEditCharges({ isBlock: false, hasIssuedInvoice: true }), false);
  assert.equal(canEditCharges({ isBlock: true, hasIssuedInvoice: false }), false);
});

test("issuing says why not, in order", () => {
  const ready = { isBlock: false, hasIssuedInvoice: false, chargeCount: 2, hasCompany: true };
  assert.equal(issueBlocker(ready), null);
  assert.match(issueBlocker({ ...ready, chargeCount: 0 }) ?? "", /charge/);
  assert.match(issueBlocker({ ...ready, hasCompany: false }) ?? "", /Settings/);
  assert.match(issueBlocker({ ...ready, isBlock: true }) ?? "", /block/);
  assert.match(issueBlocker({ ...ready, hasIssuedInvoice: true }) ?? "", /issued/);
});
