/** Reads every sheet of an .xlsx into rows of cell text, with no spreadsheet library (fflate unzips). */
import { strFromU8, unzipSync } from "fflate";
import { readFileSync } from "node:fs";

import type { SheetRow } from "../lib/masters/masters-workbook";

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

export function readWorkbook(path: string): Map<string, SheetRow[]> {
  const parts = unzipSync(new Uint8Array(readFileSync(path)));
  const xml = (name: string) => {
    const part = parts[name];
    if (!part) throw new Error(`${path} has no ${name} — is it an .xlsx?`);
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
