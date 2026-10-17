import "server-only";

import {
  bySheetName,
  folderEntries,
  readSharedPage,
  WORKDRIVE_FOLDER_TYPE,
  type FolderEntry,
} from "./workdrive-link";

/**
 * Reads a WorkDrive share link's folder the way its own public page does
 * (0124; plan.md, tenth piece). Goodearth has no Zoho API access, and the
 * links are "anyone can view": the link's page names the folder it
 * shares and hands the visitor that link's viewing cookies, and with them
 * `api/v1/files/<folder>/files` on the same host answers the list —
 * names, sizes, last-changed times. No file is ever fetched.
 *
 * THIS IS ZOHO'S PAGE, NOT A PROMISE. If Zoho changes either step, the
 * read fails, says which step in one log line, and the caller carries on
 * with the link alone — a transmittal is never stopped by it.
 *
 * Only ever called with an id from `parseWorkDriveLink`, and only ever
 * fetches the share host rebuilt from it — never text a person typed.
 * Never throws; never logs a cookie or Zoho's body.
 */

const SHARE_ORIGIN = "https://workdrive.zohoexternal.com";
const TIMEOUT_MS = 5000;
const PAGE_SIZE = 50;
/** Forty sheets is a big set; this is a runaway guard, not a limit anyone meets. */
const MAX_PAGES = 20;

export type FolderRead =
  { ok: true; sheets: FolderEntry[]; skippedFolders: string[] } | { ok: false; reason: string };

export async function readWorkDriveFolder(linkId: string): Promise<FolderRead> {
  let step = "page";
  try {
    const page = await fetch(`${SHARE_ORIGIN}/external/${encodeURIComponent(linkId)}`, {
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!page.ok) {
      console.error(`readWorkDriveFolder: the link's page answered ${page.status}`);
      return { ok: false, reason: "WorkDrive did not open this link. Check it still works." };
    }
    const shared = readSharedPage(await page.text());
    if (!shared) {
      console.error("readWorkDriveFolder: the link's page named no folder");
      return { ok: false, reason: "WorkDrive did not say what this link shares." };
    }
    const cookies = page.headers
      .getSetCookie()
      .map((cookie) => cookie.split(";")[0])
      .join("; ");
    const headers = { Cookie: cookies, Accept: "application/vnd.api+json" };
    const id = encodeURIComponent(shared.resourceId);

    // A link to one file is that one sheet.
    if (shared.type !== WORKDRIVE_FOLDER_TYPE) {
      step = "file";
      const answer = await fetch(`${SHARE_ORIGIN}/api/v1/files/${id}`, {
        headers,
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!answer.ok) return refused(step, answer.status);
      const sheets = folderEntries(await answer.json()).filter((entry) => !entry.isFolder);
      return { ok: true, sheets, skippedFolders: [] };
    }

    step = "list";
    const entries: FolderEntry[] = [];
    for (let pageNo = 0; pageNo < MAX_PAGES; pageNo++) {
      const answer = await fetch(
        `${SHARE_ORIGIN}/api/v1/files/${id}/files?page%5Blimit%5D=${PAGE_SIZE}&page%5Boffset%5D=${
          pageNo * PAGE_SIZE
        }`,
        { headers, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) },
      );
      if (!answer.ok) return refused(step, answer.status);
      const rows = folderEntries(await answer.json());
      entries.push(...rows);
      if (rows.length < PAGE_SIZE) break;
    }

    return {
      ok: true,
      sheets: entries.filter((entry) => !entry.isFolder).sort(bySheetName),
      skippedFolders: entries
        .filter((entry) => entry.isFolder)
        .map((entry) => entry.name)
        .sort((a, b) => bySheetName({ name: a }, { name: b })),
    };
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    const late = name === "TimeoutError" || name === "AbortError";
    console.error(`readWorkDriveFolder: ${step} ${late ? "timed out" : "failed"}`);
    return {
      ok: false,
      reason: late
        ? "WorkDrive took too long to answer. Try reading the folder again."
        : "Could not reach WorkDrive. Try reading the folder again.",
    };
  }
}

function refused(step: string, status: number): FolderRead {
  console.error(`readWorkDriveFolder: the ${step} answer was ${status}`);
  return { ok: false, reason: "WorkDrive would not list this folder." };
}
