import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  catalogueText,
  checkProposal,
  editedRows,
  entryFor,
  ENTRIES,
  idsOf,
  LABOUR_LOG_FORM,
  labourConflict,
} from "./catalogue-fields";

const PLOT = "11111111-1111-4111-8111-111111111111";
const GROUP = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";

test("every entry has a unique key, a tool and fields", () => {
  assert.equal(new Set(ENTRIES.map((entry) => entry.key)).size, ENTRIES.length);
  for (const entry of ENTRIES) {
    assert.ok(entry.tool.startsWith("/"));
    assert.ok(entry.fields.length > 0);
  }
});

test("a good proposal passes, with empties where a field may be empty", () => {
  const proposal = checkProposal({
    action: "stage_plan",
    title: "P-07 schedule",
    rows: [
      {
        label: "P-07 · SS.01",
        plot_id: PLOT,
        group_id: GROUP,
        days: 6,
        pinned_start: "2026-11-02",
      },
      { label: "P-07 · SS.02", values: { plot_id: PLOT, group_id: OTHER, days: "" } },
    ],
  });
  assert.ok(proposal.ok);
  assert.deepEqual(proposal.value.rows[0].values, {
    plot_id: PLOT,
    group_id: GROUP,
    days: "6",
    pinned_start: "2026-11-02",
  });
  // Left out keeps what is there; given empty clears it.
  assert.equal("pinned_start" in proposal.value.rows[1].values, false);
  assert.equal(proposal.value.rows[1].values.days, "");
});

test("an impossible date is refused, not rolled into the next month", () => {
  const proposal = checkProposal({
    action: "villa_start",
    title: "x",
    rows: [{ label: "P-07", plot_id: PLOT, start_on: "2026-02-30" }],
  });
  assert.ok(!proposal.ok && /real date/.test(proposal.error));
});

test("every id a row names is gathered by table, for its name", () => {
  const entry = entryFor("stage_follows")!;
  const ids = idsOf(entry, [
    { label: "a", values: { plot_id: PLOT, group_id: GROUP, follows_group_id: OTHER } },
    { label: "b", values: { plot_id: PLOT, group_id: OTHER } },
  ]);
  assert.deepEqual([...(ids.get("plots") ?? [])], [PLOT]);
  assert.deepEqual([...(ids.get("work_groups") ?? [])].sort(), [GROUP, OTHER].sort());
});

test("an id a row sets is locked too, not only what the row is about", () => {
  const entry = entryFor("villa_supervisor")!;
  const original = [{ label: "P-07", values: { plot_id: PLOT, supervisor_id: GROUP } }];
  assert.equal(
    editedRows(entry, original, [{ row: 0, values: { supervisor_id: OTHER } }]).ok,
    false,
  );
  assert.equal(editedRows(entry, original, [{ row: 0 }]).ok, true);
});

test("a bad proposal says which rows and why", () => {
  const proposal = checkProposal({
    action: "stage_status",
    title: "Statuses",
    rows: [
      { label: "ok", plot_id: PLOT, group_id: GROUP, status: "done" },
      { label: "bad", plot_id: PLOT, group_id: GROUP, status: "finished" },
      { plot_id: "P-07", group_id: GROUP, status: "done" },
    ],
  });
  assert.ok(!proposal.ok);
  assert.match(proposal.error, /Row 2: Status is one of/);
  assert.match(proposal.error, /Row 3: Each row needs a label/);
  assert.equal(checkProposal({ action: "delete_everything", title: "x", rows: [{}] }).ok, false);
});

test("the admin's edits are checked, and what a row is about cannot move", () => {
  const entry = entryFor("stage_dates")!;
  const original = [
    {
      label: "A",
      values: { plot_id: PLOT, group_id: GROUP, started_on: "2026-10-01", finished_on: "" },
    },
    { label: "B", values: { plot_id: PLOT, group_id: OTHER, started_on: "", finished_on: "" } },
  ];
  const kept = editedRows(entry, original, [{ row: 1, values: { started_on: "2026-10-05" } }]);
  assert.ok(kept.ok);
  assert.deepEqual(kept.value, [
    {
      index: 1,
      row: {
        label: "B",
        values: { plot_id: PLOT, group_id: OTHER, started_on: "2026-10-05", finished_on: "" },
      },
    },
  ]);
  assert.equal(editedRows(entry, original, [{ row: 0, values: { group_id: OTHER } }]).ok, false);
  assert.equal(
    editedRows(entry, original, [{ row: 0, values: { started_on: "5 Oct" } }]).ok,
    false,
  );
  assert.equal(editedRows(entry, original, [{ row: 7 }]).ok, false);
  assert.equal(editedRows(entry, original, [{ row: 0 }, { row: 0 }]).ok, false);
  assert.equal(editedRows(entry, original, []).ok, false);
});

