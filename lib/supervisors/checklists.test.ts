import assert from "node:assert/strict";
import { test } from "node:test";

import type { SheetRow } from "@/lib/masters/masters-workbook";
import { readChecklistWorkbook } from "./checklist-workbook";
import { checklistProgress, checkStatusOf, needsRemark, signOffProblem } from "./checklists";

const row = (n: number, ...cells: (string | undefined)[]): SheetRow => ({ row: n, cells });

const blockwork: SheetRow[] = [
  row(1, "Blockwork Checklist"),
  row(3, "Project / Plot No.", undefined, undefined, "Location / Floor"),
  row(6, "Work References", undefined, "SS.1, SS.2a-SS.2d"),
  row(9, "No.", "Source No.", "Checklist Item", "Status", "Remarks / Action", "Origin", "Review"),
  row(10, "1", "1", "Check block   dimensions.", "Not Checked", undefined, "Source"),
  row(11, "2", "2", "Moisten blocks.", "Not Checked", undefined, "Review", "Confirm wetting."),
  row(12, "3", "Added", "Check wall thickness.", "Not Checked", undefined, "Added"),
  row(14, "Supervisor", undefined, undefined, "Checked By"),
  row(16, "4", "4", "Not an item: after the table ended."),
];

const concrete: SheetRow[] = [
  row(1, "A option to upload Grade of concrete"),
  row(2, "Work", "Grade", "Upload test"),
  row(3, "Floor PCC"),
  row(4, "Column upto Plinth"),
  row(5, "Column upto Plinth"),
  row(6, "Bedblock concrete "),
];

test("each sheet is a template; items stop where the table stops", () => {
  const templates = readChecklistWorkbook(
    new Map([
      ["Blockwork", blockwork],
      ["Empty", [row(1, "Nothing here")]],
      ["Concrete grade check", concrete],
    ]),
  );
  assert.deepEqual(
    templates.map((template) => [template.name, template.sortOrder, template.items.length]),
    [
      ["Blockwork", 1, 3],
      ["Concrete grade check", 2, 4],
    ],
  );
  const [block, grade] = templates;
  assert.equal(block.workRefs, "SS.1, SS.2a-SS.2d");
  assert.deepEqual(block.items[0], {
    sortOrder: 1,
    text: "Check block dimensions.",
    origin: "source",
    reviewNote: null,
  });
  assert.equal(block.items[1].origin, "review");
  assert.equal(block.items[1].reviewNote, "Confirm wetting.");
  assert.equal(block.items[2].origin, "added");
  // The grade record's works repeat per floor; each stays its own item, in order.
  assert.deepEqual(
    grade.items.map((item) => item.text),
    ["Floor PCC", "Column upto Plinth", "Column upto Plinth", "Bedblock concrete"],
  );
  assert.match(grade.note ?? "", /grade in Remarks/);
  assert.equal(grade.workRefs, null);
});

test("sign-off needs every item answered and a remark on each Fail and N/A", () => {
  assert.match(signOffProblem([]) ?? "", /no items/);
  assert.match(
    signOffProblem([
      { status: "pass", remarks: null },
      { status: "not_checked", remarks: null },
      { status: "not_checked", remarks: null },
    ]) ?? "",
    /2 are not checked/,
  );
  assert.match(signOffProblem([{ status: "fail", remarks: "  " }]) ?? "", /every Fail and N\/A/);
  assert.equal(
    signOffProblem([
      { status: "pass", remarks: null },
      { status: "na", remarks: "No sunken slab here" },
      { status: "fail", remarks: "Cracked blocks replaced" },
    ]),
    undefined,
  );
  assert.equal(needsRemark({ status: "na", remarks: null }), true);
  assert.equal(needsRemark({ status: "pass", remarks: null }), false);
});

test("progress counts answers and failures; a status is one of four", () => {
  assert.deepEqual(
    checklistProgress([
      { status: "pass", remarks: null },
      { status: "fail", remarks: "x" },
      { status: "not_checked", remarks: null },
    ]),
    { answered: 2, total: 3, failed: 1 },
  );
  assert.equal(checkStatusOf("na"), "na");
  assert.equal(checkStatusOf("not_checked"), "not_checked");
  assert.equal(checkStatusOf("maybe"), null);
});
