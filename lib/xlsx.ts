/** Reads every sheet of an .xlsx into rows of cell text, with no spreadsheet library (fflate unzips). */
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

import type { SheetRow } from "@/lib/masters/masters-workbook";

function unescapeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&");
}

const textRuns = (fragment: string) =>
  unescapeXml([...fragment.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(""));

const columnIndex = (letters: string) =>
  [...letters].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;

export function readWorkbookBytes(bytes: Uint8Array, label = "The file"): Map<string, SheetRow[]> {
  const parts = unzipSync(bytes);
  const xml = (name: string) => {
    const part = parts[name];
    if (!part) throw new Error(`${label} has no ${name} — is it an .xlsx?`);
    return strFromU8(part);
  };
  const shared = parts["xl/sharedStrings.xml"]
    ? [...xml("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textRuns(m[1]))
    : [];
  const targets = new Map<string, string>();
  for (const m of xml("xl/_rels/workbook.xml.rels").matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = /\bId="([^"]+)"/.exec(m[1])?.[1];
    const target = /\bTarget="([^"]+)"/.exec(m[1])?.[1];
    if (id && target) targets.set(id, target.startsWith("/") ? target.slice(1) : `xl/${target}`);
  }

  const sheets = new Map<string, SheetRow[]>();
  for (const m of xml("xl/workbook.xml").matchAll(/<sheet\b([^>]*)\/>/g)) {
    const name = unescapeXml(/\bname="([^"]*)"/.exec(m[1])?.[1] ?? "").trim();
    const target = targets.get(/\br:id="([^"]+)"/.exec(m[1])?.[1] ?? "");
    if (!target) continue;
    const rows: SheetRow[] = [];
    for (const row of xml(target).matchAll(/<row\b[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells: (string | undefined)[] = [];
      for (const cell of row[2].matchAll(
        /<c\b[^>]*\br="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g,
      )) {
        const type = /\bt="([^"]+)"/.exec(cell[2])?.[1];
        const inner = cell[3] ?? "";
        const raw = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
        let value: string | undefined;
        if (type === "s" && raw !== undefined) value = shared[Number(raw)];
        else if (type === "inlineStr") value = textRuns(inner);
        else if (raw !== undefined) value = unescapeXml(raw);
        if (value !== undefined) cells[columnIndex(cell[1])] = value;
      }
      if (cells.length > 0) rows.push({ row: Number(row[1]), cells });
    }
    sheets.set(name, rows);
  }
  return sheets;
}

export type WorkbookSheet = {
  name: string;
  rows: (string | number | null)[][];
  /** Width of each column in characters; the first row is written bold. */
  columnWidths?: number[];
};

const escapeXml = (value: string) =>
  value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const columnLetters = (index: number) => {
  let letters = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  }
  return letters;
};

/** Excel allows 31 characters, none of : \ / ? * [ ], and unique names ignoring case. */
function sheetNames(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((raw) => {
    const base =
      raw
        .replace(/[:\\/?*[\]]/g, " ")
        .replace(/^'+|'+$/g, "")
        .trim()
        .slice(0, 31)
        .trim() || "Sheet";
    let name = base;
    for (let n = 2; used.has(name.toLowerCase()); n++) {
      const suffix = ` ${n}`;
      name = base.slice(0, 31 - suffix.length).trimEnd() + suffix;
    }
    used.add(name.toLowerCase());
    return name;
  });
}

function sheetXml(sheet: WorkbookSheet): string {
  const cols = (sheet.columnWidths ?? [])
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join("");
  const rows = sheet.rows
    .map((row, r) => {
      const style = r === 0 ? ' s="1"' : "";
      const cells = row
        .map((value, c) => {
          const ref = `${columnLetters(c)}${r + 1}`;
          if (typeof value === "number" && Number.isFinite(value)) {
            return `<c r="${ref}"${style}><v>${value}</v></c>`;
          }
          if (typeof value === "string" && value !== "") {
            return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
          }
          return "";
        })
        .join("");
      return cells ? `<row r="${r + 1}">${cells}</row>` : "";
    })
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    (cols ? `<cols>${cols}</cols>` : "") +
    `<sheetData>${rows}</sheetData></worksheet>`
  );
}

/** Writes sheets to a minimal .xlsx, with no spreadsheet library (fflate zips). */
export function writeWorkbookBytes(sheets: WorkbookSheet[]): Uint8Array {
  const list = sheets.length > 0 ? sheets : [{ name: "Sheet", rows: [] }];
  const names = sheetNames(list.map((s) => s.name));
  const head = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`;
  const ns = "http://schemas.openxmlformats.org/";
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      `${head}<Types xmlns="${ns}package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="xml" ContentType="application/xml"/>` +
        `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
        `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
        list
          .map(
            (_, i) =>
              `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
          )
          .join("") +
        `</Types>`,
    ),
    "_rels/.rels": strToU8(
      `${head}<Relationships xmlns="${ns}package/2006/relationships">` +
        `<Relationship Id="rId1" Type="${ns}officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    "xl/workbook.xml": strToU8(
      `${head}<workbook xmlns="${ns}spreadsheetml/2006/main" xmlns:r="${ns}officeDocument/2006/relationships"><sheets>` +
        names
          .map((n, i) => `<sheet name="${escapeXml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
          .join("") +
        `</sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `${head}<Relationships xmlns="${ns}package/2006/relationships">` +
        list
          .map(
            (_, i) =>
              `<Relationship Id="rId${i + 1}" Type="${ns}officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
          )
          .join("") +
        `<Relationship Id="rId${list.length + 1}" Type="${ns}officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ),
    "xl/styles.xml": strToU8(
      `${head}<styleSheet xmlns="${ns}spreadsheetml/2006/main">` +
        `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
        `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
        `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
        `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
        `<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
        `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>` +
        `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
    ),
  };
  list.forEach((sheet, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(sheet));
  });
  return zipSync(files);
}
