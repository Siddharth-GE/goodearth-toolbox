# Financial Management — PLAN

The company's whole money picture in three screens, plus the one thing
no other tool records: funds raised from banks, private equity and
private lenders, with interest.

Decided with the founder (2026-08-13), before any code — the session
TODO.md required.

## The three screens

1. **Cash** (`/financial-management`) — actual money in (client
   collections + facility drawdowns) against actual money out (bills
   paid + repayments + interest paid), month by month. Honest caption:
   this is net of what the toolbox has recorded, not a bank balance —
   salaries and overheads paid outside Bills are invisible to it.
2. **Forward** (`/forward`) — expected collections from the CRM payment
   schedules against remaining expected spend from published business
   plans, and the funding gap. Expected spend has no dates, so it shows
   as a total, never a fake curve.
3. **Funding** (`/funding`) — the tool's own data. Each funding source
   is a **facility** (party, kind, rate, free-text terms — "mixed and
   different" per deal is the norm, so rate and cap are nullable);
   money events are **movements** against it: drawdown, repayment,
   interest paid.

## Decisions

1. **Read surface is views only — no table qual was widened.** 0058
   restates `crm_milestone_facts`, `crm_receipt_facts` and
   `business_plan_target_facts` with a three-way WHERE, and adds one
   new owner view, `bill_money_facts` (bills money without
   `payment_ref`/`rejection_note`/`note` — the column list is the
   boundary, 0056's mechanism). 0055's seven-widened-policies
   invariant is untouched. Budget tables are skipped entirely:
   `budget_report_lines` is security_invoker (reading it would force
   widening three quals and expose margin), and budget lines carry no
   dates anyway — `business_plan_target_facts.total_cost − actual_spend`
   is the remaining-expected-spend figure.
2. **Interest is computed monthly, informational only.** Simple accrual
   in the pure module `lib/financial-management/interest.ts`: for each
   completed month since the first drawdown, outstanding principal at
   month end × rate/1200. No day-count, non-compounding, one rate for
   all time; null rate → dash, never zero. Real interest paid is
   whatever movements were recorded; the screen shows computed vs paid
   and the gap may go negative (an irregular deal that pays more).
3. **Deletion is refused, not cascaded.** Movements are deletable
   (mistakes must be correctable; audit keeps the before-image); a
   facility with movements cannot be deleted (RESTRICT FK) — deactivate
   instead.
4. **The grant carries an amber warning** (`grantWarning` in
   `lib/tools.ts`), Reporter's treatment: this tool shows more money
   than anything else, including who lent the company what at what
   rate.
5. **Nothing is re-recorded.** Collections stay in Client Relations,
   bills in Bills, targets in Business Planning; this tool only reads
   their views and owns only `funding_facilities`/`funding_movements`.

## Build stages

- [x] 1. Migration 0058 (applied 2026-08-13) + types + shell: tabs,
      three placeholder pages, grant warning.
- [x] 2. Funding end to end: interest.ts + tests, facility/movement
      queries and actions, list + detail screens, dialogs.
- [ ] 3. Cash dashboard: cashflow.ts + tests, KPI band, in/out grouped
      bars, money-out stack.
- [ ] 4. Forward view: forwardCollections/fundingGap, screen.
- [ ] 5. Docs (CLAUDE.md contract row + money-exception paragraph,
      STATUS.md, TODO.md), probe grant matrix, founder sign-off,
      merge.

## Open items (confirm with the founder as they come up)

- Opening balance / true bank balance — later feature if it matters.
- Dated spend forecasting (budget-grain) — a real later feature.
- Partial bill payments — Bills has none; v1 accepts paid-in-full.
- Interest convention sanity-check against one real facility.
- Equity: "repayment" doubles as return of capital; dividends may need
  their own movement kind later.
