/**
 * The downloaded sheet's name is what site files and forwards, so its
 * shape is pinned — including a draft, a project with no code, a stage
 * with no code, and a sheet from before sheet codes existed.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  normaliseSheetCode,
  normaliseStageCode,
  sheetFileName,
  stageInitials,
  type SheetNameParts,
} from "./sheet-name";

const parts = (overrides: Partial<SheetNameParts> = {}): SheetNameParts => ({
  projectCode: "SAA",
  projectName: "Saarang",
  villaName: "Villa 12",
  stageCode: "WD",
  stageName: "Working Drawings",
  transmittalNumber: "TR-0003",
  sheetCode: "GFP",
  originalFileName: "ground floor plan v3.pdf",
  contentType: "application/pdf",
  ...overrides,
});

test("names an issued sheet the founder's way", () => {
  assert.equal(sheetFileName(parts()), "SAA-Saarang-Villa12-WD-TR0003-GFP.pdf");
});

test("a draft says DRAFT where the number will go", () => {
  assert.equal(
    sheetFileName(parts({ transmittalNumber: null })),
    "SAA-Saarang-Villa12-WD-DRAFT-GFP.pdf",
  );
});

test("a project with no code leaves the code out", () => {
  assert.equal(
    sheetFileName(parts({ projectCode: null, projectName: "Baveli", villaName: "1" })),
    "Baveli-1-WD-TR0003-GFP.pdf",
  );
});

test("a stage with no code uses its initials", () => {
  assert.equal(stageInitials("Working Drawings"), "WD");
  assert.equal(stageInitials("MEP"), "M");
  assert.equal(
    sheetFileName(parts({ stageCode: null, stageName: "Typical Details" })),
    "SAA-Saarang-Villa12-TD-TR0003-GFP.pdf",
  );
});

test("a sheet from before sheet codes falls back to its file name", () => {
  assert.equal(
    sheetFileName(parts({ sheetCode: null, originalFileName: "Ground floor (v3).pdf" })),
    "SAA-Saarang-Villa12-WD-TR0003-Groundfloorv3.pdf",
  );
});

test("a photo keeps the stored image type", () => {
  assert.equal(
    sheetFileName(parts({ contentType: "image/jpeg", originalFileName: "IMG_2231.HEIC.png" })),
    "SAA-Saarang-Villa12-WD-TR0003-GFP.jpg",
  );
});

test("sheet codes are tidied into the database's shape", () => {
  assert.equal(normaliseSheetCode(" gfp "), "GFP");
  assert.equal(normaliseSheetCode("gf plan 01"), "GF-PLAN-01");
  assert.equal(normaliseSheetCode("--sec/a--"), "SECA");
  assert.equal(normaliseSheetCode("  "), null);
  assert.equal(normaliseSheetCode("a".repeat(25))?.length, 20);
  assert.equal(normaliseSheetCode("abcdefghijklmnopqrs tuv"), "ABCDEFGHIJKLMNOPQRS");
});

test("stage codes are tidied into the database's shape", () => {
  assert.equal(normaliseStageCode("wd"), "WD");
  assert.equal(normaliseStageCode("Str-1 abc"), "STR1AB");
  assert.equal(normaliseStageCode("--"), null);
});
