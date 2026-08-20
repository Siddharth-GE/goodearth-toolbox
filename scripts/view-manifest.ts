/**
 * What every view in `public` is allowed to be.
 *
 * WHY THIS FILE EXISTS. Fourteen views are owned by `postgres`, and a view
 * owned by its tables' owner BYPASSES row-level security. That is not an
 * accident — it is how /indents reads budget quantities without reading
 * budget costs, and how Financial Management reads client money without
 * reading the CRM's prose. But it means each of these views has no policy
 * behind it: its own WHERE clause, its own column list, and its grants ARE
 * the permission boundary, and until now the only thing guarding them was
 * a comment saying "NEVER add a money column".
 *
 * A comment cannot fail a build. This can. `npm run db:check-views --
 * --project <ref>` compares every view on that database against the rows
 * below and exits non-zero on any difference, and CI runs it on every pull
 * request. So a column added to a fact view, a WHERE clause that quietly
 * loses one of its `has_app` checks, a `security_invoker` flag that goes
 * missing, or a write privilege handed back by `drop view` is a red check
 * rather than a silent widening of who can read the company's money.
 *
 * HOW TO CHANGE A VIEW. Write the migration, apply it to staging, then run
 * the checker: it prints exactly what differs. Update the row here in the
 * same commit, with a sentence saying why the new shape is correct. That
 * edit is the reviewable moment — the point is not that views never
 * change, it is that changing one is never invisible.
 *
 * WHAT EACH FIELD MEANS
 *
 *   columns  Exact and in order. `information_schema` order, which is the
 *            order the view's SELECT declares.
 *   guards   Every distinct app slug appearing in a `has_app('…')` call in
 *            the view's definition, sorted. For the owner views this IS
 *            the gate. CLAUDE.md warns twice that redefining
 *            crm_milestone_facts, crm_receipt_facts or
 *            business_plan_target_facts must carry their three-way WHERE
 *            forward — re-running the older migration as-is silently
 *            strips Financial Management's access. This field is that
 *            warning made enforceable.
 *   barrier  `security_barrier=true`: stops the planner leaking rows past
 *            the WHERE through a cheap, side-effecting function.
 *   invoker  `security_invoker=true`: the view runs as the CALLER, so RLS
 *            applies. Exactly one view has it, and must.
 *   money    Does this view carry rupees? Documentation for the reader,
 *            and the question to ask before adding any column.
 */

export type ViewExpectation = {
  columns: string[];
  guards: string[];
  barrier: boolean;
  invoker: boolean;
  money: boolean;
  /** Why this shape is the correct one. */
  why: string;
};

