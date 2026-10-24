import assert from "node:assert/strict";
import { test } from "node:test";

import {
  catalogueText,
  checkProposal,
  editedRows,
  entryFor,
  ENTRIES,
  idsOf,
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

test("Claude's list names every entry and its fields", () => {
  const text = catalogueText();
  for (const entry of ENTRIES) assert.ok(text.includes(`- ${entry.key} — `));
  assert.ok(text.includes("status (one of not_started | working | waiting | done)"));
});
