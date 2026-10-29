/**
 * Why a master could not be deleted, in a sentence (0150). The guard's own refusals already read plainly; a foreign-key
 * refusal names the table that uses it, which becomes what a person would call it. A master with an Active switch is
 * told to retire instead.
 */

const USERS: Record<string, string> = {
  bill_counters: "Bill numbers",
  bill_lines: "Bill lines",
  bills: "Bills",
  birdwing_expenses: "Birdwing expenses",
  birdwing_settings: "Birdwing's settings",
  budget_lines: "Budget lines",
  budgets: "Budgets",
  business_plan_targets: "Business plan targets",
  business_plans: "Business plans",
  cash_request_items: "Cash requests",
  checklist_template_groups: "Site checklists",
  client_actions: "Client Relations actions",
  client_engagements: "Client Relations plots",
  client_receipts: "Client receipts",
  contractor_bill_numbers: "Contractor bill numbers",
  contractor_advances: "Contractor advances",
  design_actions: "Design actions",
  design_step_events: "The design board",
  design_steps: "The design board",
  drawing_revision_works: "Drawings",
  drawing_revisions: "Drawings",
  drawing_set_works: "Drawings",
  est_counters: "Estimate numbers",
  estimator_estimate_item_rates: "Estimates",
  estimator_estimate_line_components: "Estimates",
  estimator_estimate_line_costs: "Estimates",
  estimator_estimate_line_model_materials: "Estimates",
  estimator_estimate_lines: "Estimates",
  estimator_estimate_other_costs: "Estimates",
  estimator_estimate_takeoff: "Estimates",
  estimator_estimates: "Estimates",
  estimator_materials: "The rate book",
  estimator_mix_components: "The rate book's mixes",
  estimator_mixes: "The rate book's mixes",
  estimator_reconciliation_approvals: "Site checks",
  estimator_work_components: "The rate book",
  estimator_work_info: "The rate book",
  goods_receipt_lines: "Deliveries",
  goods_receipts: "Deliveries",
  google_chat_spaces: "Google Chat spaces",
  grn_counters: "Delivery numbers",
  indent_counters: "Indent numbers",
  indent_lines: "Indent lines",
  indents: "Indents",
  iss_counters: "Issue numbers",
  issue_requests: "Material requests",
  item_price_changes: "Price history",
  item_requests: "Item requests",
  items: "Items",
  labour_contract_lines: "Work orders",
  labour_contracts: "Work orders",
  labour_logs: "Labour entries",
  plots: "Plots",
  po_counters: "PO numbers",
  project_stages: "Relay's project stages",
  projects: "Projects",
  purchase_order_lines: "Purchase order lines",
  purchase_orders: "Purchase orders",
  pusher_chains: "Relay trails",
  pusher_project_plans: "Relay plans",
  selection_lines: "Selections",
  selections: "Selections",
  site_checklists: "Site checklists",
  site_return_lines: "Returns from site",
  site_returns: "Returns from site",
  site_sequence: "Supervisors' sequence",
  site_stage_events: "Villa programmes",
  site_stages: "Villa programmes",
  site_villas: "Villa programmes",
  stock_adjustments: "Stock adjustments",
  stock_batch_movements: "Stock movements",
  stock_issue_lines: "Stock issues",
  stock_issues: "Stock issues",
  transmittals: "Transmittals",
  units: "Villas",
  vendor_payment_details: "Bank details",
  wo_counters: "Work order numbers",
  work_groups: "Work groups",
  work_items: "Works",
  work_order_template_lines: "Work order templates",
};

/** `noun` as it reads after "this": "vendor", "villa". `retire`: the master has an Active switch. */
export function deleteRefusal(
  error: { message: string; code?: string },
  noun: string,
  retire: boolean,
): string {
  const instead = retire ? " Untick Active to retire it instead." : "";
  if (error.code === "23503") {
    const tables = [...error.message.matchAll(/on table "([a-z_]+)"/g)].map((m) => m[1]);
    const user = USERS[tables[tables.length - 1] ?? ""] ?? "Other records";
    return `${user} use this ${noun}, so it cannot be deleted.${instead}`;
  }
  if (/so it cannot be deleted$/.test(error.message)) {
    return `${error.message.replace(/^.*?:\s*/, "")}.${instead}`;
  }
  return `Could not delete this ${noun}. Try again.`;
}
