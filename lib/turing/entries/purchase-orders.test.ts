import assert from "node:assert/strict";
import { test } from "node:test";

import { checkProposal, entryFor, recordsOf } from "../catalogue-fields";
import { poolPicks, withDiscountSwitch } from "./purchase-orders";

const INDENT = "11111111-1111-4111-8111-111111111111";
const OTHER_INDENT = "22222222-2222-4222-8222-222222222222";
const LINE = "33333333-3333-4333-8333-333333333333";
const VENDOR = "44444444-4444-4444-8444-444444444444";
const PROJECT = "55555555-5555-4555-8555-555555555555";

test("ordering from an indent: one call per indent, vendors per line", () => {
  const proposal = checkProposal({
    action: "po_from_indent",
    title: "Order the cement",
    rows: [
      {
        label: "a",
        indent_id: INDENT,
        indent_line_id: LINE,
        vendor_id: VENDOR,
        quantity: 40,
        rate: 410,
        gst_pct: 28,
      },
      { label: "b", indent_id: OTHER_INDENT, indent_line_id: LINE, vendor_id: VENDOR, quantity: 3 },
      { label: "c", indent_id: INDENT, indent_line_id: LINE, vendor_id: PROJECT, quantity: 2 },
    ],
  });
  assert.ok(proposal.ok);
  const rows = proposal.value.rows;
  const records = recordsOf(
    proposal.value.entry,
    rows,
    rows.map((row, index) => ({ index, row })),
  );
  assert.ok(records.ok);
  assert.deepEqual(
    records.value.map((record) => record.rows.map(({ index }) => index)),
    [[0, 2], [1]],
  );
  // A price left out stays out: "not priced" is never ₹0.
  assert.equal("rate" in rows[1].values, false);
});

test("a bulk PO is one per vendor and header; a price must be a number", () => {
  const bad = checkProposal({
    action: "po_general",
    title: "x",
    rows: [
      {
        label: "a",
        project_id: PROJECT,
        vendor_id: VENDOR,
        indent_line_id: LINE,
        quantity: 1,
        rate: "₹410",
      },
    ],
  });
  assert.ok(!bad.ok && /Rate is a number/.test(bad.error));
});

test("a PO's vendor can be kept on a change, never emptied; a line's quantity likewise", () => {
  const header = checkProposal({
    action: "po_change",
    title: "x",
    rows: [{ label: "a", po_id: INDENT, vendor_id: "" }],
  });
  assert.ok(!header.ok && /Vendor can be left as it is, but not emptied/.test(header.error));
  const line = checkProposal({
    action: "po_line_change",
    title: "x",
    rows: [{ label: "a", line_id: LINE, quantity: "" }],
  });
  assert.ok(!line.ok && /Quantity can be left as it is/.test(line.error));
  // An emptied discount clears it, as the screen's does.
  const cleared = checkProposal({
    action: "po_line_change",
    title: "x",
    rows: [{ label: "a", line_id: LINE, discount_pct: "" }],
  });
  assert.ok(cleared.ok && cleared.value.rows[0].values.discount_pct === "");
});

test("asking for a cancellation needs the reason", () => {
  assert.equal(
    checkProposal({
      action: "po_cancel_request",
      title: "x",
      rows: [{ label: "a", po_id: INDENT }],
    }).ok,
    false,
  );
  assert.ok(entryFor("po_cancel_withdraw"));
});

test("a bulk PO's rows for one indent line are one pick: quantities added, one price", () => {
  const OTHER = "66666666-6666-4666-8666-666666666666";
  const merged = poolPicks([
    { indent_line_id: LINE, quantity: "10", rate: "410" },
    { indent_line_id: LINE, quantity: "5", gst_pct: "28" },
    { indent_line_id: OTHER, quantity: "2", rate: "", gst_pct: "" },
  ]);
  assert.ok("picks" in merged);
  assert.deepEqual(merged.picks, [
    { indentLineId: LINE, quantity: 15, rate: 410, gstPct: 28 },
    // An empty price is not given: Masters' GST from the pool add stands.
    { indentLineId: OTHER, quantity: 2, rate: null, gstPct: null },
  ]);
  const clash = poolPicks([
    { indent_line_id: LINE, quantity: "1", rate: "410" },
    { indent_line_id: LINE, quantity: "1", rate: "420" },
  ]);
  assert.ok("error" in clash && /two rates, 410 and 420/.test(clash.error));
});

test("a discount given clears the other kind; both at once is refused", () => {
  assert.deepEqual(withDiscountSwitch({ line_id: LINE, discount_pct: "5" }), {
    values: { line_id: LINE, discount_pct: "5", discount_amount: "" },
  });
  assert.deepEqual(withDiscountSwitch({ line_id: LINE, discount_amount: "100" }), {
    values: { line_id: LINE, discount_amount: "100", discount_pct: "" },
  });
  assert.deepEqual(withDiscountSwitch({ line_id: LINE, discount_pct: "" }), {
    values: { line_id: LINE, discount_pct: "" },
  });
  assert.ok("error" in withDiscountSwitch({ discount_pct: "5", discount_amount: "100" }));
});