test("the labour form Turing sends is the one Supervisors reads", () => {
  // A renamed field on Supervisors' form would otherwise reach the action blank, and silently.
  const source = readFileSync("lib/supervisors/actions.ts", "utf8");
  const reader = source.slice(
    source.indexOf("async function readLabourFields"),
    source.indexOf("const sameDayMessage"),
  );
  const read = [...reader.matchAll(/\(formData, "(\w+)"\)/g)].map((match) => match[1]);
  assert.deepEqual([...LABOUR_LOG_FORM].sort(), [...new Set(read)].sort());
  assert.match(source, /export async function updateLabourLog[\s\S]*?text\(formData, "id"\)/);
});

test("Turing never presses a Settings save (SECURITY.md, Turing)", () => {
  assert.doesNotMatch(readFileSync("lib/turing/catalogue.ts", "utf8"), /@\/lib\/settings\//);
  assert.equal(
    ENTRIES.some((entry) => entry.tool === "/settings"),
    false,
  );
});

test("a day's labour: each way of paying passes, and a quantity is a plain number", () => {
  const base = { plot_id: PLOT, work_item_id: GROUP, contractor_id: OTHER, log_date: "2026-10-24" };
  const proposal = checkProposal({
    action: "labour_log_new",
    title: "Today's labour",
    rows: [
      { label: "P-07 masons", ...base, kind: "nmr", masons: 2, helpers: 3 },
      { label: "P-07 plaster", ...base, kind: "pw_qty", quantity: 12.5 },
      { label: "P-07 porch", ...base, kind: "pw_lump", description: "Porch plastering" },
    ],
  });
  assert.ok(proposal.ok);
  assert.equal(proposal.value.rows[1].values.quantity, "12.5");
  // Fields left out of a new log are blank, not "kept": the row simply doesn't carry them.
  assert.equal("others" in proposal.value.rows[0].values, false);

  const bad = checkProposal({
    action: "labour_log_new",
    title: "x",
    rows: [
      { label: "a", ...base, kind: "pw_qty", quantity: "12 cum" },
      { label: "b", ...base, log_date: undefined, kind: "nmr", masons: 1 },
    ],
  });
  assert.ok(!bad.ok);
  assert.match(bad.error, /Row 1: Quantity is a number/);
  assert.match(bad.error, /Row 2: Date is missing/);
});

test("a value the way of paying would drop is refused, not saved as nothing", () => {
  assert.match(labourConflict({ kind: "nmr", quantity: "12" }) ?? "", /not a quantity/);
  assert.match(labourConflict({ kind: "pw_qty", masons: "2" }) ?? "", /Heads are for daily/);
  assert.match(labourConflict({ kind: "pw_lump", quantity: "3" }) ?? "", /not a quantity/);
  assert.equal(labourConflict({ kind: "pw_qty", masons: "0", quantity: "4" }), undefined);
  // A change takes the log's own way of paying when the row doesn't give one.
  const now = { kind: "nmr", work_item_id: GROUP };
  assert.match(labourConflict({ quantity: "5" }, now) ?? "", /not a quantity/);
  assert.equal(labourConflict({ masons: "4" }, now), undefined);
  const piece = { kind: "pw_qty", work_item_id: GROUP };
  assert.match(labourConflict({ work_item_id: OTHER }, piece) ?? "", /give the quantity again/);
  assert.equal(labourConflict({ work_item_id: OTHER, quantity: "9" }, piece), undefined);
});

test("a correction can keep the work, contractor, date or payment, but never empty them", () => {
  const change = checkProposal({
    action: "labour_log_change",
    title: "x",
    rows: [
      { label: "a", log_id: PLOT, contractor_id: "" },
      { label: "b", log_id: PLOT, kind: "" },
      { label: "c", log_id: PLOT, work_class: "" },
    ],
  });
  assert.ok(!change.ok);
  assert.match(change.error, /Row 1: Contractor can be left as it is, but not emptied/);
  assert.match(change.error, /Row 2: Paid as can be left as it is/);
  // An empty work class goes back to standard work, the tool's own default.
  assert.doesNotMatch(change.error, /Row 3/);
});

test("a labour log is changed or deleted by its id, which cannot be edited on screen", () => {
  const change = entryFor("labour_log_change")!;
  const original = [{ label: "24 Oct", values: { log_id: PLOT, masons: "3" } }];
  assert.ok(editedRows(change, original, [{ row: 0, values: { masons: "4" } }]).ok);
  assert.equal(editedRows(change, original, [{ row: 0, values: { log_id: OTHER } }]).ok, false);
  const ids = idsOf(entryFor("labour_log_delete")!, [{ label: "x", values: { log_id: PLOT } }]);
  assert.deepEqual([...(ids.get("labour_logs") ?? [])], [PLOT]);
});

test("Claude's list names every entry and its fields", () => {
  const text = catalogueText();
  for (const entry of ENTRIES) assert.ok(text.includes(`- ${entry.key} — `));
  assert.ok(text.includes("status (one of not_started | working | waiting | done)"));
});
