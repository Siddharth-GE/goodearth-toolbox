import { safeFilename } from "@/lib/csv";
import { getLedger } from "@/lib/kaadal-billing/queries";
import { ledgerSheets } from "@/lib/kaadal-billing/workbook";
import { writeWorkbookBytes } from "@/lib/xlsx";

/** The whole ledger as a workbook. getLedger enforces the grant (a redirect, as on the other exports). */
export async function GET() {
  const ledger = await getLedger();
  const bytes = writeWorkbookBytes(ledgerSheets(ledger));
  const name = safeFilename(`Kaadal Vendor Payments ${ledger.today}`);
  return new Response(new Blob([bytes as BlobPart]), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
