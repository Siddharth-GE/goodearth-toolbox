/**
 * A revision's drawings as a Zoho WorkDrive share link (0124): the pure parts of reading it (workdrive.ts reads the shared folder the way its public page does).
 * What a pasted link is, what Zoho's page says it shares, and Zoho's answer turned into sheets. Import-free, so `npm test` pins every shape without a network.
 */

const SHARE_HOST = "workdrive.zohoexternal.com";
const LINK_ID = /^[0-9A-Za-z]{16,128}$/;
/** WorkDrive's own addresses, which need a Zoho login to open. */
const SIGNED_IN_HOST = /^workdrive\.zoho\.(com|in|eu|com\.au|jp|com\.cn)$/;

export const WORKDRIVE_FOLDER_TYPE = "1001";

export type ParsedLink = { ok: true; linkId: string; url: string } | { ok: false; error: string };

/** Rebuilds the fetchable address from the id; the pasted text is never fetched, so a typed address can't make the server call anything but Zoho's share host (0124 checks the same shape). */
export function parseWorkDriveLink(input: string): ParsedLink {
  const text = input.trim();
  if (!text) return { ok: false, error: "Paste the folder's WorkDrive share link." };

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return {
      ok: false,
      error: "That isn't a link. Copy the folder's share link from WorkDrive and paste it here.",
    };
  }

  const host = url.hostname.toLowerCase();
  if (host === SHARE_HOST && url.protocol === "https:") {
    const [first, id] = url.pathname.split("/").filter(Boolean);
    if (first === "external" && id && LINK_ID.test(id)) {
      return { ok: true, linkId: id, url: `https://${SHARE_HOST}/external/${id}` };
    }
    return {
      ok: false,
      error: "That WorkDrive link is not complete. Copy the share link again and paste all of it.",
    };
  }
  if (SIGNED_IN_HOST.test(host)) {
    return {
      ok: false,
      error:
        "That is the folder's own address in WorkDrive — site can't open it without a Zoho login. Paste its share link, the one anyone can view.",
    };
  }
  return {
    ok: false,
    error: `Only a WorkDrive share link can go here — it starts https://${SHARE_HOST}/external/.`,
  };
}

export type SharedResource = { resourceId: string; name: string | null; type: string | null };

/** The page names its resource in script variables (`resourceId`, `resourceName`, `resourceType`). Null when it names none (dead link, or Zoho changed its page). */
export function readSharedPage(html: string): SharedResource | null {
  const field = (name: string) => html.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`))?.[1];
  const resourceId = field("resourceId");
  if (!resourceId || !/^[0-9A-Za-z]+$/.test(resourceId)) return null;
  return {
    resourceId,
    name: field("resourceName") || null,
    type: field("resourceType") || null,
  };
}

export type FolderEntry = {
  workdriveId: string;
  name: string;
  isFolder: boolean;
  sizeBytes: number | null;
  modifiedAt: string | null;
};

/** Rows without an id or a name are dropped rather than guessed at. */
export function folderEntries(answer: unknown): FolderEntry[] {
  const data = (answer as { data?: unknown } | null)?.data;
  const rows = Array.isArray(data) ? data : data ? [data] : [];
  const entries: FolderEntry[] = [];
  for (const row of rows) {
    const id = (row as { id?: unknown })?.id;
    const attributes = ((row as { attributes?: unknown })?.attributes ?? {}) as Record<
      string,
      unknown
    >;
    const name = typeof attributes.name === "string" ? attributes.name.trim() : "";
    if (typeof id !== "string" || !id || !name) continue;

    const size = (attributes.storage_info as { size_in_bytes?: unknown } | undefined)
      ?.size_in_bytes;
    const modified = Number(attributes.modified_time_in_millisecond);
    entries.push({
      workdriveId: id,
      name,
      isFolder: attributes.is_folder === true,
      sizeBytes: typeof size === "number" && size >= 0 ? size : null,
      modifiedAt:
        Number.isFinite(modified) && modified > 0 ? new Date(modified).toISOString() : null,
    });
  }
  return entries;
}

/** Name order as a person reads it: "Sheet 2" before "Sheet 10". */
export function bySheetName<T extends { name: string }>(a: T, b: T): number {
  return a.name.localeCompare(b.name, "en", { numeric: true, sensitivity: "base" });
}
