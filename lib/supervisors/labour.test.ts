/**
 * The three labour formats: each kind keeps only its own fields, a
 * measured log takes the work's unit (never one typed on the phone), and
 * each refusal is said in words before the database's CHECK says it.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { describeLabour, labourShape, type LabourShapeInput } from "./labour";

const input = (over: Partial<LabourShapeInput> = {}): LabourShapeInput => ({
  kind: "nmr",
  masons: 2,
  helpers: 3,
  others: 0,
  quantity: null,
  workUom: "cum",
  description: "",
  ...over,
});

test("daily wages keep the heads and clear the piece-work fields", () => {
  assert.deepEqual(labourShape(input({ quantity: 5, description: "x" })), {
    kind: "nmr",
    masons: 2,
    helpers: 3,
    others: 0,
    quantity: null,
    uom: null,
    description: null,
  });
  assert.match(
    (labourShape(input({ masons: 0, helpers: 0 })) as { error: string }).error,
    /at least one worker/,
  );
  assert.match((labourShape(input({ masons: 1.5 })) as { error: string }).error, /whole number/);
});

test("piece-work by quantity takes the work's unit and needs a quantity", () => {
  assert.deepEqual(labourShape(input({ kind: "pw_qty", quantity: 2, masons: 4 })), {
    kind: "pw_qty",
    masons: 0,
    helpers: 0,
    others: 0,
    quantity: 2,
    uom: "cum",
    description: null,
  });
  assert.match(
    (labourShape(input({ kind: "pw_qty", quantity: 0 })) as { error: string }).error,
    /how much was done, in cum/,
  );
  assert.match(
    (labourShape(input({ kind: "pw_qty", quantity: 2, workUom: null })) as { error: string }).error,
    /no unit in the rate book/,
  );
});

test("a lump sum needs words, and keeps nothing else", () => {
  assert.deepEqual(
    labourShape(input({ kind: "pw_lump", description: " Porch plaster ", quantity: 3 })),
    {
      kind: "pw_lump",
      masons: 0,
      helpers: 0,
      others: 0,
      quantity: null,
      uom: null,
      description: "Porch plaster",
    },
  );
  assert.match(
    (labourShape(input({ kind: "pw_lump" })) as { error: string }).error,
    /what was done/,
  );
  assert.match((labourShape(input({ kind: "wages" })) as { error: string }).error, /how the work/);
});

test("each kind reads as one line", () => {
  const base = { masons: 0, helpers: 0, others: 0, quantity: null, uom: null, description: null };
  assert.equal(
    describeLabour({ ...base, kind: "nmr", masons: 2, helpers: 1 }),
    "2 masons, 1 helper",
  );
  assert.equal(
    describeLabour({ ...base, kind: "pw_qty", quantity: 2.5, uom: "cum" }),
    "Piece-work 2.5 cum",
  );
  assert.equal(
    describeLabour({ ...base, kind: "pw_lump", description: "Porch plaster" }),
    "Lump sum: Porch plaster",
  );
});
