import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  catalogueText,
  checkProposal,
  editedRows,
  ENTRIES,
  entryFor,
  formOf,
} from "../catalogue-fields";
import { MASTERS } from "./masters";

const ID = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

/** The body of `function <name>(` in a file, to its closing brace at the start of a line. */
function functionBody(file: string, name: string): string {
  const source = readFileSync(file, "utf8");
  const at = source.search(new RegExp(`function ${name}\\(`));
  assert.ok(at >= 0, `${name} is in ${file}`);
  return source.slice(at, source.indexOf("\n}\n", at));
}

test("each form Turing sends is the one its tool reads, field for field", () => {
  // A renamed field would reach the action blank; a new one Turing doesn't send would be cleared on every change.
  let checked = 0;
  for (const entry of ENTRIES) {
    if (!entry.form) continue;
    const body = functionBody(entry.form.file, entry.form.reader);
    const read = new Set(
      [...body.matchAll(/formData, "(\w+)"|formData\.get\("(\w+)"\)/g)].map((m) => m[1] ?? m[2]),
    );
    const sent = entry.fields.filter((field) => !field.record).map((field) => field.key);
    assert.deepEqual(
      [...sent, ...(entry.form.ignored ?? [])].sort(),
      [...read].sort(),
      `${entry.key} against ${entry.form.reader}`,
    );
    for (const field of entry.fields) {
      if (field.kind !== "yesno" || field.record) continue;
      const sends = entry.form.ticked ? "" : ', "1"';
      assert.match(body, new RegExp(`checked\\(formData, "${field.key}"${sends}\\)`), entry.key);
    }
    checked += 1;
  }
  assert.ok(checked >= 30);
});

test("every Masters add or change through a form names the form it fills", () => {
  for (const entry of MASTERS) {
    if (/_(new|change)$/.test(entry.key) || entry.key === "vendor_bank")
      assert.ok(entry.form, entry.key);
  }
});

test("a new vendor starts active and not a contractor, as the screen's form does", () => {
  const proposal = checkProposal({
    action: "vendor_new",
    title: "Vendors from the sheet",
    rows: [{ label: "Geo Bricks", name: "Geo Bricks", mobile: "9847012345" }],
  });
  assert.ok(proposal.ok);
  const values = proposal.value.rows[0].values;
  assert.equal(values.is_active, true);
  assert.equal(values.is_contractor, false);
  const form = formOf(entryFor("vendor_new")!, values);
  assert.equal(form.get("is_active"), "1");
  assert.equal(form.get("is_contractor"), null);
  assert.equal(form.get("gst_no"), "");
});

test("a change sends every field, each left out as it stands, and never the record's id", () => {
  const entry = entryFor("vendor_change")!;
  const proposal = checkProposal({
    action: "vendor_change",
    title: "x",
    rows: [{ label: "Geo Bricks", vendor_id: ID, payment_term_days: 30 }],
  });
  assert.ok(proposal.ok);
  const form = formOf(entry, proposal.value.rows[0].values, {
    name: "Geo Bricks",
    mobile: "9847012345",
    payment_term_days: 15,
    is_active: true,
    is_contractor: false,
    address: null,
  });
  assert.equal(form.get("payment_term_days"), "30");
  assert.equal(form.get("name"), "Geo Bricks");
  assert.equal(form.get("is_active"), "1", "a vendor left as it is stays active");
  assert.equal(form.get("is_contractor"), null);
  assert.equal(form.get("address"), "");
  assert.equal(form.get("vendor_id"), null);
});

test("a change can't empty what the tool needs, and its record can't move", () => {
  const bad = checkProposal({
    action: "item_change",
    title: "x",
    rows: [{ label: "Tile", item_id: ID, name: "" }],
  });
  assert.ok(!bad.ok && /Name can be left as it is, but not emptied/.test(bad.error));
  const entry = entryFor("item_change")!;
  const original = [{ label: "Tile", values: { item_id: ID, indicative_price: "450" } }];
  assert.ok(editedRows(entry, original, [{ row: 0, values: { indicative_price: "480" } }]).ok);
  assert.equal(editedRows(entry, original, [{ row: 0, values: { item_id: OTHER } }]).ok, false);
});

test("a choice offers only what the tool takes", () => {
  const bad = checkProposal({
    action: "work_category_new",
    title: "x",
    rows: [{ label: "FD", code: "FD", name: "Foundation", family: "Civil" }],
  });
  assert.ok(!bad.ok && /Family is one of: Site Mobilisation/.test(bad.error));
  const project = checkProposal({
    action: "project_new",
    title: "x",
    rows: [{ label: "Ashram", name: "Ashram", project_type: "eco_village" }],
  });
  assert.ok(project.ok);
  assert.equal(project.value.rows[0].values.status, "planning");
});

test("long terms are taken; other text stops at 500 characters", () => {
  const body = "Payment within 30 days. ".repeat(100);
  assert.ok(
    checkProposal({
      action: "terms_new",
      title: "x",
      rows: [{ label: "Standard", kind: "po", name: "Standard", body }],
    }).ok,
  );
  assert.equal(
    checkProposal({
      action: "client_new",
      title: "x",
      rows: [{ label: "A", name: "A", notes: body }],
    }).ok,
    false,
  );
});

test("Claude's list says what a new record starts as", () => {
  const text = catalogueText();
  assert.ok(text.includes("is_active (true or false, optional, true if left out)"));
  assert.ok(text.includes("- vendor_bank — "));
});

test("Keep as is, picked on screen, leaves the field out whatever Turing proposed", () => {
  const entry = entryFor("vendor_change")!;
  const original = [{ label: "Geo", values: { vendor_id: ID, is_active: false } }];
  const kept = editedRows(entry, original, [{ row: 0, values: { is_active: null } }]);
  assert.ok(kept.ok);
  assert.equal("is_active" in kept.value[0].row.values, false);
});

test("a status or state a new record starts with can be kept on a change, never emptied", () => {
  const plot = checkProposal({
    action: "plot_change",
    title: "x",
    rows: [{ label: "P12", plot_id: ID, status: "" }],
  });
  assert.ok(!plot.ok && /Status can be left as it is, but not emptied/.test(plot.error));
  const company = checkProposal({
    action: "company_new",
    title: "x",
    rows: [{ label: "Kaadal", name: "Kaadal Builders" }],
  });
  assert.ok(company.ok);
  assert.equal(company.value.rows[0].values.state, "Kerala");
});
