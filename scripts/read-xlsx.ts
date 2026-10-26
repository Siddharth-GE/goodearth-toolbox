/** A workbook on disk, through the shared reader (lib/xlsx.ts). */
import { readFileSync } from "node:fs";

import type { SheetRow } from "../lib/masters/masters-workbook";
import { readWorkbookBytes } from "../lib/xlsx";

export function readWorkbook(path: string): Map<string, SheetRow[]> {
  return readWorkbookBytes(new Uint8Array(readFileSync(path)), path);
}
