# Supervisors — plan and settled decisions

Phase 2 of the estimator-as-backbone rewiring (approved 2026-08-20; the
running plan is `plan.md` at the repo root while the build is in
flight). A phone-first app for site supervisors: log the day's labour,
see what material each work has drawn, request store issues.

## What it is

- **Villa picker** — every supervisor sees every villa (founder,
  2026-08-20: no plot assignment; that is a possible later feature, not
  a missing one). Villas are units; the working anchor is the PLOT,
  like stock issues — the unit is found through the 0029 1:1 when the
  estimate is needed.
- **Labour logs** — one row per plot + work + contractor + date,
  counted by trade (masons / helpers / others — founder's pick over a
  single headcount). Edited, not accumulated: the unique key turns a
  second entry for the same day into "edit the existing one". Heads,
  never wages — nothing in this tool prices labour.
- **Requests for issue** — plot, work, item, quantity in the item's
  unit (how stock moves, the 0076 D5 rule), status `requested →
fulfilled / declined`. The supervisor may edit or withdraw an OPEN
  request; the store-keeper (Inventory, Step H) resolves it, and a
  resolved request is immutable history. The request form quick-picks
  from the official estimate's materials for the chosen work, with the
  whole catalogue as fallback.

## Settled decisions

- **`issue_requests` is Supervisors-owned; Inventory's fulfil/decline
  is a documented cross-tool write exception** (STATUS.md list, with
  Step H). RLS admits both apps on SELECT and UPDATE — one policy per
  verb — and `issue_requests_guard()` holds the fine grain: identity
  permanent, content edits only while `requested` and only by
  `/supervisors`, transitions only by `/inventory`, `fulfilled` needs
  its issue id, `declined` needs a reason.
- **The materials view derives, never stores** — `groupSiteMaterials`
  (`lib/supervisors/site-materials.ts`, pure, tested) lines drawn
  quantities up against `estimate_takeoff_facts` per work. It restates
  the house conversion rule verbatim (factor ÷, matching labels 1:1,
  otherwise raw-and-labelled) because pure modules import nothing; the
  Estimator's `compare.ts` is the sibling, not an import — one tool
  never imports another tool's code.
- **Contractors are vendors** with `is_contractor` (0073). The picker
  filters to active contractors; a DB trigger
  (`labour_logs_contractor_only`) refuses any other vendor id, so the
  API cannot sneak one past the form.
- **No money, SELECT included, on labour** — `labour_logs` is
  `/supervisors` on every verb. `estimate_takeoff_facts` gained
  `/supervisors` in its WHERE (0084) and still carries no rate column,
  ever; the view manifest pins that.

## Open

- Step H (store-keeper's queue in Inventory) and Step I (over-issue
  warnings on `recordStockIssue`) — see `plan.md`.
- Plot assignment per supervisor — only if the founder asks.
