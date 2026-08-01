import "server-only";

import { downloadSpaceView, listSpaceViews } from "@/lib/selections/views";

import { getBudget } from "./queries";
import { lineAmount } from "./math";

/**
 * The client quote's data — and, just as importantly, the shape of what
 * the client quote is NOT allowed to see.
 *
 * There is no `unit_cost` and no `margin_pct` field anywhere in these
 * types. That is the point. The quote could have been rendered from
 * BudgetDetail with those columns left out of the template, but then the
 * numbers would still be sitting in the props, one careless edit away from
 * being printed. Here they are stripped once, deliberately, in a function
 * whose whole job is stripping them — and the document that follows
 * cannot print what it was never handed.
 *
 * This mirrors what the database already enforces (migration 0011 gates
 * reads on those tables to /budgets). Belt and braces, because the failure
 * being guarded against is the one that would actually harm the business.
 */

export type QuoteLine = {
  item_name: string;
  item_code: string | null;
  item_brand: string | null;
  quantity: number;
  uom: string;
  /** What the client pays per unit. Cost plus margin, already applied. */
  rate: number | null;
  amount: number | null;
};

export type QuoteView = { data: Buffer; caption: string | null };

export type QuoteSpace = {
  space_id: string;
  label: string;
  space_type_name: string;
  lines: QuoteLine[];
  views: QuoteView[];
  total: number;
};

export type QuoteData = {
  project_name: string;
  unit_name: string;
  revision_no: number;
  reference: string;
  approved_at: string | null;
  /** True until the budget is approved — the document watermarks itself. */
  isDraft: boolean;
  spaces: QuoteSpace[];
  total: number;
  /** Lines still without a price, so the caller can warn before sending. */
  unpricedCount: number;
};

export async function getQuote(budgetId: string): Promise<QuoteData | null> {
  // getBudget enforces the /budgets grant, so nothing here needs to
  // re-check it — and nothing here reads a table it hasn't already.
  const budget = await getBudget(budgetId);
  if (!budget) return null;

  const viewRows = await listSpaceViews(budget.spaces.map((space) => space.space_id));

  const spaces: QuoteSpace[] = [];
  let total = 0;
  let unpricedCount = 0;

  for (const space of budget.spaces) {
    const lines: QuoteLine[] = space.lines.map((line) => {
      const amount = lineAmount(line);
      if (amount === null) unpricedCount++;
      return {
        item_name: line.item_name,
        item_code: line.item_code,
        item_brand: line.item_brand,
        quantity: line.quantity,
        uom: line.uom,
        rate: line.client_rate,
        amount,
      };
    });

    // The bucket is private, so there is no URL react-pdf could fetch —
    // the bytes come down here, exactly as the design document does it.
    const views = await Promise.all(
      (viewRows.get(space.space_id) ?? []).map(async (view) => {
        const data = await downloadSpaceView(view.storage_path);
        return data ? { data, caption: view.caption } : null;
      }),
    );

    // Summed from the space's own lines at full precision, not from
    // rounded figures, so the column adds up to the total printed under it.
    const spaceTotal = space.totals.client;
    total += spaceTotal;

    spaces.push({
      space_id: space.space_id,
      label: space.label,
      space_type_name: space.space_type_name,
      lines,
      // A view whose file has gone missing is dropped rather than failing
      // the whole quote.
      views: views.filter((view): view is QuoteView => view !== null),
      total: spaceTotal,
    });
  }

  return {
    project_name: budget.project_name,
    unit_name: budget.unit_name,
    revision_no: budget.revision_no,
    reference: `QT/${budget.unit_name}/R${budget.revision_no}`.toUpperCase().replace(/\s+/g, ""),
    approved_at: budget.approved_at,
    isDraft: budget.status !== "approved",
    spaces,
    total,
    unpricedCount,
  };
}
