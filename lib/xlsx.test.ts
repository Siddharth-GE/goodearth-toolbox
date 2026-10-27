import assert from "node:assert/strict";
import { test } from "node:test";

import { readWorkbookBytes, writeWorkbookBytes } from "./xlsx";

test("a written workbook reads back with its text, numbers and gaps intact", () => {
  const bytes = writeWorkbookBytes([
    {
      name: "Dues",
      rows: [
        ["Name", "Amount"],
        ["A & B <Villas> \"x\" 'y'", 237700000],
        ["₹ മലയാളം", -12.5],
        [null, 0.25],
        [],
        ["after gap", null, "end"],
      ],
      columnWidths: [30, 14],
    },
    { name: "Empty", rows: [] },
    { name: "Second", rows: [["only", 1]] },
  ]);
  const book = readWorkbookBytes(bytes);
  assert.deepEqual([...book.keys()], ["Dues", "Empty", "Second"]);

  const dues = book.get("Dues")!;
  assert.deepEqual(dues[0], { row: 1, cells: ["Name", "Amount"] });
  assert.deepEqual(dues[1], { row: 2, cells: ["A & B <Villas> \"x\" 'y'", "237700000"] });
  assert.deepEqual(dues[2], { row: 3, cells: ["₹ മലയാളം", "-12.5"] });
  assert.equal(dues[3].cells[0], undefined);
  assert.equal(dues[3].cells[1], "0.25");
  assert.equal(dues[4].row, 6);
  assert.deepEqual(
    [dues[4].cells[0], dues[4].cells[1], dues[4].cells[2]],
    ["after gap", undefined, "end"],
  );
  assert.equal(dues.length, 5);

  assert.deepEqual(book.get("Empty"), []);
  assert.deepEqual(book.get("Second"), [{ row: 1, cells: ["only", "1"] }]);
});

test("sheet names are made valid for Excel and unique", () => {
  const long = "x".repeat(40);
  const book = readWorkbookBytes(
    writeWorkbookBytes([
      { name: "Dues: 2026/27 [a]?", rows: [["a"]] },
      { name: "dues", rows: [["b"]] },
      { name: "DUES", rows: [["c"]] },
      { name: "", rows: [["d"]] },
      { name: long, rows: [["e"]] },
      { name: long, rows: [["f"]] },
    ]),
  );
  const names = [...book.keys()];
  assert.equal(names[0], "Dues  2026 27  a");
  assert.deepEqual(names.slice(1, 4), ["dues", "DUES 2", "Sheet"]);
  assert.equal(names[4], "x".repeat(31));
  assert.equal(names[5].length, 31);
  assert.equal(new Set(names.map((n) => n.toLowerCase())).size, names.length);
});

test("characters illegal in XML are dropped and non-finite numbers leave no cell", () => {
  const book = readWorkbookBytes(
    writeWorkbookBytes([{ name: "S", rows: [["a\u0000b\u000Bc", Number.NaN, Infinity]] }]),
  );
  assert.deepEqual(book.get("S"), [{ row: 1, cells: ["abc"] }]);
});
