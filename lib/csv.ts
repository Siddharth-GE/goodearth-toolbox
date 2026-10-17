/**
 * CSV for Excel: every cell quoted; a leading = + - @ gets a ' (formula and injection guard);
 * rows join with CRLF; the body starts with a BOM or Excel mangles every Malayalam name.
 */

/** The BOM by code point: a pasted invisible character gets eaten by editors, turning names to mojibake. */
const BOM = String.fromCharCode(0xfeff);

export type CsvValue = string | number | boolean | null | undefined;

/** One value as a quoted CSV cell. Null and undefined are empty. */
export function csvCell(value: CsvValue): string {
  const text = value === null || value === undefined ? "" : String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function csvRow(values: CsvValue[]): string {
  return values.map(csvCell).join(",");
}

/** Word characters and hyphens only, so a project name cannot put a path or header character in a download. */
export function safeFilename(value: string): string {
  return value.replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "");
}

/** Parses pasted or uploaded CSV into rows of cells: quotes, CRLF or LF and the BOM handled, blank lines dropped, cells untrimmed. */
export function parseCsv(text: string): string[][] {
  const source = text.startsWith(BOM) ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => value !== "")) rows.push(row);
  return rows;
}

/** Finished CSV lines as a download; pass variable parts of `filename` through safeFilename. */
export function csvResponse(rows: string[], filename: string): Response {
  return new Response(`${BOM}${rows.join("\r\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
