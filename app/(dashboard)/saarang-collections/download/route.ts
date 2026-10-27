import { safeFilename } from "@/lib/csv";
import { todayInIndia } from "@/lib/format";
import { getCollections } from "@/lib/saarang-collections/queries";
import { meetingSheets } from "@/lib/saarang-collections/summary";
import { writeWorkbookBytes } from "@/lib/xlsx";

/** The meeting workbook. getCollections enforces the grant (a redirect, as on the other exports). */
export async function GET() {
  const { settings, figures, result } = await getCollections();
  const bytes = writeWorkbookBytes(meetingSheets({ figures, result }, settings));
  const name = safeFilename(`Saarang Collection Meeting ${settings.reportDate ?? todayInIndia()}`);
  return new Response(new Blob([bytes as BlobPart]), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
