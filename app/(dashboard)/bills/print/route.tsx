import { Document, renderToBuffer } from "@react-pdf/renderer";
import { BillPage, type BillPdfData } from "@/lib/bills/bill-document";
import { loadBillPdfData, loadSheetPdfData } from "@/lib/bills/pdf-data";
import { SheetPage, type SheetPdfData } from "@/lib/bills/sheet-document";
import { pdfResponse } from "@/lib/pdf/response";
import { requireTool } from "@/lib/auth/access";
import { todayInIndia } from "@/lib/format";

// The bulk Print: every ticked sheet, then every ticked bill, each from a new page, in one PDF. The loaders read under
// the /bills grant one at a time, so a large bundle never opens a hundred reads at once.

const MAX = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const idsOf = (value: string | null) =>
  [...new Set((value ?? "").split(",").map((id) => id.trim()))].filter((id) => UUID.test(id));

export async function GET(request: Request) {
  await requireTool("/bills");
  const url = new URL(request.url);
  const sheetIds = idsOf(url.searchParams.get("sheets"));
  const billIds = idsOf(url.searchParams.get("bills"));
  if (sheetIds.length + billIds.length === 0) {
    return new Response("Tick the bills or sheets to print.", { status: 400 });
  }
  if (sheetIds.length + billIds.length > MAX) {
    return new Response(`Print at most ${MAX} at a time.`, { status: 400 });
  }

  const sheets: SheetPdfData[] = [];
  for (const id of sheetIds) {
    const data = await loadSheetPdfData(id);
    if (data) sheets.push(data);
  }
  const bills: BillPdfData[] = [];
  for (const id of billIds) {
    const data = await loadBillPdfData(id);
    if (data) bills.push(data);
  }
  if (sheets.length + bills.length === 0) return new Response("Not found", { status: 404 });

  const buffer = await renderToBuffer(
    <Document title="Goodearth Bills" author="Goodearth" creator="Kaadal Toolbox">
      {sheets.map((data) => (
        <SheetPage key={data.sheet.id} data={data} />
      ))}
      {bills.map((data) => (
        <BillPage key={data.bill.id} data={data} />
      ))}
    </Document>,
  );

  return pdfResponse(buffer, `Goodearth-Bills-${todayInIndia()}.pdf`, { disposition: "inline" });
}
