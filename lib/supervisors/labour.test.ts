/** Each kind keeps only its own fields, a measured log takes the work's unit, and each refusal is said in words before the CHECK says it. */
import assert from "node:assert/strict";
import { test } from "node:test";

import { describeLabour, labourShape, labourWork, type LabourShapeInput } from "./labour";

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
  assert.equal(
    (labourShape(input({ masons: 1.5, helpers: 0.25 })) as { masons: number }).masons,
    1.5,
  );
  assert.match((labourShape(input({ masons: 0.125 })) as { error: string }).error, /two decimals/);
  assert.match((labourShape(input({ masons: -0.5 })) as { error: string }).error, /between 0/);
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

test("a log is on a work, or Additional work or Rework is on a typed name", () => {
  const base = { workItemId: "w1", customName: "", workClass: "standard", kind: "nmr" };
  assert.deepEqual(labourWork(base), { work_item_id: "w1", custom_name: null });
  assert.match(
    (labourWork({ ...base, workItemId: "" }) as { error: string }).error,
    /Pick the work/,
  );
  assert.match(
    (labourWork({ ...base, customName: "Extra parapet" }) as { error: string }).error,
    /Only Additional work or Rework/,
  );
  assert.deepEqual(
    labourWork({ ...base, workItemId: "", customName: "  Extra parapet ", workClass: "rework" }),
    { work_item_id: null, custom_name: "Extra parapet" },
  );
  // A typed name wins over a work the form still holds.
  assert.deepEqual(
    labourWork({ ...base, customName: "Sump shift", workClass: "additional", kind: "pw_lump" }),
    { work_item_id: null, custom_name: "Sump shift" },
  );
  assert.match(
    (
      labourWork({ ...base, customName: "By qty", workClass: "rework", kind: "pw_qty" }) as {
        error: string;
      }
    ).error,
    /daily wages or a lump sum/,
  );
});
