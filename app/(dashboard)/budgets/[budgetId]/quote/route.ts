import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { getQuote } from "@/lib/budgets/quote";
import { QuoteDocument } from "@/lib/budgets/quote-document";
import { createElement, type ReactElement } from "react";

/** The client quotation (Document C), built from getQuote, whose type has no cost or margin field, so it cannot leak them. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ budgetId: string }> },
) {
  const { budgetId } = await params;

  // getQuote throws if the design photographs fail to load: refuse a wrong quote, but say why in English.
  let quote;
  try {
    quote = await getQuote(budgetId);
  } catch (error) {
    console.error("Quote PDF failed:", error);
    return new Response("Could not build the quotation just now. Try again in a moment.", {
      status: 503,
    });
  }
  if (!quote) return new Response("Not found", { status: 404 });

  const buffer = await renderToBuffer(
    createElement(QuoteDocument, { quote }) as ReactElement<DocumentProps>,
  );

  const safe = (value: string) => value.replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "");
  // Version in the filename too, so two quotations never share a name.
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
