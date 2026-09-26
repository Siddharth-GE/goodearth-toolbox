# Financial Management — the rules

The company's money picture in three screens, plus the one thing no other tool records: **funds raised** from banks, private equity and lenders, with interest. Grant `/financial-management` (carries an amber `grantWarning` — it shows who lent the company what, at what rate). Migration `0058`.

## The three screens

1. **Cash** — actual money in (collections + drawdowns) against actual out (bills paid + repayments + interest paid), month by month. The screen says so: **net of what the toolbox has recorded, not a bank balance**.
2. **Forward** — expected collections from the CRM schedules against remaining expected spend from published business plans, and the funding gap net of undrawn headroom. **Expected spend has no dates, so it is a total, never a fake curve.**
3. **Funding** — its own data: **facilities** (party, kind, rate, free-text terms; rate and cap nullable because every deal differs) and **movements** against them (drawdown, repayment, interest paid).

## The decisions

1. **It reads views only — no table qual was widened.** `0058` restates `crm_milestone_facts`, `crm_receipt_facts` and `business_plan_target_facts` with a **three-way `WHERE`** and adds `bill_money_facts` (bill money without its notes — the column list is the boundary), and asserts exactly four views admit this tool. **Anyone redefining those three views must carry the three-way `WHERE` forward** — re-running `0056`/`0057` silently strips this tool.
2. **Budget tables are skipped** — `budget_report_lines` would force widening quals and expose margin, and carries no dates. Remaining spend is `business_plan_target_facts.total_cost − actual_spend`.
3. **Interest is monthly simple accrual, informational only** (`lib/financial-management/interest.ts`, pure): outstanding principal at month end × rate/1200 — no day-count, no compounding, one rate; a null rate is a dash, never zero. Real interest paid is what movements record; the screen shows computed against paid.
4. **Movements are deletable** (the audit keeps the before-image); a facility with movements is deactivated, not deleted.
5. **Nothing is re-recorded** — collections stay in Client Relations, bills in Bills, targets in Business Planning. It owns only `funding_facilities` and `funding_movements`.

## Things that will bite

- **Fully leaf — nothing reads it — but it depends on four tools' data**, each degrading to zero rather than breaking.
- **It charts through `components/ui/chart/*`** against the types in `lib/charts/series.ts`; nothing here imports Reporter, and nothing may.
- **Welcome counts are rupee-free.**

## Open — confirm with the founder as they come up

An opening balance for a true bank figure; dated spend forecasting; partial bill payments (Bills has none); checking the interest convention against one real facility's statement before trusting the accrued column; whether equity returns need their own movement kind.
