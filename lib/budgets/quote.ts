import "server-only";

import { downloadSpaceView, listSpaceViews } from "@/lib/selections/views";

import { getBudget } from "./queries";
import { lineAmount } from "./math";
import { quoteReference } from "./reference";

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
  /** Which pricing of that design revision this quotation represents. */
  version: number;
  /** Unique per document sent: QT/PLOT6/R2-V2. */
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

  // All spaces at once, not one after another — the downloads are the
  // slow part, and a ten-space quote was ten sequential batches of them.
  const spaces: QuoteSpace[] = await Promise.all(
    budget.spaces.map(async (space) => {
      const lines: QuoteLine[] = space.lines.map((line) => ({
        item_name: line.item_name,
        item_code: line.item_code,
        item_brand: line.item_brand,
        quantity: line.quantity,
        uom: line.uom,
        rate: line.client_rate,
        amount: lineAmount(line),
      }));

      // The bucket is private, so there is no URL react-pdf could fetch —
      // the bytes come down here, exactly as the design document does it.
      const views = await Promise.all(
        (viewRows.get(space.space_id) ?? []).map(async (view) => {
          const data = await downloadSpaceView(view.storage_path);
          return data ? { data, caption: view.caption } : null;
        }),
      );

      return {
        space_id: space.space_id,
        label: space.label,
        space_type_name: space.space_type_name,
        lines,
        // A view whose file has gone missing is dropped rather than
        // failing the whole quote.
        views: views.filter((view): view is QuoteView => view !== null),
        // The space's own full-precision sum, so the column adds up to
        // the total printed under it.
        total: space.totals.client,
      };
    }),
  );

  const total = spaces.reduce((sum, space) => sum + space.total, 0);
  const unpricedCount = spaces.reduce(
    (sum, space) => sum + space.lines.filter((line) => line.amount === null).length,
    0,
  );

  return {
    project_name: budget.project_name,
    unit_name: budget.unit_name,
    revision_no: budget.revision_no,
    version: budget.version,
    reference: quoteReference(budget.unit_name, budget.revision_no, budget.version),
    approved_at: budget.approved_at,
    isDraft: budget.status !== "approved",
    spaces,
    total,
    unpricedCount,
  };
}
