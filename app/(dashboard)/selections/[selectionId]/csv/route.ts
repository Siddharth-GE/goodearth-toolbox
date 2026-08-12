import { csvResponse, csvRow, safeFilename } from "@/lib/csv";
import { getBudgetHandoff } from "@/lib/selections/queries";

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
    csvRow(["Space", "Space type", "#", "Code", "Item", "Brand", "Quantity", "Unit", "Notes"]),
  ];

  for (const group of handoff.spaces) {
    group.lines.forEach((line, index) => {
      rows.push(
        csvRow([
          group.space.label,
          group.space.space_type_name,
          index + 1,
          line.item_code,
          line.item_name,
          line.item_brand,
          line.quantity,
          line.uom,
          line.designer_note,
        ]),
      );
    });
  }

  const filename = `Goodearth-Selections-${safeFilename(handoff.selection.unit_name)}-R${
    handoff.selection.revision_no
  }.csv`;

  return csvResponse(rows, filename);
}
