/**
 * How the self-hosted Saarang Tracker's export is read — shared by the two
 * scripts that bring it in: `scripts/update-saarang-register.ts` (Masters:
 * plots, villas, buyers) and `scripts/import-saarang-tracker.ts` (Client
 * Relations: each plot's record and every action). Root plan.md, seventh
 * piece. Pure, no imports, tested.
 *
 * The founder, 2026-10-16: "saarang west is the project" — the tracker's
 * Phase 3 ("P3 01" … "P3 29") is the project Saarang West - Villas; and
 * "some buyers cancel some new buyers have come add them to masters" —
 * where the tracker and Masters disagree on a buyer, the tracker is right.
 */

export const SAARANG = "Saarang - Villas";
export const SAARANG_WEST = "Saarang West - Villas";

export type TrackerPlot = {
  project: typeof SAARANG | typeof SAARANG_WEST;
  /** Masters' plot code: "P22-23" in Saarang, "W21-22" in Saarang West. */
  code: string;
  /** Masters' plot name: "Plot 22 & 23". */
  name: string;
  /** The plot numbers it covers, in order. */
  numbers: number[];
};

/**
 * "Plot 01" → Saarang P1; "Plot 22-23" → Saarang P22-23, "Plot 22 & 23";
 * "P3 05" → Saarang West W5; "P3 21-22" → Saarang West W21-22. Anything
 * else → null. Saarang West's codes start with W so its plots never read
 * as Saarang's in a list that mixes the two.
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
