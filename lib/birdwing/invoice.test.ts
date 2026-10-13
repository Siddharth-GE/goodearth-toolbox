/**
 * An invoice prints the same from its snapshot as it summed at issue.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { printDraft, printFromSnapshot } from "./invoice";

const stay = {
  ref: "BW-0001",
  arrival: "2026-11-06",
  departure: "2026-11-08",
  guests: 2,
  guestName: "Trial Guest",
  guestPhone: null,
};

test("a snapshot prints its lines, letterhead and totals", () => {
  const print = printFromSnapshot({
    number: "MEF/GH/133",
    status: "issued",
    issued_on: "2026-11-08",
    cancel_reason: null,
    bill_to_name: "Trial Guest",
    bill_to_gstin: null,
    bill_to_address: null,
    discount: "30",
    snapshot: {
      company: { name: "Maloor", legal_name: "MALOOR ECO FARMS", gstin: "32AAOCM4043Q1Z1" },
      place_of_supply: "Kannur, Kerala (32)",
      upi_id: "x@cnrb",
      lines: [
        { head: "Room rent", qty: 2, rate: 3800, gst_pct: 5, amount: 7980, taxable: 7600 },
        { head: "Massage", qty: 1, rate: 2124, gst_pct: 18, rate_includes_gst: true, amount: 2124 },
      ],
      stay: { ref: "BW-0001", arrival: "2026-11-06", departure: "2026-11-08", guests: 2 },
    },
  });
  assert.equal(print.mode, "issued");
  assert.equal(print.company?.legal_name, "MALOOR ECO FARMS");
  assert.equal(print.lines[1].taxable, 1800);
  assert.equal(print.total, 10104);
  assert.equal(print.taxable, 9400);
  assert.equal(print.cgst + print.sgst, 704);
  assert.equal(print.payable, 10074);
  assert.equal(print.stay.ref, "BW-0001");
});

test("a cancelled invoice says so; an empty snapshot does not crash", () => {
  const print = printFromSnapshot({
    number: "#19",
    status: "cancelled",
    issued_on: "2025-11-01",
    cancel_reason: "Wrong name",
    bill_to_name: "Someone",
    bill_to_gstin: null,
    bill_to_address: null,
    discount: 0,
    snapshot: null,
  });
  assert.equal(print.mode, "cancelled");
  assert.equal(print.lines.length, 0);
  assert.equal(print.total, 0);
  assert.equal(print.company, null);
});

test("a draft is unnumbered and made out to the guest", () => {
  const print = printDraft({
    company: null,
    placeOfSupply: null,
    bankDetails: null,
    upiId: null,
    terms: null,
    stay,
    discount: 0,
    charges: [
      {
        head: "Dinner",
        description: null,
        sac: "996336",
        qty: 2,
        rate: 500,
        rateIncludesGst: false,
        gstPct: 5,
        amount: 1050,
      },
    ],
  });
  assert.equal(print.mode, "draft");
  assert.equal(print.number, null);
  assert.equal(print.billTo.name, "Trial Guest");
  assert.equal(print.lines[0].taxable, 1000);
  assert.equal(print.payable, 1050);
});
