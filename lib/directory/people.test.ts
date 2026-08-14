/**
 * Card validation and formatting. These rules exist twice on purpose —
 * here and as CHECK constraints in 0060 — so the tests care most about
 * the cases where the two must agree.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  formatPhone,
  isValidPhone,
  normalisePhone,
  validateMyDetails,
  validateName,
  validatePosting,
  type MyDetailsInput,
} from "./people";

const TODAY = "2026-08-14";

const details = (over: Partial<MyDetailsInput> = {}): MyDetailsInput => ({
  phone: null,
  dateOfBirth: null,
  bloodGroup: null,
  emergencyContactName: null,
  emergencyContactPhone: null,
  ...over,
});

test("a number typed the way people type it becomes one the database accepts", () => {
  assert.equal(normalisePhone("+91 98765-43210"), "+919876543210");
  assert.equal(normalisePhone("(0497) 273 1234"), "04972731234");
  assert.equal(normalisePhone("98765 43210"), "9876543210");
  assert.ok(isValidPhone(normalisePhone("+91 98765-43210")!));
});

test("a blank number is absent, not empty string", () => {
  // The column is nullable; "" would be a value meaning nothing.
  assert.equal(normalisePhone(""), null);
  assert.equal(normalisePhone("   "), null);
  assert.equal(normalisePhone(null), null);
});

test("something that isn't a number comes back unchanged, so the caller can complain", () => {
  assert.equal(normalisePhone("call the office"), "call the office");
  assert.ok(!isValidPhone("call the office"));
});

test("a bad phone number is refused with a sentence", () => {
  const error = validateMyDetails(details({ phone: "12345" }), TODAY);
  assert.match(error!, /doesn't look right/);
});

test("an emergency number with no name against it is refused", () => {
  // Mirrors staff_details_emergency_named_check — the app must say this
  // before the database does, or the person sees a Postgres error.
  const error = validateMyDetails(
    details({ emergencyContactPhone: "9876543210", emergencyContactName: "  " }),
    TODAY,
  );
  assert.match(error!, /name of the person to call/);

  assert.equal(
    validateMyDetails(
      details({ emergencyContactPhone: "9876543210", emergencyContactName: "Reena" }),
      TODAY,
    ),
    undefined,
  );
});

test("a birth date in the future is refused, today is not", () => {
  assert.match(validateMyDetails(details({ dateOfBirth: "2027-01-01" }), TODAY)!, /in the future/);
  assert.match(validateMyDetails(details({ dateOfBirth: TODAY }), TODAY)!, /in the future/);
  assert.equal(validateMyDetails(details({ dateOfBirth: "1990-08-14" }), TODAY), undefined);
});

test("a blood group off the list is refused", () => {
  assert.match(validateMyDetails(details({ bloodGroup: "Z+" }), TODAY)!, /from the list/);
  assert.equal(validateMyDetails(details({ bloodGroup: "O+" }), TODAY), undefined);
});

test("an empty card is valid — every field is optional", () => {
  assert.equal(validateMyDetails(details(), TODAY), undefined);
});

test("nobody reports to themselves", () => {
  const error = validatePosting(
    { personId: "abc", departmentId: null, designation: null, reportsToId: "abc", joinedOn: null },
    TODAY,
  );
  assert.match(error!, /can't report to themselves/);
});

test("a joining date in the future is refused, today is fine", () => {
  const posting = (joinedOn: string) => ({
    personId: "abc",
    departmentId: null,
    designation: null,
    reportsToId: null,
    joinedOn,
  });
  assert.match(validatePosting(posting("2026-08-15"), TODAY)!, /in the future/);
  assert.equal(validatePosting(posting(TODAY), TODAY), undefined);
});

test("a name is required and capped", () => {
  assert.match(validateName("  ")!, /can't be blank/);
  assert.match(validateName("x".repeat(81))!, /under 80/);
  assert.equal(validateName("Sivadarsana Nambiar"), undefined);
});

test("an Indian mobile is grouped, anything else is left alone", () => {
  assert.equal(formatPhone("9876543210"), "98765 43210");
  assert.equal(formatPhone("+919876543210"), "98765 43210");
  // A landline grouped by the mobile rule reads worse than not grouped.
  assert.equal(formatPhone("04972731234"), "04972731234");
  assert.equal(formatPhone(null), "");
});
