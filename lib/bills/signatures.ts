/** The one spec for a signature on a bill (0168). NOT "server-only": read by the actions, the queries and the settings form. */

export const SIGNATURES_BUCKET = "signatures";

export const SIGNATURE_TYPES = ["image/png", "image/jpeg"];

export const MAX_SIGNATURE_BYTES = 1024 * 1024;

/** `people/<profile_id>/<uuid>.<ext>`: 0168's check reads the folder. The uuid makes a replacement a new object. */
export function signaturePath(userId: string, unique: string, contentType: string): string {
  return `people/${userId}/${unique}.${contentType === "image/png" ? "png" : "jpg"}`;
}

export function signatureFormat(path: string): "png" | "jpg" {
  return path.endsWith(".png") ? "png" : "jpg";
}

export type BillSigners = {
  preparedBy: string | null;
  checkedBy: string | null;
  finalBy: string | null;
};

export const SIGNER_SLOTS = [
  { key: "preparedBy", column: "prepared_by", label: "Prepared by" },
  { key: "checkedBy", column: "checked_by", label: "Checked by" },
  { key: "finalBy", column: "final_by", label: "Final approval" },
] as const;

/** The boxes in print order: Approved by is whoever approved this bill, the others the people named in settings. */
export function signatureBoxes(
  signers: BillSigners,
  approvedBy: string | null,
): { label: string; userId: string | null }[] {
  return [
    { label: "Prepared by", userId: signers.preparedBy },
    { label: "Checked by", userId: signers.checkedBy },
    { label: "Approved by", userId: approvedBy },
    { label: "Final approval", userId: signers.finalBy },
  ];
}
