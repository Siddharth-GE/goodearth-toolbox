import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { BudgetDocument } from "@/lib/budgets/budget-document";
import { getBudget } from "@/lib/budgets/queries";
import { createElement, type ReactElement } from "react";

/**
 * Document B — the internal budget sheet, as a PDF download.
 *
 * getBudget enforces the /budgets grant, so someone without it gets
 * redirected rather than a file. Generated on demand rather than stored,
 * so it can never drift from the figures it represents.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ budgetId: string }> },
) {
  const { budgetId } = await params;

  const budget = await getBudget(budgetId);
  if (!budget) return new Response("Not found", { status: 404 });

  const buffer = await renderToBuffer(
    createElement(BudgetDocument, { budget }) as ReactElement<DocumentProps>,
  );

  const safe = (value: string) => value.replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "");
  // "INTERNAL" in the filename, not only on the page: the name is what
  // someone reads before deciding what to attach to an email.
  const filename = `Goodearth-Budget-INTERNAL-${safe(budget.project_name)}-${safe(
    budget.unit_name,
  )}-R${budget.revision_no}-v${budget.version}.pdf`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
