import { listExpenses } from "@/lib/birdwing-books/queries";
import { csvResponse, csvRow } from "@/lib/csv";
import { todayInIndia } from "@/lib/format";

/**
 * A month's expense lines as a CSV for reading in a spreadsheet, in the
 * workbook's own ten columns. An imported line keeps its old sheet and
 * cell; a line made here has none — so this file is for reading, not for
 * uploading back (a line made here would come in twice).
 * listExpenses enforces the /birdwing-books grant.
 */
export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("month") ?? "";
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : todayInIndia().slice(0, 7);
  const { rows } = await listExpenses(month);

  const lines = [
    csvRow([
      "Month",
      "Category",
      "Description / Staff",
      "Date",
      "Amount (INR)",
      "Remarks",
      "Invoice Link",
      "Source Sheet",
      "Source Cell",
      "Review Note",
    ]),
    ...rows.map((row) =>
      csvRow([
        row.month,
        row.headName,
        row.description,
        row.spentOn ?? "",
        row.amount.toFixed(2),
        [row.vendorName ?? row.payee, row.billRef && `bill ${row.billRef}`, row.paymentDetails]
          .filter(Boolean)
          .join(" · "),
        "",
        row.sourceKey?.includes("!") ? row.sourceKey.slice(0, row.sourceKey.indexOf("!")) : "",
        row.sourceKey?.includes("!") ? row.sourceKey.slice(row.sourceKey.indexOf("!") + 1) : "",
        row.reviewNote ?? "",
      ]),
    ),
  ];
  return csvResponse(lines, `Birdwing-expenses-${month}.csv`);
}
