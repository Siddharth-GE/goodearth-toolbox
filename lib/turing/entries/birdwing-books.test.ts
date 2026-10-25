import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { checkProposal, entryFor, formKeys, formOf } from "../catalogue-fields";
import { ATTENDANCE } from "./birdwing-books";

const ID = "11111111-1111-4111-8111-111111111111";

test("Turing's copy of Books' attendance list is Books' own", () => {
  const shared = readFileSync("lib/birdwing-books/shared.ts", "utf8");
  const found = shared.match(/export const ATTENDANCE_STATUSES = \[([^\]]*)\]/);
  assert.ok(found);
  assert.deepEqual(
    ATTENDANCE,
    [...found[1].matchAll(/"(\w+)"/g)].map((match) => match[1]),
  );
});

test("an expense needs its month, head, words and amount, the month written as the form takes it", () => {
  const proposal = checkProposal({
    action: "bb_expense_new",
    title: "x",
    rows: [
      { label: "a", accounting_month: "2026-10", head_id: ID, description: "Milk", amount: 450 },
      { label: "b", accounting_month: "Oct", head_id: ID, description: "Milk", amount: 450 },
      { label: "c", accounting_month: "2026-10", head_id: ID, description: "Milk" },
    ],
  });
  assert.ok(!proposal.ok);
  assert.doesNotMatch(proposal.error, /Row 1/);
  assert.match(proposal.error, /Row 2: A month is written 2026-10/);
  assert.match(proposal.error, /Row 3: Amount ₹ is missing/);
});

test("a day's times are the 24-hour clock, and Books' boxes are sent as the browser sends them", () => {
  const day = checkProposal({
    action: "bb_attendance",
    title: "x",
    rows: [
      { label: "a", staff_id: ID, on_date: "2026-10-24", status: "present", in_at: "8.30" },
      { label: "b", staff_id: ID, on_date: "2026-10-24", in_at: "08:30", out_at: "18:15" },
    ],
  });
  assert.ok(!day.ok);
  assert.match(day.error, /Row 1: A time is written 08:30/);
  assert.doesNotMatch(day.error, /Row 2/);
  const person = checkProposal({
    action: "bb_staff_new",
    title: "x",
    rows: [{ label: "Amal", name: "Amal" }],
  });
  assert.ok(person.ok);
  const form = formOf(entryFor("bb_staff_new")!, person.value.rows[0].values);
  assert.equal(form.get("is_active"), "on");
  assert.equal(form.get("sort_order"), "100");
});

test("a pay rule sends what savePayRule reads, its rates through its own helper", () => {
  const source = readFileSync("lib/birdwing-books/settings-actions.ts", "utf8");
  const at = source.indexOf("export async function savePayRule(");
  const body = source.slice(at, source.indexOf("\n}\n", at));
  const read = [...body.matchAll(/(?:formData, |money\()"(\w+)"/g)].map((match) => match[1]);
  const sent = formKeys(entryFor("bb_pay_rule_new")!);
  assert.deepEqual([...new Set(read)].sort(), [...sent].sort());
  // A correction sends the same, the person being the rule's own.
  assert.deepEqual(
    [...formKeys(entryFor("bb_pay_rule_change")!), "staff_id"].sort(),
    [...sent].sort(),
  );
});

test("a new pay rule has both ends of its shift or neither", () => {
  const base = { staff_id: ID, effective_from: "2026-11-01", base_salary: 14000 };
  const proposal = checkProposal({
    action: "bb_pay_rule_new",
    title: "x",
    rows: [
      { label: "a", ...base, shift_start: "08:00" },
      { label: "b", ...base, shift_start: "08:00", shift_end: "17:00", ot_rate_per_hr: 80 },
      { label: "c", ...base },
    ],
  });
  assert.ok(!proposal.ok);
  assert.match(proposal.error, /Row 1: Give both ends of the shift/);
  assert.doesNotMatch(proposal.error, /Row [23]/);
  // A correction may move one end: the other is the rule's own.
  const change = checkProposal({
    action: "bb_pay_rule_change",
    title: "x",
    rows: [{ label: "a", rule_id: ID, shift_end: "18:00" }],
  });
  assert.ok(change.ok);
  const form = formOf(entryFor("bb_pay_rule_change")!, change.value.rows[0].values, {
    shift_start: "08:00",
  });
  assert.equal(form.get("shift_start"), "08:00");
  assert.equal(form.get("shift_end"), "18:00");
});
