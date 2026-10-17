import assert from "node:assert/strict";
import { test } from "node:test";

import { csvCell, csvResponse, csvRow, parseCsv, safeFilename } from "./csv";

test("every cell is quoted, and quotes inside it are doubled", () => {
  assert.equal(csvCell("Cement"), '"Cement"');
  assert.equal(csvCell('12" pipe'), '"12"" pipe"');
  assert.equal(csvCell(""), '""');
});

test("a formula-looking cell is defused with a leading quote", () => {
  // Excel would evaluate these; =HYPERLINK is the injection to stop.
  assert.equal(csvCell("-- spare --"), `"'-- spare --"`);
  assert.equal(csvCell('=HYPERLINK("http://x")'), `"'=HYPERLINK(""http://x"")"`);
  assert.equal(csvCell("+91 98470"), `"'+91 98470"`);
  assert.equal(csvCell("@once"), `"'@once"`);
  // A negative number is a number, and still gets the guard.
  assert.equal(csvCell(-4), `"'-4"`);
});

test("null and undefined are empty, not the word null", () => {
  assert.equal(csvCell(null), '""');
  assert.equal(csvCell(undefined), '""');
  assert.equal(csvCell(0), '"0"');
  assert.equal(csvCell(false), '"false"');
});

test("commas and newlines inside a value survive because every cell is quoted", () => {
  const row = csvRow(["Kochi, Kerala", "line one\nline two", 4]);
  assert.equal(row, '"Kochi, Kerala","line one\nline two","4"');
  assert.equal(row.split(/,(?=")/).length, 3);
});

test("safeFilename strips path separators and anything else exotic", () => {
  assert.equal(safeFilename("Malhar / Phase 2"), "Malhar-Phase-2");
  assert.equal(safeFilename("..\\..\\etc\\passwd"), "etc-passwd");
  assert.equal(safeFilename('a"b'), "a-b");
  assert.equal(safeFilename("Villa 6"), "Villa-6");
  assert.equal(safeFilename("-lead and trail-"), "lead-and-trail");
  assert.equal(safeFilename("കൊച്ചി"), "");
});

test("the response carries a BOM, CRLF rows and download headers", async () => {
  const response = csvResponse(['"A","B"', '"1","2"'], "Report.csv");
  // Checked as bytes: response.text() strips a leading BOM, so it cannot catch a lost one.
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf], "no BOM — Excel mangles non-ASCII");
  assert.equal(Buffer.from(bytes).toString("utf8").slice(1), '"A","B"\r\n"1","2"');
  assert.equal(response.headers.get("Content-Type"), "text/csv; charset=utf-8");
  assert.equal(response.headers.get("Content-Disposition"), 'attachment; filename="Report.csv"');
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});

test("reading a CSV: quotes, doubled quotes, commas and newlines inside, the BOM", () => {
  const bom = String.fromCharCode(0xfeff);
  assert.deepEqual(parseCsv(bom + 'Month,Amount\r\n2026-10,"1,200"\r\n'), [
    ["Month", "Amount"],
    ["2026-10", "1,200"],
  ]);
  assert.deepEqual(parseCsv('a,"say ""hi""",c\n\n"two\nlines",,x'), [
    ["a", 'say "hi"', "c"],
    ["two\nlines", "", "x"],
  ]);
  assert.deepEqual(parseCsv(""), []);
});

test("what this module writes, it reads back", () => {
  const rows = [["Groceries", "=SUM(A1)", '12" pipe']];
  const text = rows.map(csvRow).join("\r\n");
  assert.deepEqual(parseCsv(text), [["Groceries", "'=SUM(A1)", '12" pipe']]);
});
