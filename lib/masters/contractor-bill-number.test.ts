import assert from "node:assert/strict";
import { test } from "node:test";

import {
  cleanContractorCode,
  contractorBillReference,
  isContractorCode,
} from "./contractor-bill-number";

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
