/**
 * Reading the expenses sheet: the workbook's own columns and date forms,
 * and the repeat-upload key that makes a second upload add nothing.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { readAmount, readDay, readExpenseUpload, readMonth } from "./upload";

const HEADS = ["Staff Salaries", "Food Supplies", "Electricity"];
const HEADER =
  "Month,Category,Description / Staff,Date,Amount (INR),Remarks,Invoice Link,Source Sheet,Source Cell,Review Note";

test("months and days the way the sheet wrote them", () => {
  assert.equal(readMonth("2025-10-01T00:00:00"), "2025-10-01");
  assert.equal(readMonth("2026-02"), "2026-02-01");
  assert.equal(readMonth("Oct 2025"), "2025-10-01");
  assert.equal(readMonth("February '26"), "2026-02-01");
  assert.equal(readMonth("Smarch 2026"), null);
  assert.equal(readDay("2025-10-02T00:00:00"), "2025-10-02");
  assert.equal(readDay("2/10/2025"), "2025-10-02");
  assert.equal(readDay("31/02/2026"), null);
  assert.equal(readAmount("₹ 1,234.50"), 1234.5);
  assert.equal(readAmount("abc"), null);
});

test("a line from the workbook, keyed by its sheet and cell", () => {
  const { lines, error } = readExpenseUpload(
    `${HEADER}\n2025-10-01T00:00:00,Staff Salaries,Amal,,30000,,,October Expenses,H4,Monthly salary; payment date not supplied`,
    HEADS,
  );
  assert.equal(error, undefined);
  assert.equal(lines.length, 1);
  assert.deepEqual(lines[0], {
    row: 2,
    sourceKey: "October Expenses!H4",
    month: "2025-10-01",
    head: "Staff Salaries",
    description: "Amal",
    spentOn: null,
    amount: 30000,
    remarks: null,
    reviewNote: "Monthly salary; payment date not supplied",
    problems: [],
  });
});

test("what is wrong is said per line; a heading is matched ignoring case", () => {
  const { lines } = readExpenseUpload(
    `${HEADER}\n2025-10,food supplies,Rice,2025-11-02,450,,,,,\n,Gardening,Seeds,,x,,,,,`,
    HEADS,
  );
  assert.equal(lines[0].head, "Food Supplies");
  assert.equal(lines[0].reviewNote, "paid outside its accounting month");
  assert.match(lines[0].sourceKey, /^line:2025-10-01\|food supplies\|Rice/);
  assert.deepEqual(lines[1].problems, [
    "no month",
    'no expense head called "Gardening"',
    "no amount",
  ]);
});

test("a sheet without the columns is refused in one sentence", () => {
  const { error } = readExpenseUpload("Date,Amount\n2025-10-01,100", HEADS);
  assert.match(error ?? "", /Missing: Month, Category, Description \/ Staff/);
  assert.match(readExpenseUpload("", HEADS).error ?? "", /nothing/);
});
