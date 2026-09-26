# Supervisors — the rules

A phone-first app for site supervisors: log the day's labour, see what material each work has drawn against the official estimate, see the released drawings, and request store issues. Grant `/supervisors`. Migration `0084`.

## What it is

- **Villa picker** — every supervisor sees every villa (founder, 2026-08-20; per-supervisor plots is a possible later feature, and it would also decide who sees which villa's drawings). The working anchor is the **plot**, like stock issues; the unit is found through the 1:1 when the estimate is needed.
- **Labour logs** — one row per plot + work + contractor + date, counted by trade (masons / helpers / others). Edited, not accumulated: a second entry for the same day edits the first. **Heads, never wages.**
- **Requests for issue** — plot, work, item and quantity in the item's unit; `requested → fulfilled / declined`. The supervisor edits or withdraws an open request; the store-keeper resolves it (`inventory/PLAN.md`); a resolved request is history. The form quick-picks from the official estimate's materials for the work, with the whole catalogue as fallback.
- **Drawings** — released revisions per work, through the shared `lib/drawings/` (`design-management/PLAN.md`).

## Settled decisions

- **`issue_requests` is Supervisors-owned; Inventory's fulfil/decline is a documented cross-tool write** (`SECURITY.md`). RLS admits both apps on SELECT and UPDATE, one policy per verb, and `issue_requests_guard()` holds the fine grain: identity permanent, content edits only while `requested` and only by `/supervisors`, transitions only by `/inventory`, `fulfilled` needs its issue id, `declined` needs a reason.
- **The materials view derives, never stores** — `groupSiteMaterials` (`lib/supervisors/site-materials.ts`, pure, tested) sets drawn quantities against `estimate_takeoff_facts` per work. It restates the house conversion rule (factor, matching labels 1:1, else raw and labelled) rather than importing the Estimator's `compare.ts` — one tool never imports another's code. Narrowing filters over that view must follow its schema (BUGCATCHER #16).
- **Contractors are vendors** with `is_contractor`; `labour_logs_contractor_only` refuses any other vendor id at the database.
- **No money anywhere** — `labour_logs` is `/supervisors` on every verb, and `estimate_takeoff_facts` admits `/supervisors` with no rate column, ever (pinned in the view manifest).
