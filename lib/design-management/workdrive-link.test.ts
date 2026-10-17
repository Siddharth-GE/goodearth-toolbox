/**
 * The WorkDrive link's pure parts (0122). The page and answer shapes are
 * cut down from what the founder's real link returned on 2026-10-17 —
 * folder "11", two PDFs — with every token and cookie left out.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  bySheetName,
  folderEntries,
  parseWorkDriveLink,
  readSharedPage,
  WORKDRIVE_FOLDER_TYPE,
} from "./workdrive-link";

const ID = "263e00c525983e7ad6db66aa9e1b1f9873b60b6d371104be1ebe01b53ead6751";
const LINK = `https://workdrive.zohoexternal.com/external/${ID}`;

test("the team's share link is taken, and rebuilt from its id", () => {
  assert.deepEqual(parseWorkDriveLink(LINK), { ok: true, linkId: ID, url: LINK });
  assert.deepEqual(parseWorkDriveLink(`  ${LINK}/  `), { ok: true, linkId: ID, url: LINK });
  assert.deepEqual(parseWorkDriveLink(`${LINK}?layout=list#top`), {
    ok: true,
    linkId: ID,
    url: LINK,
  });
});

test("anything else is refused, in a sentence that says what to paste", () => {
  const refusal = (input: string) => {
    const parsed = parseWorkDriveLink(input);
    assert.equal(parsed.ok, false);
    return parsed.ok ? "" : parsed.error;
  };
  assert.match(refusal(""), /Paste the folder's WorkDrive share link/);
  assert.match(refusal("folder 11"), /isn't a link/);
  assert.match(
    refusal("https://drive.google.com/drive/folders/abc"),
    /Only a WorkDrive share link/,
  );
  assert.match(refusal("https://wa.me/919999999999"), /Only a WorkDrive share link/);
  assert.match(
    refusal("https://workdrive.zoho.com/abc/teams/abc/ws/xyz/folders/nj7ah7a667"),
    /without a Zoho login/,
  );
  assert.match(refusal("https://workdrive.zohoexternal.com/external/"), /not complete/);
  assert.match(refusal("https://workdrive.zohoexternal.com/external/abc"), /not complete/);
  assert.match(refusal(`http://workdrive.zohoexternal.com/external/${ID}`), /Only a WorkDrive/);
  // A look-alike host is not Zoho's.
  assert.match(refusal(`https://workdrive.zohoexternal.com.evil.io/external/${ID}`), /Only a/);
});

const PAGE = `<script>
loginJson = {"license_data":"{\\"resource_id\\":\\"70yr35f3fa618407c487fbfe0e5072bccc68d\\"}"},
resourceId = "nj7ah7a667d4c32e443e5864789dbf315de19",
isPublishedView = true,
resourceName = "11",
resourceTitleName = "11",
resourceType = "1001",
resourceSize = "null",
</script>`;

test("the share page names the folder it shares", () => {
  assert.deepEqual(readSharedPage(PAGE), {
    resourceId: "nj7ah7a667d4c32e443e5864789dbf315de19",
    name: "11",
    type: WORKDRIVE_FOLDER_TYPE,
  });
});

test("a page that names nothing reads as nothing", () => {
  assert.equal(readSharedPage("<html><body>Link expired</body></html>"), null);
  assert.equal(readSharedPage('resourceId = "",'), null);
  assert.equal(readSharedPage('resourceId = "../../etc",'), null);
});

test("Zoho's list becomes entries: name, size, time; folders marked", () => {
  const answer = {
    data: [
      {
        id: "nj7ah0dc9162f9c7b473aa4888c4ab05130eb",
        type: "files",
        attributes: {
          name: "Saarang - Plot 17 - Electrical SLD - R0 - 05022026.pdf",
          is_folder: false,
          storage_info: { size_in_bytes: 224691 },
          modified_time_in_millisecond: 1773310694000,
        },
      },
      {
        id: "nj7ahfolder",
        attributes: { name: "Old", is_folder: true, storage_info: { size_in_bytes: 0 } },
      },
      { id: "", attributes: { name: "No id.pdf" } },
      { id: "nj7ahnoname", attributes: { name: "  " } },
    ],
  };
  assert.deepEqual(folderEntries(answer), [
    {
      workdriveId: "nj7ah0dc9162f9c7b473aa4888c4ab05130eb",
      name: "Saarang - Plot 17 - Electrical SLD - R0 - 05022026.pdf",
      isFolder: false,
      sizeBytes: 224691,
      modifiedAt: "2026-03-12T10:18:14.000Z",
    },
    { workdriveId: "nj7ahfolder", name: "Old", isFolder: true, sizeBytes: 0, modifiedAt: null },
  ]);
});

test("one file's answer, and nonsense, read safely", () => {
  assert.equal(folderEntries({ data: { id: "f1", attributes: { name: "One.pdf" } } }).length, 1);
  assert.deepEqual(folderEntries(null), []);
  assert.deepEqual(folderEntries({ errors: [{ id: "R008" }] }), []);
  assert.deepEqual(folderEntries("<html>"), []);
});

test("sheets sort as a person reads them", () => {
  const names = ["Sheet 10.pdf", "sheet 2.pdf", "Sheet 1.pdf", "A - Site plan.pdf"];
  assert.deepEqual(
    names
      .map((name) => ({ name }))
      .sort(bySheetName)
      .map((row) => row.name),
    ["A - Site plan.pdf", "Sheet 1.pdf", "sheet 2.pdf", "Sheet 10.pdf"],
  );
});
