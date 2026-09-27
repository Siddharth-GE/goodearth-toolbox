/**
 * What a drawing sheet is called when it leaves the app.
 *
 * Founder, 2026-09-27: "each sheet gets renamed with the code, project
 * name, villa name, category, transmittal number and sheet name (like
 * groundfloorplan something abbreviated — when uploading a sheet user has
 * to enter it)". So:
 *
 *   SAA-Saarang-Villa12-WD-TR0003-GFP.pdf
 *   project code · project · villa · stage code · transmittal · sheet
 *
 * Built when the sheet is downloaded, never stored: the transmittal
 * number is minted on Issue, so a stored name would be wrong for every
 * draft and need rewriting at the moment of release. A draft sheet says
 * DRAFT where the number will go.
 *
 * Shared (lib/drawings/): Design Management names the sheets it lists,
 * the file route names the download for both tools. Pure and
 * import-free, so `npm test` pins the shape.
 */

export type SheetNameParts = {
  projectCode: string | null;
  projectName: string;
  villaName: string;
  stageCode: string | null;
  stageName: string;
  /** "TR-0003", or null while the transmittal is a draft. */
  transmittalNumber: string | null;
  /** "GFP"; null only for sheets uploaded before sheet codes existed. */
  sheetCode: string | null;
  /** The name the file was uploaded under — the fallback for a missing code. */
  originalFileName: string;
  contentType: string;
};

/** Letters and digits only: "Villa 12" → "Villa12", "TR-0003" → "TR0003". */
function compact(value: string): string {
  return value.replace(/[^A-Za-z0-9]+/g, "");
}

/** "Working Drawings" → "WD": the stage's initials when it has no code. */
export function stageInitials(stageName: string): string {
  const initials = stageName
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase())
    .join("");
  return initials || "STAGE";
}

function extensionFor(contentType: string, originalFileName: string): string {
  if (contentType === "application/pdf") return "pdf";
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/png") return "png";
  const dot = originalFileName.lastIndexOf(".");
  return dot > 0 ? originalFileName.slice(dot + 1).toLowerCase() : "bin";
}

export function sheetFileName(parts: SheetNameParts): string {
  const originalStem = parts.originalFileName.replace(/\.[^.]*$/, "");
  const segments = [
    parts.projectCode ? compact(parts.projectCode) : "",
    compact(parts.projectName),
    compact(parts.villaName),
    parts.stageCode ? compact(parts.stageCode) : stageInitials(parts.stageName),
    parts.transmittalNumber ? compact(parts.transmittalNumber) : "DRAFT",
    parts.sheetCode ?? (compact(originalStem) || "SHEET"),
  ].filter(Boolean);
  return `${segments.join("-")}.${extensionFor(parts.contentType, parts.originalFileName)}`;
}

/**
 * The sheet code as typed, made into the shape the database accepts
 * (0099: `^[A-Z0-9][A-Z0-9-]{0,19}$`): upper case, spaces become
 * hyphens, anything else is dropped. Null when nothing usable is left.
 */
export function normaliseSheetCode(input: string): string | null {
  const code = input
    .toUpperCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^A-Z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 20)
    .replace(/-$/, "");
  return code ? code : null;
}

/** The stage code as typed, in the database's shape (`^[A-Z0-9]{1,6}$`). */
export function normaliseStageCode(input: string): string | null {
  const code = input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
  return code ? code : null;
}
