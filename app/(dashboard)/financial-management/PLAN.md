# Financial Management — the rules

**Shipped 2026-08-13** (PR #17). Migration `0058`.

The company's whole money picture in three screens, plus the one thing no other tool records: **funds raised** from banks, private equity and private lenders, with interest.

_Trimmed 2026-08-14: the build-stage log lives in git._

## The three screens

1. **Cash** (`/financial-management/cash`) — actual money in (client collections + facility drawdowns) against actual money out (bills paid + repayments + interest paid), month by month. The caption is honest on screen: **this is net of what the toolbox has recorded, not a bank balance** — salaries and overheads paid outside Bills are invisible to it.
2. **Forward** (`/forward`) — expected collections from the CRM payment schedules against remaining expected spend from published business plans, and the funding gap net of undrawn headroom. **Expected spend has no dates, so it shows as a total, never a fake curve.** Overdue and unscheduled collections are figures, never bars.
3. **Funding** (`/funding`) — the tool's own data. Each source is a **facility** (party, kind, rate, free-text terms; "mixed and different per deal" is the norm, so rate and cap are nullable), and money events are **movements** against it: drawdown, repayment, interest paid.

## The decisions

1. **The read surface is views only — no table qual was widened.** `0058` restates `crm_milestone_facts`, `crm_receipt_facts` and `business_plan_target_facts` with a **three-way** WHERE, and adds one new owner view, `bill_money_facts` (bills money without `payment_ref`/`rejection_note`/`note` — the column list is the boundary, `0056`'s mechanism). **`0055`'s seven-widened-policies invariant is untouched**, and `0058` ends by asserting exactly four views admit this tool.
   > **Anyone redefining those three views must carry the three-way WHERE forward.** Re-running `0056`/`0057` as written silently strips this tool's access, and nothing would fail loudly.
2. **Budget tables are skipped entirely.** `budget_report_lines` is `security_invoker`, so reading it would force widening three quals and expose margin — and budget lines carry no dates anyway. `business_plan_target_facts.total_cost − actual_spend` is the remaining-expected-spend figure.
3. **Interest is computed monthly, and is informational only.** Simple accrual in the pure module `lib/financial-management/interest.ts`: for each completed month since the first drawdown, outstanding principal at month end × rate/1200. **No day-count, non-compounding, one rate for all time; a null rate is a dash, never zero.** Real interest paid is whatever movements were recorded — the screen shows computed vs paid, and the gap may go negative on an irregular deal that pays more.
4. **Deletion is refused, not cascaded.** Movements are deletable, because mistakes must be correctable and the audit keeps the before-image. A facility with movements cannot be deleted (RESTRICT FK) — deactivate instead.
5. **The grant carries an amber warning** (`grantWarning` in `lib/tools.ts`), Reporter's treatment. This tool shows more money than anything else in the app, **including who lent the company what, at what rate.**
6. **Nothing is re-recorded.** Collections stay in Client Relations, bills in Bills, targets in Business Planning. This tool reads their views and owns only `funding_facilities` / `funding_movements`.

## Things that will bite

- **This tool is fully leaf — nothing reads it** — but it depends on four other tools' data. Each dependency degrades to zero rather than breaking: no CRM receipts means no collections, no published plan means no forward spend.
- **It charts through `components/ui/chart/*`**, which transitively depends on `lib/reporter/*` (`AUDIT.md` MOD-02). Until that is untangled, deleting Reporter stops this tool compiling. Nothing here imports Reporter directly, and nothing may.
- **Welcome counts are deliberately rupee-free** — facilities, approved-unpaid bills and receipts this month, as plain counts. A welcome screen must not leak what the money views gate.

## Open items — confirm with the founder as they come up

- **Opening balance / true bank balance** — a real bank figure needs one; later feature if it matters.
- **Dated spend forecasting** at budget grain — a real later feature.
- **Partial bill payments** — Bills has none; v1 accepts paid-in-full.
- **Interest convention sanity-check** against one real facility's own statement, before the accrued column is trusted.
- **Equity**: "repayment" currently doubles as return of capital; dividends may need their own movement kind.
