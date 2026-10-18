/**
 * A sheet's download name, built at download time and never stored (the transmittal number is minted on Issue):
 * SAA-Saarang-Villa12-WD-TB0003-GFP.pdf = project code, project, villa, stage code, transmittal, sheet. A draft says DRAFT.
 */

export type SheetNameParts = {
  projectCode: string | null;
  projectName: string;
  villaName: string;
  stageCode: string | null;
  stageName: string;
  /** "TB-0003", or null while the transmittal is a draft. */
  transmittalNumber: string | null;
  sheetCode: string | null;
  originalFileName: string;
  contentType: string;
};

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

/** The sheet code as typed, in the database's shape (0099): upper case, spaces to hyphens, else dropped; null if nothing is left. */
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
