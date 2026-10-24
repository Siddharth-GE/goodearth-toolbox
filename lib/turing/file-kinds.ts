/** Which dropped files Turing takes, and how each reaches Claude. Pure. */

export type FileKind = "pdf" | "image" | "text" | "spreadsheet";

export const MAX_FILE_BYTES = 4 * 1024 * 1024;

const BY_EXTENSION: Record<string, { kind: FileKind; type: string }> = {
  pdf: { kind: "pdf", type: "application/pdf" },
  jpg: { kind: "image", type: "image/jpeg" },
  jpeg: { kind: "image", type: "image/jpeg" },
  png: { kind: "image", type: "image/png" },
  webp: { kind: "image", type: "image/webp" },
  gif: { kind: "image", type: "image/gif" },
  csv: { kind: "text", type: "text/csv" },
  txt: { kind: "text", type: "text/plain" },
  md: { kind: "text", type: "text/plain" },
  xlsx: {
    kind: "spreadsheet",
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
};

export const ACCEPTED_EXTENSIONS = Object.keys(BY_EXTENSION).map((ext) => `.${ext}`);

export const NOT_TAKEN = "Turing reads PDFs, photos, spreadsheets (.xlsx or .csv) and text files.";

/** By extension, not the browser's guess: Windows calls a .csv an Excel file. */
export function fileKind(name: string): { kind: FileKind; type: string; ext: string } | null {
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? "";
  const known = BY_EXTENSION[ext];
  return known ? { ...known, ext } : null;
}
