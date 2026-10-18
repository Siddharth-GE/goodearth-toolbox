/**
 * How the Saarang Tracker's export is read, shared by scripts/update-saarang-register.ts (Masters) and scripts/import-saarang-tracker.ts (CRM). Pure, no imports.
 * Where the tracker and Masters disagree on a buyer, the tracker is right. Phase 3 ("P3 01") is the project Saarang West - Villas.
 */

export const SAARANG = "Saarang - Villas";
export const SAARANG_WEST = "Saarang West - Villas";

export type TrackerPlot = {
  project: typeof SAARANG | typeof SAARANG_WEST;
  /** Masters' plot code: "P22-23" in Saarang, "W21-22" in Saarang West. */
  code: string;
  name: string;
  numbers: number[];
};

/**
 * "Plot 01" becomes Saarang P1, "P3 05" becomes Saarang West W5, anything else null.
 * West's codes start with W so the two never read alike in a mixed list.
 */
export function trackerPlot(label: string): TrackerPlot | null {
  const match = /^(Plot|P3)\s+(\d+)(?:-(\d+))?$/.exec(label.trim());
  if (!match) return null;
  const numbers = [Number(match[2]), ...(match[3] ? [Number(match[3])] : [])];
  if (numbers.some((n) => !Number.isInteger(n) || n <= 0)) return null;
  const west = match[1] === "P3";
  return {
    project: west ? SAARANG_WEST : SAARANG,
    code: (west ? "W" : "P") + numbers.join("-"),
    name: "Plot " + numbers.join(" & "),
    numbers,
  };
}

/** Names compared the way a person reads them: case, titles, "&" and spacing aside. */
export function sameName(a: string, b: string): boolean {
  const norm = (s: string) => {
    const plain = ` ${s.toLowerCase()} `
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9 ]/g, " ")
      .replace(/\s+/g, " ");
    const untitled = plain.replace(/ (mr|mrs|ms|dr)(?= )/g, "").trim();
    return untitled || plain.trim();
  };
  return norm(a) === norm(b);
}

/** The tracker's buyer, or null for "Available" and blank. */
export function trackerBuyer(client: string | null | undefined): string | null {
  const name = client?.trim() ?? "";
  return name && name.toLowerCase() !== "available" ? name : null;
}

/** "2 BHK G+1" → "2BHK G+1" — the tracker spelled one type two ways. */
export function configuration(type: string | null | undefined): string | null {
  const text = (type ?? "")
    .trim()
    .replace(/(\d)\s+BHK/i, "$1BHK")
    .replace(/\s+/g, " ");
  return text || null;
}

/** The tracker's team list (its server.js USERS) — a name to an email. */
export const TRACKER_PEOPLE: Record<string, string> = {
  Anu: "anu@goodearthkannur.org",
  Sayooj: "sayooj@goodearthkannur.org",
  Sebastina: "sebastina@goodearthkannur.org",
};