export const VIEW_MANIFEST: Record<string, ViewExpectation> = {
  // -------------------------------------------------------------------
  // Money-free by construction. Indents and Inventory carry no money at
  // all, so these exist to let them read a purchase order or a budget
  // without reading a rupee. Adding a money column here would cross the
  // boundary in silence, because there is no policy to refuse it.
  // -------------------------------------------------------------------
  approved_budgets: {
    columns: ["id", "selection_id", "unit_id", "version", "approved_at"],
    guards: ["/budgets", "/indents"],
    barrier: true,
    invoker: false,
    money: false,
    why: "Indents needs to know a budget is approved and which design revision it prices. Nothing about what it cost.",
  },
  approved_budget_lines: {
    columns: [
      "budget_id",
      "selection_id",
      "line_key",
      "quantity",
      "expected_vendor_id",
      "budget_status",
    ],
    guards: ["/budgets", "/indents"],
    barrier: true,
    invoker: false,
    money: false,
    why: "The quantity to order and who was expected to supply it. No unit_cost, no margin_pct, no client_rate — those three names must never appear here.",
  },
  estimate_takeoff_facts: {
    columns: [
      "estimate_id",
      "project_id",
      "unit_id",
      "reference",
      "submitted_at",
      "work_item_id",
      "material_id",
      "material_name",
      "uom",
      "quantity",
      "item_id",
      "item_uom_factor",
    ],
    guards: ["/estimator", "/indents", "/inventory", "/supervisors"],
    barrier: true,
    invoker: false,
    money: false,
    why: "The official estimate's frozen material takeoff — what Indents pulls from and issues are compared against. /supervisors joined 0084 so a request for issue shows the estimate's figure beside it. Quantities and the catalogue link only: the snapshot's rate column stays behind /estimator, because adding it here would put construction pricing in front of every site engineer or supervisor.",
  },
  po_facts: {
    columns: [
      "id",
      "project_id",
      "plot_id",
      "unit_id",
      "scope_code",
      "vendor_id",
      "reference",
      "status",
      "expected_by",
      "created_at",
      "issued_at",
    ],
    guards: [],
    barrier: true,
    invoker: false,
    money: false,
    why: "A purchase order's identity and progress, for Indents and Inventory — including when it was issued, which is a date and not an amount. PO money is gated to /purchase-orders and stays there.",
  },
  po_line_facts: {
    columns: [
      "id",
      "po_id",
      "indent_line_id",
      "item_id",
      "quantity",
      "uom",
      "po_reference",
      "po_status",
    ],
    guards: [],
    barrier: true,
    invoker: false,
    money: false,
    why: "What was ordered and how much of it — the double-buy guard reads this. Deliberately no rate and no amount.",
  },
  bill_facts: {
    columns: [
      "id",
      "project_id",
      "plot_id",
      "unit_id",
      "scope_code",
      "vendor_id",
      "po_id",
      "labour_contract_id",
      "kind",
      "bill_no",
      "reference",
      "status",
      "invoice_date",
      "created_at",
      "approved_at",
      "paid_at",
    ],
    guards: [],
    barrier: true,
    invoker: false,
    money: false,
    why: "Whether a bill exists and where it has got to. The amounts live in bill_money_facts, behind a grant.",
  },
  stock_on_hand: {
    columns: ["store_id", "item_id", "quantity"],
    guards: [],
    barrier: false,
    invoker: false,
    money: false,
    why: "A quantity per store. Inventory carries no money, so there is none to leak.",
  },
  stock_by_location: {
    columns: ["location_kind", "location_id", "item_id", "quantity"],
    guards: [],
    barrier: false,
    invoker: false,
    money: false,
    why: "The same quantity, per store or per plot.",
  },
  pusher_chain_state: {
    columns: [
      "chain_id",
      "project_id",
      "unit_id",
      "activity_id",
      "trail_set_id",
      "project_stage_id",
      "title",
      "created_at",
      "project_name",
      "project_code",
      "unit_name",
      "trail_set_name",
      "activity_name",
      "department_ids",
      "department_names",
      "leg_count",
      "last_seq",
      "last_kind",
      "current_leg",
      "holder_id",
      "entered_at",
      "expected_days",
      "started_at",
      "is_queued",
      "is_finished",
      "days_in_leg",
      "is_stuck",
      "is_with_client",
      "with_client_since",
      "with_client_days",
    ],
    guards: [],
    barrier: true,
    invoker: false,
    money: false,
    why: "Relay's one read surface, redefined six times and consumed by Client Relations and Reporter as well. Carries no money; the clock-anchor columns are the fragile part, and dropping one breaks a screen in another tool.",
  },

  // -------------------------------------------------------------------
  // The money views. Every one of these is a founder decision written
  // into a migration, and every one is gated by its own WHERE. The guards
  // list below is the whole permission boundary — if it shrinks, someone
  // has lost access; if it grows, someone has gained it.
  // -------------------------------------------------------------------
  po_billing_totals: {
    columns: ["po_id", "ordered_total", "billed_total", "bill_count"],
    guards: ["/bills", "/purchase-orders"],
    barrier: true,
    invoker: false,
    money: true,
    why: "The one sanctioned money window between purchase orders and bills: ordered against billed, for the two tools that already see both. Not money-free — it is money behind a gate.",
  },
  bill_money_facts: {
    columns: [
      "id",
      "project_id",
      "plot_id",
      "unit_id",
      "scope_code",
      "vendor_id",
      "kind",
      "status",
      "invoice_date",
      "taxable_amount",
      "gst_amount",
      "total_amount",
      "approved_at",
      "paid_at",
      "created_at",
      "vendor_name",
      "project_name",
    ],
    guards: ["/bills", "/financial-management"],
    barrier: true,
    invoker: false,
    money: true,
    why: "Bill amounts for Financial Management. Deliberately omits payment_ref, rejection_note and note — the prose is the stronger secret, and those three must never appear here.",
  },
  business_plan_target_facts: {
    columns: [
      "id",
      "plan_id",
      "plan_name",
      "scenario_name",
      "project_id",
      "project_name",
      "revenue",
      "total_cost",
      "pbt",
      "margin_pct",
      "peak_funding",
      "actual_spend",
      "actual_collections",
      "published_at",
    ],
    guards: ["/business-planning", "/financial-management", "/reporter"],
    barrier: true,
    invoker: false,
    money: true,
    why: "Published plan targets, three ways. THE THREE-WAY WHERE IS LOAD-BEARING: re-running an earlier migration as-is drops Financial Management and Reporter without failing anything.",
  },
  crm_milestone_facts: {
    columns: [
      "id",
      "engagement_id",
      "project_id",
      "unit_id",
      "project_name",
      "unit_name",
      "client_id",
      "client_name",
      "stage",
      "sort_order",
      "due_amount",
      "due_on",
      "invoice_no",
      "invoiced_on",
      "received_amount",
      "created_at",
    ],
    guards: ["/client-relations", "/financial-management", "/reporter"],
    barrier: true,
    invoker: false,
    money: true,
    why: "Client payment milestones, three ways. The column list omits the CRM's prose — details, notes, bottlenecks — because that, not the money, is its stronger secret. THE THREE-WAY WHERE IS LOAD-BEARING.",
  },
  crm_receipt_facts: {
    columns: [
      "id",
      "engagement_id",
      "project_id",
      "unit_id",
      "project_name",
      "unit_name",
      "client_id",
      "client_name",
      "milestone_id",
      "milestone_stage",
      "amount",
      "received_on",
      "mode",
      "reference",
      "created_at",
    ],
    guards: ["/client-relations", "/financial-management", "/reporter"],
    barrier: true,
    invoker: false,
    money: true,
    why: "Money actually received, three ways. THE THREE-WAY WHERE IS LOAD-BEARING.",
  },
  budget_report_lines: {
    columns: [
      "id",
      "budget_id",
      "selection_id",
      "line_key",
      "quantity",
      "unit_cost",
      "margin_pct",
      "client_rate",
      "line_status",
      "needs_review",
      "priced_at",
      "created_at",
      "expected_vendor_id",
      "vendor_name",
      "budget_status",
      "version",
      "approved_at",
      "unit_id",
      "unit_name",
      "project_id",
      "project_name",
      "item_id",
      "uom",
      "item_name",
      "item_code",
    ],
    guards: [],
    barrier: true,
    invoker: true,
    money: true,
    why: "THE ONE security_invoker VIEW, and it must stay one. It carries unit_cost, margin_pct and client_rate, so it has to INHERIT row-level security rather than bypass it — its guards list is empty precisely because the policies on the tables underneath are doing the work. If invoker ever goes false here, every rupee of margin in the company is readable by anyone signed in.",
  },
};
