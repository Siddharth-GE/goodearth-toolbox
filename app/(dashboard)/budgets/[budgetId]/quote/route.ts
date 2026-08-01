import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { getQuote } from "@/lib/budgets/quote";
import { QuoteDocument } from "@/lib/budgets/quote-document";
import { createElement, type ReactElement } from "react";

/**
 * Document C — the client quotation, as a PDF download.
 *
 * The data comes from getQuote, whose returned type has no cost and no
 * margin field at all, so this route could not leak them even if the
 * template asked. See lib/budgets/quote.ts.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ budgetId: string }> },
) {
  const { budgetId } = await params;

  const quote = await getQuote(budgetId);
  if (!quote) return new Response("Not found", { status: 404 });

  const buffer = await renderToBuffer(
    createElement(QuoteDocument, { quote }) as ReactElement<DocumentProps>,
  );

  const safe = (value: string) => value.replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "");
  // The version is in the filename too: a folder of these must not have
  // two different quotations sharing a name.
  const filename = `Goodearth-Quotation-${safe(quote.project_name)}-${safe(quote.unit_name)}-R${
    quote.revision_no
  }-v${quote.version}.pdf`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
