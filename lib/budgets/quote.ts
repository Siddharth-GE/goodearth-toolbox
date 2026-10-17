import "server-only";

import { downloadSpaceView, listSpaceViews } from "@/lib/design-views/queries";

import { getBudget } from "./queries";
import { lineAmount } from "./math";
import { quoteReference } from "./reference";

/**
 * The client quote's data. No `unit_cost` or `margin_pct` anywhere: they are stripped once, here, so the document can't print what it was never handed.
 * Mirrors the database (migration 0011 gates those tables to /budgets).
 */

export type QuoteLine = {
  item_name: string;
  item_code: string | null;
  item_brand: string | null;
  quantity: number;
  uom: string;
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
  version: number;
  /** Unique per document sent: QT/PLOT6/R2-V2. */
  reference: string;
  approved_at: string | null;
  isDraft: boolean;
  spaces: QuoteSpace[];
  total: number;
  unpricedCount: number;
};

export async function getQuote(budgetId: string): Promise<QuoteData | null> {
  // getBudget enforces the /budgets grant, so nothing here re-checks it.
  const budget = await getBudget(budgetId);
  if (!budget) return null;

  const viewRows = await listSpaceViews(budget.spaces.map((space) => space.space_id));

  // All spaces at once: the downloads are the slow part.
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

      // The bucket is private, so react-pdf can't fetch a URL: the bytes come down here.
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
        // A missing view file is dropped rather than failing the whole quote.
        views: views.filter((view): view is QuoteView => view !== null),
        // The space's own full-precision sum, so the column adds up to the total under it.
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
