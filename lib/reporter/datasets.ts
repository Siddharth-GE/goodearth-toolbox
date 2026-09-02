/**
 * The dataset registry — index only.
 *
 * The registry used to be a single ~1,900-line file: shared types, then
 * twelve hand-authored dataset definitions. One definition per file is
 * easier to read and to review a diff against, so each dataset now lives
 * in its own file under `datasets/`, and this file just assembles them
 * back into the same public surface — every existing import of
 * `@/lib/reporter/datasets` keeps working unchanged. See
 * `datasets/types.ts` for the rules that keep the registry honest (the
 * hand-authored `select`, the named-constraint embed rule, the
 * count_distinct identity trap, the no-typing filter rule) — they apply
 * to every file in this folder, not just the types.
 */

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
import { stock } from "./datasets/stock";
import { selectionLines } from "./datasets/selection-lines";
import { relayChains } from "./datasets/relay-chains";
import { units } from "./datasets/units";
import { planTargets } from "./datasets/plan-targets";

export const DATASETS: Record<string, DatasetDef> = {
  indent_lines: indentLines,
  po_lines: poLines,
  bills,
  budget_report_lines: budgetReportLines,
  crm_milestones: crmMilestones,
  crm_receipts: crmReceipts,
  goods_receipt_lines: goodsReceiptLines,
  stock,
  selection_lines: selectionLines,
  relay_chains: relayChains,
  units,
  plan_targets: planTargets,
};

/** Where a blank or unrecognisable spec lands. */
export const DEFAULT_DATASET = "indent_lines";

/**
 * A field key, or an alias of one, resolved to the current key.
 * Null when it matches nothing — the caller drops it, never throws.
 */
export function resolveFieldKey(dataset: DatasetDef, key: unknown): string | null {
  if (typeof key !== "string" || !key) return null;
  if (Object.prototype.hasOwnProperty.call(dataset.fields, key)) return key;
  for (const [current, field] of Object.entries(dataset.fields)) {
    if (field.aliases?.includes(key)) return current;
  }
  return null;
}
