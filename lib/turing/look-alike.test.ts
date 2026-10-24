import assert from "node:assert/strict";
import { test } from "node:test";

import { likeness, lookAlikes } from "./look-alike";

test("the look-alike vendors in the masters workbook are each caught", () => {
  const pairs = [
    ["Santhosh K", "K Santhosh"],
    ["C Saju", "Saju C"],
    ["Prabhakaran M", "Prabhakaran"],
    ["Rijesh", "Rijesh K P"],
    ["Madhu", "Madhu M A"],
    ["GeoBricks", "Geo Bricks"],
    ["Chendayad Granites", "Chendayad Granite"],
    ["Perfetto Industries Pvt Ltd", "Perfetto Industries"],
  ];
  for (const [a, b] of pairs) assert.equal(likeness({ name: a }, { name: b }), "a near name", a);
});

test("different firms are not flagged", () => {
  for (const [a, b] of [
    ["Santhosh K", "Santhosh Traders"],
    ["Asian Paints", "Berger Paints"],
    ["Raj", "Ram"],
    ["Madhu", "Madhavan"],
    // Sizes and grades are different items, however close the names.
    ["PVC pipe 20mm", "PVC pipe 25mm"],
    ["TMT bar 12mm", "TMT bar 16mm"],
    ["Cement OPC 43", "Cement OPC 53"],
    ["GI pipe 1/2 inch", "GI pipe 3/4 inch"],
  ])
    assert.equal(likeness({ name: a }, { name: b }), undefined, `${a} / ${b}`);
});

test("a firm's Pvt Ltd and spacing don't hide it", () => {
  assert.equal(likeness({ name: "Geo Bricks Pvt Ltd" }, { name: "GeoBricks" }), "a near name");
  assert.equal(likeness({ name: "M/s Geo Bricks" }, { name: "Geo Bricks" }), "a near name");
});

test("codes keep their dots, and each of two phone numbers is matched", () => {
  assert.equal(
    likeness({ name: "A", code: "CAR.1.11" }, { name: "B", code: "CAR.11.1" }),
    undefined,
  );
  assert.equal(
    likeness({ name: "A", phone: "98470 12345, 94470 99999" }, { name: "B", phone: "9847012345" }),
    "the same phone",
  );
  assert.equal(
    likeness({ name: "A", phone: "9447099999" }, { name: "B", phone: "98470 12345 / 94470 99999" }),
    "the same phone",
  );
});

test("the same GSTIN, phone or code is flagged whatever the name", () => {
  assert.equal(
    likeness({ name: "A", tax: "32abcde1234f1z5" }, { name: "B", tax: "32ABCDE1234F1Z5" }),
    "the same GSTIN",
  );
  assert.equal(
    likeness({ name: "A", phone: "+91 98470 12345" }, { name: "B", phone: "9847012345" }),
    "the same phone",
  );
  assert.equal(likeness({ name: "A", code: "fd.3" }, { name: "B", code: "FD.3" }), "the same code");
  // A short number is not a phone to match on.
  assert.equal(likeness({ name: "A", phone: "123" }, { name: "B", phone: "123" }), undefined);
});

test("a row is checked against what exists, then against the rows above it", () => {
  const flags = lookAlikes(
    [{ name: "New Vendor" }, { name: "K Santhosh" }, { name: "New  Vendor" }],
    [{ name: "Santhosh K" }],
  );
  assert.deepEqual(flags, [
    null,
    "Looks like Santhosh K (a near name)",
    "Same as row 1 (a near name)",
  ]);
});
