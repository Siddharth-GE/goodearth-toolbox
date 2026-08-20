# Phase 2 — Supervisors and over-issue warnings

Approved by the founder 2026-08-20 (labour logs record per-trade counts; every supervisor sees every villa through a picker; overrun flags are derived, never stored). Phase 1 — the estimator-as-backbone rewiring, 0076–0083 — is live on production and recorded in STATUS.md; its plan is in git history.

**All built, all on staging, 2026-08-20** — Step G (PR #41), then G2 + H + I (PR #42), then **G3** (`0086`): the founder pulled the thread all the way — "we don't even need a materials tab, all materials are exactly the same as in the items master" — so mixes and work recipes hold master items directly, the rate is `items.indicative_price`, quantities speak each item's own unit, and the Materials tab is gone (see the Estimator's PLAN.md for the full shape; both databases were surveyed first — production had zero estimator rows). Then **G4** (`0087`): a work varies per villa — customising a line inside a draft copies the standard recipe onto it, whole; it stops following the standard until Reset. Awaiting the founder's staging vet; production then applies `0084`–`0087` in order, `db:compare` must come back empty, then `staging → master`.

## What Phase 2 delivers

A phone-first Supervisors app: log the day's labour per villa + work + contractor, see what material each work has drawn, request store issues. Plus a warning — flag, never refuse — when an issue takes a work past its official estimate.

## Founder decisions (2026-08-20)

1. **Labour log granularity**: counts split by trade — masons, helpers, others — one row per villa + work + contractor + date. Edited, not accumulated.
2. **No plot assignment**: every supervisor sees all villas through a picker. Assignment is a possible later feature, not built now.
3. **Overrun flags are derived live** from `lib/estimator/compare.ts`, not stored — the 0083 principle (nothing stored means nothing forgotten or stale). A resubmitted estimate that covers the material clears the warning by itself. This supersedes the old sketch's `estimate_overrun_flags` table.

## Design decisions

- **D1 Anchor on the plot**, like stock issues — the supervisor stands on a plot; the estimate is found through the unit's 0029 1:1 when needed. Requests carry `item_id` + qty in `items.default_uom` (how stock moves — the D5 rule from Phase 1).
- **D2 `issue_requests` is Supervisors-owned; Inventory's fulfil/decline is the fifth documented cross-tool write exception** (STATUS.md list). RLS admits both apps; a guard trigger holds the fine grain: identity fields permanent, content edits only while `requested` and only by `/supervisors`, transitions `requested → fulfilled` (needs `fulfilled_issue_id`) or `requested → declined` (needs a reason) only by `/inventory`, resolved rows immutable.
- **D3 No money anywhere in `/supervisors`.** Labour logs are headcounts, not wages; requests are quantities; `estimate_takeoff_facts` (which gains `/supervisors` in its WHERE) carries no rate column, ever.
- **D4 Reads that already exist stay open reads**: `stock_issues(_lines)` and `goods_receipts(_lines)` SELECT is `using (true)` since 0023 — quantities only — so the per-work materials view needs no policy changes, only a contract row in STATUS.md.
- **D5 (revised in build): the warning lives on the issue note, not in the action's return.** `recordStockIssue` redirects to the note on success, so a returned warning would never render; instead the note derives the over-state fresh every render (`getOverIssueRows` + pure `lib/inventory/over-issue.ts`) — the keeper sees it the moment the redirect lands, later readers see the same truth, and ActionState stays untouched.
- **D6 (added in build, founder): the items master is the one material list.** `estimator_materials` survives only as the rate card the open master cannot carry (rate = gated money; estimating unit + factor); since `0085` a new material starts from a picked item and a linked one can never unlink. Pre-0085 unlinked rows stay editable until linked.

## Step G — the Supervisors app (0084)

**Migration `0084_supervisors.sql`:** `/supervisors` added to both `*_apps_app_known` CHECKs (full list restated, 0074 shape). `labour_logs` (plot, work, contractor, log_date, masons/helpers/others ≥ 0 with sum > 0, note; `unique(plot_id, work_item_id, contractor_id, log_date)`; trigger refuses a vendor not flagged `is_contractor`; RLS all four verbs `/supervisors`). `issue_requests` (plot, work, item, quantity > 0, note, status `requested/fulfilled/declined` + shape CHECKs, `fulfilled_issue_id → stock_issues`, `declined_reason`; guard trigger per D2; SELECT/UPDATE admit `/supervisors` + `/inventory`, INSERT `/supervisors` only, DELETE `/supervisors` while `requested`). `estimate_takeoff_facts` redefined with `/supervisors` in the WHERE — same columns, revokes re-issued, manifest row updated in the same commit. Audit + `set_updated_at` on both tables. Assertions throughout.

**Code:** `lib/tools.ts` entry (Operations, HardHat). `lib/supervisors/queries.ts` + `actions.ts` (every function opens with `requireTool("/supervisors")`). Screens: welcome (workers this week, open requests, villas — no rupees), villa picker, villa detail (per-work materials vs the official estimate's figure, labour log list + form, request list + form). Catalogue route allow-list gains `/supervisors`. `loading.tsx` everywhere.

**Docs:** STATUS.md tool row (Staging) + contract row. New `app/(dashboard)/supervisors/PLAN.md`.

**Verify:** migration on staging before code; probe (holding only `/inventory`) sees requests but not labour logs and cannot insert; a `/supervisors`-only account cannot touch inventory tables; open every page (BUGCATCHER #2); `db:check-views` green with the manifest change.

## Step H — the store-keeper's queue (no migration)

Inventory gains a Requests screen: open requests, **Fulfil** pre-fills the issue form (villa, work, item, qty — store stays the keeper's choice) and stamps `fulfilled_issue_id` after the issue saves; **Decline** requires a reason the supervisor sees. STATUS.md exception list gains the D2 entry. Request badge on the Inventory welcome.

## Step I — over-issue warnings (no migration)

`recordStockIssue` saves, then reads `estimate_takeoff_facts` + prior issues/receipts for the plot, runs `compareIssuesToEstimate`, and returns success-with-warning naming the work and figures when a row tips `over`. Estimator welcome shows overrun counts on official estimates (derived, submitter-facing); the comparison tab already paints the rows.

## Cross-cutting (every step)

1. `npm run db:apply -- --project ipstebqawrvhkyntctrv --commit` → `npm run db:types:staging` → types committed with the migration.
2. `npm test` · `npm run build` · `npm run check:actions` · `npm run db:check-views -- --project ipstebqawrvhkyntctrv`.
3. Open every page with a new select string. Probe smoke per step.
4. Each step lands on staging for the founder's vet — the hard gate — before any production apply; 0084 goes to production only after that vet, then `db:compare` must come back empty.
5. Founder communication per CLAUDE.md before and after each step.

**Prerequisite data task (Masters, not code):** construction raw materials entered as `kind='material'` items and linked on the Estimator's Materials screen — comparisons and warnings only bite for linked materials.
