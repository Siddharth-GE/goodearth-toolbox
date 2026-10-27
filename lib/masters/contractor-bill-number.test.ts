import assert from "node:assert/strict";
import { test } from "node:test";

import {
  cleanContractorCode,
  contractorBillReference,
  isContractorCode,
  nextContractorBill,
  type ContractorNumbering,
} from "./contractor-bill-number";

const numbering: ContractorNumbering = {
  codes: { chandri: "CHAN", nocode: null },
  companies: {
    saarang: { id: "futures", name: "Goodearth Futures", code: "EF" },
    baveli: null,
    newco: { id: "newco", name: "New Co", code: null },
  },
  lastNo: { "chandri/futures": 7 },
};

test("the next bill takes the last number plus one, in the project's company", () => {
  assert.deepEqual(nextContractorBill(numbering, "chandri", "saarang", "NMR"), {
    reference: "CHAN-NMR-EF-08",
  });
  assert.deepEqual(nextContractorBill({ ...numbering, lastNo: {} }, "chandri", "saarang", "PW"), {
    reference: "CHAN-PW-EF-01",
  });
});

test("a supplier keeps BILL/… numbering; a missing code or company says why", () => {
  assert.equal(nextContractorBill(numbering, "supplier", "saarang", "NMR"), null);
  assert.ok("problem" in nextContractorBill(numbering, "chandri", "baveli", "NMR")!);
  assert.ok("problem" in nextContractorBill(numbering, "chandri", "newco", "NMR")!);
  assert.ok("problem" in nextContractorBill(numbering, "nocode", "saarang", "NMR")!);
});

test("a contractor's bill number, as the founder's sheet writes it", () => {
  assert.equal(contractorBillReference("RAJU", "PW", "ED", 8), "RAJU-PW-ED-08");
  assert.equal(contractorBillReference("KASH", "NMR", "EF", 246), "KASH-NMR-EF-246");
});

test("a typed code is cleaned, and blank leaves it to the database", () => {
  assert.equal(cleanContractorCode(" raj u "), "RAJU");
  assert.equal(cleanContractorCode("   "), null);
  assert.ok(isContractorCode("SAN1"));
  assert.ok(!isContractorCode("RAJ"));
  assert.ok(!isContractorCode("RA-U"));
});
