import { getBudgetHandoff } from "@/lib/selections/queries";

/** Excel reads a leading `=`, `+`, `-` or `@` as a formula, so a cell
 *  starting with one is prefixed with a quote. Without this an item named
 *  "-- spare --" becomes a broken formula in someone's spreadsheet. */
function cell(value: string | number | null): string {
  const text = value === null ? "" : String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

/**
 * A revision as a spreadsheet.
 *
 * Same shape as the PDF and the same rule: quantities only, no rates.
 * This exists so a designer can work with the list in Excel — sorting,
 * sharing, marking up — not so pricing can leak out of Budgets.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ selectionId: string }> },
) {
  const { selectionId } = await params;
  const handoff = await getBudgetHandoff(selectionId);
  if (!handoff) return new Response("Not found", { status: 404 });

  const rows: string[] = [
    ["Space", "Space type", "#", "Code", "Item", "Brand", "Quantity", "Unit", "Notes"]
      .map(cell)
      .join(","),
  ];

  for (const group of handoff.spaces) {
    group.lines.forEach((line, index) => {
      rows.push(
        [
          cell(group.space.label),
          cell(group.space.space_type_name),
          cell(index + 1),
          cell(line.item_code),
          cell(line.item_name),
          cell(line.item_brand),
          cell(line.quantity),
          cell(line.uom),
          cell(line.designer_note),
        ].join(","),
      );
    });
  }

  const safe = (value: string) => value.replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "");
  const filename = `Goodearth-Selections-${safe(handoff.selection.unit_name)}-R${
    handoff.selection.revision_no
  }.csv`;

  return new Response(
    // BOM so Excel opens it as UTF-8 rather than mangling any non-ASCII.
    `﻿${rows.join("\r\n")}`,
    {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    },
  );
}
