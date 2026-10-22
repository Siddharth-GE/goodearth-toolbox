// Index only: assembles the per-dataset files under datasets/. The rules every dataset obeys are in
// datasets/types.ts.

export type { FieldType, KnownSource, Aggregate, FieldDef, DatasetDef } from "./datasets/types";
export { KNOWN_SOURCES, AGGREGATES } from "./datasets/types";

import type { DatasetDef } from "./datasets/types";
import { indentLines } from "./datasets/indent-lines";
import { poLines } from "./datasets/po-lines";
import { bills } from "./datasets/bills";
import { budgetReportLines } from "./datasets/budget-report-lines";
import { crmMilestones } from "./datasets/crm-milestones";
import { crmReceipts } from "./datasets/crm-receipts";
import { goodsReceiptLines } from "./datasets/goods-receipt-lines";
import { stockIssueLines } from "./datasets/stock-issue-lines";
import { stock } from "./datasets/stock";
import { selectionLines } from "./datasets/selection-lines";
import { relayChains } from "./datasets/relay-chains";
import { units } from "./datasets/units";
import { planTargets } from "./datasets/plan-targets";
import { birdwingStays } from "./datasets/birdwing-stays";
import { birdwingExpenses } from "./datasets/birdwing-expenses";

export const DATASETS: Record<string, DatasetDef> = {
  indent_lines: indentLines,
  po_lines: poLines,
  bills,
  budget_report_lines: budgetReportLines,
  crm_milestones: crmMilestones,
  crm_receipts: crmReceipts,
  goods_receipt_lines: goodsReceiptLines,
  stock_issue_lines: stockIssueLines,
  stock,
  selection_lines: selectionLines,
  relay_chains: relayChains,
  units,
  plan_targets: planTargets,
  birdwing_stays: birdwingStays,
  birdwing_expenses: birdwingExpenses,
};

export const DEFAULT_DATASET = "indent_lines";

// Null when it matches nothing; the caller drops it.
export function resolveFieldKey(dataset: DatasetDef, key: unknown): string | null {
  if (typeof key !== "string" || !key) return null;
  if (Object.prototype.hasOwnProperty.call(dataset.fields, key)) return key;
  for (const [current, field] of Object.entries(dataset.fields)) {
    if (field.aliases?.includes(key)) return current;
  }
  return null;
}
