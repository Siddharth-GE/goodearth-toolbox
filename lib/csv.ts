/**
 * CSV, shared. Pure and dependency-free — the one place the app decides
 * how a value becomes a spreadsheet cell.
 *
 * It was extracted from the Selections revision download, which had been
 * the only CSV in the app; Reporter is the second, and a second private
 * copy of these four rules is how the two would quietly drift apart.
 *
 * The rules, and why each exists:
 *
 * - Every cell is quoted, always. Commas, quotes and newlines inside a
 *   value then need no special case at the call site.
 * - A cell starting with `=`, `+`, `-` or `@` is prefixed with a single
 *   quote. Excel reads those as formulas, so an item named "-- spare --"
 *   arrives in someone's spreadsheet as a broken formula. This is also
 *   the CSV injection guard: `=HYPERLINK(...)` in a note stays text.
 * - Rows join with CRLF. Excel on Windows is the reader.
 * - The body starts with a BOM, or Excel opens UTF-8 as the local code
 *   page and mangles every Malayalam name in the file.
 */

/**
 * The byte-order mark, spelled by code point rather than pasted in. The
 * old Selections route carried the literal invisible character and
 * survived on luck; an editor or a copy-paste that eats it turns every
 * non-ASCII name in a download to mojibake, and nothing on screen shows
 * the difference.
 */
const BOM = String.fromCharCode(0xfeff);

export type CsvValue = string | number | boolean | null | undefined;

/** One value as a quoted CSV cell. Null and undefined are empty. */
export function csvCell(value: CsvValue): string {
  const text = value === null || value === undefined ? "" : String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** One row of values as a CSV line. */
export function csvRow(values: CsvValue[]): string {
  return values.map(csvCell).join(",");
}

/**
 * A filename fragment reduced to word characters and hyphens — so a
 * project called "Malhar / Phase 2" cannot put a path separator, a
 * quote or a newline into a Content-Disposition header.
 */
export function safeFilename(value: string): string {
  return value.replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "");
}

/**
 * Reading a CSV someone pasted or uploaded, into rows of cells: quoted
 * cells, doubled quotes inside them, commas and newlines within quotes,
 * CRLF or LF, and the BOM Excel writes. Blank lines are dropped; cells are
 * returned as written (the caller trims). The csv-parse package is a
 * dev-only dependency, used by scripts; the app reads with this.
 */
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

/**
 * Finished CSV lines as a download. `filename` is used as given — pass
 * its variable parts through safeFilename first.
 */
export function csvResponse(rows: string[], filename: string): Response {
  return new Response(`${BOM}${rows.join("\r\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
