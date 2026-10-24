import assert from "node:assert/strict";
import { test } from "node:test";

import { checkProposal, recordsOf } from "../catalogue-fields";
import { lineKindOfNmr } from "./bills";

const PO = "11111111-1111-4111-8111-111111111111";
const LINE = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const BILL = "44444444-4444-4444-8444-444444444444";
const ORDER = "55555555-5555-4555-8555-555555555555";

test("a PO bill's rows with one header are one bill; each needs its paper figures", () => {
  const header = { po_id: PO, invoice_no: "INV-12", invoice_date: "2026-10-20" };
  const proposal = checkProposal({
    action: "bill_po",
    title: "x",
    rows: [
      { label: "a", ...header, po_line_id: LINE, quantity: 40, rate: 410, gst_pct: 28 },
      { label: "b", ...header, po_line_id: OTHER, quantity: 2, rate: 90, gst_pct: 18 },
    ],
  });
  assert.ok(proposal.ok);
  const rows = proposal.value.rows;
  const records = recordsOf(
    proposal.value.entry,
    rows,
    rows.map((row, index) => ({ index, row })),
  );
  assert.ok(records.ok && records.value.length === 1);
  const noGst = checkProposal({
    action: "bill_po",
    title: "x",
    rows: [{ label: "a", ...header, po_line_id: LINE, quantity: 40, rate: 410 }],
  });
  assert.ok(!noGst.ok && /GST % is missing/.test(noGst.error));
});

test("a work-order or daily-wages line's GST starts at 0, as on screen", () => {
  const proposal = checkProposal({
    action: "bill_work_order",
    title: "x",
    rows: [
      {
        label: "a",
        work_order_id: ORDER,
        invoice_no: "RA-1",
        invoice_date: "2026-10-20",
        work_order_line_id: LINE,
        rate: 50000,
      },
    ],
  });
  assert.ok(proposal.ok && proposal.value.rows[0].values.gst_pct === "0");
});

test("a muster roll's trade lines are daily wages; anything else is other", () => {
  assert.equal(lineKindOfNmr("Masons (man-days)"), "nmr");
  assert.equal(lineKindOfNmr(" Helpers (man-days) "), "nmr");
  assert.equal(lineKindOfNmr("Tea and snacks"), "other");
});

test("a bill line being removed takes no changes", () => {
  const both = checkProposal({
    action: "bill_lines_change",
    title: "x",
    rows: [{ label: "a", bill_id: BILL, bill_line_id: LINE, remove: true, rate: 5 }],
  });
  assert.ok(!both.ok && /takes no changes/.test(both.error));
  const one = checkProposal({
    action: "bill_lines_change",
    title: "x",
    rows: [
      { label: "a", bill_id: BILL, bill_line_id: LINE, rate: 5 },
      { label: "b", bill_id: BILL, bill_line_id: OTHER, remove: true },
    ],
  });
  assert.ok(one.ok);
});
