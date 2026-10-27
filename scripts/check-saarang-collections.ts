/**
 * Runs a folder of Zoho exports through lib/saarang-collections/core.ts and prints each figure beside
 * the meeting workbook's Summary Sheet. Not CI: the exports are real clients' money and stay outside the repo.
 *
 *   npx tsx scripts/check-saarang-collections.ts <exports-folder> <meeting.xlsx> [--rules rules.json]
 *     [--from YYYY-MM-DD --to YYYY-MM-DD] [--report-date YYYY-MM-DD]
 *
 * rules.json is a partial core Rules object (corrections, extra_units, …). Without --report-date the
 * latest as-of date among the payments, sold and milestones exports is used, as an upload sets it.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { parseCsv } from "../lib/csv";
import {
  compute,
  oldExcelRefusal,
  parse,
  PROJECTS,
  rulesOf,
  type Datasets,
  type ParsedReport,
  type ValueKey,
} from "../lib/saarang-collections/core";
import { readWorkbookBytes } from "../lib/xlsx";

const argv = process.argv.slice(2);
const flag = (name: string) => {
  const at = argv.indexOf(name);
  return at === -1 ? null : argv[at + 1];
};
const [folder, meeting] = argv.filter(
  (arg, i) => !arg.startsWith("--") && !argv[i - 1]?.startsWith("--"),
);
if (!folder || !meeting) throw new Error("Name the exports folder and the meeting workbook.");

const firstSheet = (bytes: Uint8Array, label: string) =>
  [...readWorkbookBytes(bytes, label).values()][0]?.map((row) => row.cells) ?? [];

const datasets: Datasets = {};
let reportDate = flag("--report-date") ?? "";
for (const name of readdirSync(folder).sort()) {
  const bytes = new Uint8Array(readFileSync(join(folder, name)));
  const refusal = oldExcelRefusal(name, bytes);
  if (refusal) {
    console.log(`  ${name}: ${refusal}`);
    continue;
  }
  const grid = /\.csv$/i.test(name)
    ? parseCsv(new TextDecoder().decode(bytes))
    : firstSheet(bytes, name);
  const report = parse(grid, name);
  if ("error" in report) {
    console.log(`  ${name}: ${report.error}`);
    continue;
  }
  (datasets as Record<string, { rows: ParsedReport["rows"] }>)[report.slot] = { rows: report.rows };
  console.log(
    `  ${name} → ${report.slot}, ${report.meta.count} rows, as of ${report.meta.asOf ?? "?"}`,
  );
  if (
    !flag("--report-date") &&
    report.kind !== "outstanding" &&
    (report.meta.asOf ?? "") > reportDate
  ) {
    reportDate = report.meta.asOf ?? "";
  }
}

const rulesFile = flag("--rules");
const rules = rulesOf(rulesFile ? JSON.parse(readFileSync(rulesFile, "utf8")) : null);
const result = compute(datasets, rules, {
  periodFrom: flag("--from"),
  periodTo: flag("--to"),
  reportDate: reportDate || null,
});

// The Summary Sheet's column labels, as the meeting workbook writes them.
const LABELS: Partial<Record<ValueKey, string>> = {
  E: "total sold value",
  F: "total collection",
  H: "last month collection",
  L: "collected but unused",
  M: "collection receivables (outstanding)",
  O: "total sold",
  P: "invoice value",
  S: "ol-collection",
};

const sheet = readWorkbookBytes(new Uint8Array(readFileSync(meeting)), meeting).get(
  "Summary Sheet",
);
if (!sheet) throw new Error("The meeting workbook has no Summary Sheet.");
const headerAt = sheet.findIndex((row) =>
  row.cells.some((c) => /^project name$/i.test(String(c ?? "").trim())),
);
// A label can carry its dates on a second line: "Last Month Collection\n(01.10.2026 to 21.10.2026)".
const header = sheet[headerAt].cells.map((c) =>
  String(c ?? "")
    .split("\n")[0]
    .trim()
    .toLowerCase(),
);
const rowOf = (name: string) =>
  sheet.slice(headerAt + 1).find((row) => String(row.cells[1] ?? "").trim() === name)?.cells ?? [];

console.log(
  `\nReport date ${reportDate || "—"}, period ${flag("--from") ?? "—"} to ${flag("--to") ?? "—"}\n`,
);
let differences = 0;
for (const project of PROJECTS) {
  const sheetRow = rowOf(project === "plot" ? "Saarang Plot" : "Saarang Villa");
  console.log(project === "plot" ? "Saarang Plot" : "Saarang Villa");
  for (const [key, label] of Object.entries(LABELS) as [ValueKey, string][]) {
    const ours = result[project].values[key];
    const at = header.indexOf(label);
    const theirs = at === -1 ? null : Number(sheetRow[at]);
    const diff = ours === null || theirs === null || Number.isNaN(theirs) ? null : ours - theirs;
    const same = diff !== null && Math.abs(diff) < 1;
    if (!same) differences++;
    console.log(
      `  ${key.padEnd(4)} ${label.padEnd(38)} ours ${String(ours === null ? "—" : Math.round(ours)).padStart(12)}` +
        `  sheet ${String(theirs ?? "—").padStart(12)}  ${same ? "same" : `DIFF ${diff === null ? "?" : Math.round(diff)}`}`,
    );
  }
}
console.log(`\n${differences} figure(s) differ.`);
