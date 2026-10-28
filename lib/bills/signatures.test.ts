import assert from "node:assert/strict";
import { test } from "node:test";

import { signatureBoxes, signatureFormat, signaturePath } from "./signatures";

test("Approved by is whoever approved the bill; the rest are the named signers", () => {
  const boxes = signatureBoxes({ preparedBy: "r", checkedBy: "r", finalBy: "k" }, "s");
  assert.deepEqual(
    boxes.map((box) => `${box.label}:${box.userId}`),
    ["Prepared by:r", "Checked by:r", "Approved by:s", "Final approval:k"],
  );
});

test("an unset signer leaves the box blank", () => {
  const boxes = signatureBoxes({ preparedBy: null, checkedBy: null, finalBy: null }, null);
  assert.ok(boxes.every((box) => box.userId === null));
});

test("a signature sits in its person's folder and keeps its format", () => {
  assert.equal(signaturePath("u1", "x", "image/png"), "people/u1/x.png");
  assert.equal(signaturePath("u1", "x", "image/jpeg"), "people/u1/x.jpg");
  assert.equal(signatureFormat("people/u1/x.png"), "png");
  assert.equal(signatureFormat("people/u1/x.jpg"), "jpg");
});
