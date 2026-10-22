// Pure half of scripts/import-checklists.ts: the operations team's checklists workbook (Tb\3.xls,
// saved once as .xlsx) as templates. One sheet is one checklist; its items sit under the
// "No. | Source No. | Checklist Item | …" header. "Concrete grade check" lists works instead, each
// answered with the grade in Remarks.

import type { Cell, SheetRow } from "@/lib/masters/masters-workbook";

export type ChecklistOrigin = "source" | "added" | "review";

export type ChecklistTemplateItem = {
  sortOrder: number;
  text: string;
  origin: ChecklistOrigin;
  reviewNote: string | null;
};

export type ChecklistTemplateSheet = {
  name: string;
  workRefs: string | null;
  note: string | null;
  sortOrder: number;
  items: ChecklistTemplateItem[];
};

export const CONCRETE_GRADE_SHEET = "Concrete grade check";
const CONCRETE_GRADE_NOTE =
  "Write the concrete grade in Remarks for each work, and attach the test certificate.";

function text(cell: Cell): string {
  return (cell ?? "").replace(/\s+/g, " ").trim();
}

function originOf(cell: Cell): ChecklistOrigin {
  const value = text(cell).toLowerCase();
  return value === "added" || value === "review" ? value : "source";
}

function itemsUnderHeader(rows: SheetRow[]): ChecklistTemplateItem[] {
  const header = rows.findIndex(
    (row) => text(row.cells[0]) === "No." && text(row.cells[2]) === "Checklist Item",
  );
  if (header === -1) return [];
  const items: ChecklistTemplateItem[] = [];
  for (const row of rows.slice(header + 1)) {
    const itemText = text(row.cells[2]);
    if (!/^\d+$/.test(text(row.cells[0])) || itemText === "") break;
    items.push({
      sortOrder: items.length + 1,
      text: itemText,
      origin: originOf(row.cells[5]),
      reviewNote: text(row.cells[6]) || null,
    });
  }
  return items;
}

function concreteGradeItems(rows: SheetRow[]): ChecklistTemplateItem[] {
  const header = rows.findIndex(
    (row) => text(row.cells[0]) === "Work" && text(row.cells[1]) === "Grade",
  );
  if (header === -1) return [];
  return rows
    .slice(header + 1)
    .map((row) => text(row.cells[0]))
    .filter((work) => work !== "")
    .map((work, index) => ({
      sortOrder: index + 1,
      text: work,
      origin: "source" as const,
      reviewNote: null,
    }));
}

function workRefsOf(rows: SheetRow[]): string | null {
  const row = rows.find((candidate) => text(candidate.cells[0]) === "Work References");
  return row ? text(row.cells.slice(1).find((cell) => text(cell) !== "")) || null : null;
}

/** Every sheet with items, in workbook order; a sheet with none is left out. */
export function readChecklistWorkbook(sheets: Map<string, SheetRow[]>): ChecklistTemplateSheet[] {
  const templates: ChecklistTemplateSheet[] = [];
  for (const [sheetName, rows] of sheets) {
    const name = sheetName.trim();
    const concrete = name === CONCRETE_GRADE_SHEET;
    const items = concrete ? concreteGradeItems(rows) : itemsUnderHeader(rows);
    if (items.length === 0) continue;
    templates.push({
      name,
      workRefs: concrete ? null : workRefsOf(rows),
      note: concrete ? CONCRETE_GRADE_NOTE : null,
      sortOrder: templates.length + 1,
      items,
    });
  }
  return templates;
}
