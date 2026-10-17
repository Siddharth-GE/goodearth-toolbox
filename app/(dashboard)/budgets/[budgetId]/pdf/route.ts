import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { BudgetDocument } from "@/lib/budgets/budget-document";
import { getBudget } from "@/lib/budgets/queries";
import { createElement, type ReactElement } from "react";

/**
 * The internal budget sheet (Document B). getBudget enforces the /budgets grant.
 * Generated on demand, so it can't drift from the figures.
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
  // "INTERNAL" in the filename: it is what someone reads before attaching to an email.
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
