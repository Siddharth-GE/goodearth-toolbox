import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pdfResponse, safeFileNamePart } from "./response";

describe("safeFileNamePart", () => {
  it("turns runs of odd characters into one dash and trims the ends", () => {
    assert.equal(safeFileNamePart("PO/2026 / 0042"), "PO-2026-0042");
    assert.equal(safeFileNamePart(" Villa One "), "Villa-One");
    assert.equal(safeFileNamePart("TB-0003_a"), "TB-0003_a");
  });
});

describe("pdfResponse", () => {
  it("sends the bytes as a never-cached PDF under the given name", async () => {
    const res = pdfResponse(Buffer.from([1, 2, 3]), "Goodearth-PO-1.pdf", {
      disposition: "inline",
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Content-Type"), "application/pdf");
    assert.equal(res.headers.get("Content-Disposition"), 'inline; filename="Goodearth-PO-1.pdf"');
    assert.equal(res.headers.get("Cache-Control"), "no-store");
    assert.deepEqual([...new Uint8Array(await res.arrayBuffer())], [1, 2, 3]);
  });

  it("honours attachment", () => {
    const res = pdfResponse(new Uint8Array(), "a.pdf", { disposition: "attachment" });
    assert.equal(res.headers.get("Content-Disposition"), 'attachment; filename="a.pdf"');
  });
});
