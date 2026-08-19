# The estimator becomes the construction backbone

## Context

The Estimator (/estimator, live on staging) has changed how the founder sees the operations chain. The insight: construction materials are bought in bulk, so indents and POs cannot tie consumption to a villa — **store issues can**. The chain is rewired:

- The Estimator **is** the construction line now. `construction_budgets`/`construction_budget_lines` retire as the indent source; indents come from an interiors budget line or from a villa's official estimate.
- POs become raisable **without** an indent (bulk/urgent buys aren't plot-specific).
- Store issues gain the missing dimension: **which work** (works masters, 0073) the material served, on which villa. Stage = the work's category — one vocabulary end to end.
- Phase 2 (sketched, not built now): a Supervisors app (labour logs, request-for-issue per work) and over-issue warnings back to the estimate's submitter — flag, never refuse.

## Founder decisions (2026-08-19, via AskUserQuestion)

1. **Backbone first** — estimator→indents, indent-free POs, issues recording works, estimate Submit, materials link. Supervisors + warnings are Phase 2.
2. **Materials bridge**: construction raw materials enter the shared `items` catalogue (the `kind='material'` band already exists in 0004 — no new schema); each `estimator_materials` row gets an optional `item_id` link. Procurement keeps speaking `items`.
3. **Submit makes an estimate official**: quantities frozen, submitter recorded, one official per villa, revisions supersede (like Selections). Drafts stay editable alongside.
4. **One vocabulary**: works masters (category → group → work item) adopted by indents and issues. `construction_stages` stays only where it already is.

## Design decisions (each with its why)

- **D1 Submit lifecycle**: `estimator_estimates.status in ('draft','submitted','superseded')`, one official per unit via partial unique index, **submit-time snapshot written by the app**. The snapshot solves three problems at once: TODO's "locked estimates frozen at today's rates", the arithmetic-is-TypeScript-only problem (SQL never re-implements `expandRecipe`), and the cross-tool read problem (a money-free view over the snapshot).
- **D2 Reference** `EST/<code>/NNN` minted at **submit** inside a `submit_estimate()` RPC (the `create_indent` mint-in-SQL house shape). Drafts stay unnumbered working documents.
- **D3 Estimator→indent anchor** = `indent_lines.estimate_id` (+ the line's existing `item_id`); `unique(indent_id, estimate_id, item_id)` dedupes; a new **named** CHECK makes the three anchors mutually exclusive without touching 0019's two unnamed CHECKs (never dropped — additive only).
- **D4 Issue work anchor on the header**: `stock_issues.work_item_id`. One physical issue serves one work (exactly the shape Phase 2's request-per-work needs); phone UI stays one picker; stage derived from `work_items.category_id`, never stored.
- **D5 UOM**: procurement lines always move in `items.default_uom` (8-value CHECK untouched — the stock views sum quantities, so an item must move in ONE unit). `estimator_materials.item_uom_factor` converts (1 material-uom = factor × item-uom); equal uoms ⇒ implicit factor 1; no factor ⇒ estimate qty shown as reference, operator types the procurement qty.
- **D6 Takeoff snapshot per (work, material)** — Phase 2's "issues for unit+work exceed estimate" is impossible without per-work rows; the per-material aggregate is derivable, the detail is not.
- **D7 Indent-free POs**: drop NOT NULL on `purchase_order_lines.indent_line_id`; null-anchor early return in `po_lines_qty_guard()`. A direct line has **no quantity ceiling** — that is the point of a bulk buy; the priced-before-issue gate and receipt guard still apply.
- **D8 Retirement is UI-only, never schema.** Construction budget tables, `indent_lines.construction_line_id`, its FK, and all rows stay forever as history.

## Phase 1 — six shippable steps

Each = its own `feature/…` branch off `staging`, PR into `staging`, migration applied to staging **before** the code lands. A→C ordered; D and E independent; F last, only after C has soaked and the founder has pulled from a real estimate once. Production applies (0076–0080 in order) after the soak; `db:compare` empty before `staging → master`.

### Step A — Link estimator materials to the catalogue (0076)

**Migration `0076_estimator_material_items.sql`:**

- `estimator_materials` + `item_id uuid references items(id)` (nullable) and `item_uom_factor numeric check (item_uom_factor is null or item_uom_factor > 0)`; column comment stating the factor's meaning.
- `create unique index estimator_materials_item_key on (item_id) where item_id is not null` (two materials on one item would double-count comparisons).
- Named check `estimator_materials_factor_needs_item` (factor requires item). No new policies/views/functions → no revokes. End with assertions.

**Code:**

- [lib/estimator/queries.ts](lib/estimator/queries.ts) `listMaterials()` gains `item_id, item_uom_factor` + linked item's `name, code, default_uom` (single FK path, no named embed needed).
- [lib/estimator/actions.ts](lib/estimator/actions.ts) material create/update accept the link + factor; friendly 23505 message.
- Materials screen: "Catalogue item" field via `components/masters/catalogue-picker.tsx`; conversion row shown only when uoms differ ("1 cum of Sand = ___ cft"); linked/unlinked chip on the list (unlinked materials block estimate pulls later — make them visible now).
- [app/api/catalogue/route.ts](app/api/catalogue/route.ts) — add `/estimator` to the allow-list (confirmed absent) or the picker 403s.
- New pure `lib/estimator/link.ts` + test: `convertToItemUom(qty, materialUom, itemUom, factor) → { qty } | { needsFactor: true }`.

**Docs:** Estimator PLAN.md (decision 1 amended), STATUS.md Estimator contract row adds `items`, TODO.md notes the Masters data task (enter construction materials as `kind='material'` items and link them).

**Verify:** link/unlink flows on preview; probe (/inventory only) still can't reach /estimator; `npm test`, `db:check-views` stays green, `db:types:staging` committed with the migration.

### Step B — Submit: the official estimate (0077)

**Migration `0077_estimate_submit.sql`:**

- `estimator_estimates` gains `status` (named CHECK, default `'draft'`), `est_no int`, `reference text` (unique), `submitted_by → profiles`, `submitted_at`, `superseded_at`; `unique(project_id, est_no)`; named check `estimator_estimates_template_never_submits` (`not is_template or status='draft'`); **one official per villa**: `unique index … on (unit_id) where status='submitted'`.
- `est_counters(project_id pk, last_no)` — RLS + `/estimator` policies; no id → no audit trigger (0019 §4 rule).
- Snapshot tables (RLS + standard 4 `/estimator` policies + audit/set_updated_at each):
  - `estimator_estimate_takeoff(estimate_id, work_item_id, material_id, material_name, uom, quantity>0, rate nullable, …)`, `unique(estimate_id, work_item_id, material_id)`.
  - `estimator_estimate_line_costs(estimate_id, line_id unique → estimator_estimate_lines, work_item_id, qty, uom nullable, labour_rate/labour_cost/material_cost/total_cost all nullable — null-not-zero carried into the freeze)`.
- Freeze triggers: `estimator_snapshot_frozen()` on both snapshot tables + `estimator_estimate_lines_draft_only()` on lines (parent must be `'draft'`; the `indent_lines_draft_only` shape).
- Header guard `estimator_estimates_guard()`: permanence of identity/mint fields; transitions draft→submitted (unit-bound, all mint fields set), submitted→superseded only; submitted rows otherwise immutable.
- Delete policy narrowed to `status='draft'` (recreate the existing delete policy in place — not a second SELECT policy).
- `submit_estimate(p_estimate_id) returns text` — security **invoker**: validates draft/non-template/has lines/**snapshot rows exist** (the app writes them first; SQL never re-derives arithmetic), supersedes the previous official, mints from `est_counters`, stamps submit fields, returns the reference. `revoke execute from public, anon`.

**Code:**

- `lib/estimator/reference.ts` + test (mirror of `lib/indents/reference.ts`).
- [lib/estimator/actions.ts](lib/estimator/actions.ts): `submitEstimate` — compute per-work takeoff via a new pure `computeWorkTakeoff` helper in [lib/estimator/calc.ts](lib/estimator/calc.ts) (+ tests), delete stale snapshot rows, batch-insert both snapshots, then `rpc("submit_estimate")`; on RPC failure delete snapshots (the `copyTemplateToUnit` accepted-trade pattern). `reviseEstimate` copies a submitted estimate's lines to a new draft (`source_estimate_id` back-pointer). `deleteEstimate` deletes snapshots → lines → header.
- [lib/estimator/queries.ts](lib/estimator/queries.ts): `getEstimate` branches — draft = live calc (unchanged); submitted/superseded = map `estimator_estimate_line_costs` into the same `groupLineCosts`. List/welcome gain status/reference/official badge.
- Estimate screen: Submit button (draft + unit-bound only) with confirm naming what freezes; submitted view shows reference + "submitted by X on date", edits hidden, Revise button; superseded banner naming the successor.

**Docs:** Estimator PLAN.md ("costs live **while draft**"; one official per villa), TODO.md strikes "locked estimates" + "reference numbers", STATUS.md Estimator tool row updated.

**Verify:** submit → reference appears, frozen numbers hold when a rate changes (sibling draft's numbers move); second submit supersedes the first; delete refused on submitted; probe sees nothing.

### Step C — Indents pull from the official estimate (0078)

**Migration `0078_estimate_indent_anchor.sql`:**

- View `estimate_takeoff_facts` (security_barrier): frozen takeoff (estimate ref/unit/work/material_name/uom/quantity) + live `m.item_id, m.item_uom_factor`, `where e.status='submitted' and (has_app('/estimator') or has_app('/indents') or has_app('/inventory'))`. **No rate column, ever.** Same-migration revokes (insert/update/delete/truncate from anon, authenticated).
- Anchor C: `indent_lines.estimate_id uuid references estimator_estimates(id)`; named check `indent_lines_one_anchor` (estimate anchor excludes the other two — 0019's unnamed checks untouched); `unique index (indent_id, estimate_id, item_id) where estimate_id is not null`; partial index on `estimate_id`.
- `indents.work_item_id uuid references work_items(id)` + partial index. `indents.stage` and its 0053 FK untouched.

**Code:**

- [scripts/view-manifest.ts](scripts/view-manifest.ts) — fifteenth row: exact columns, guards `["/estimator","/indents","/inventory"]`, barrier true, money false, with the why-sentence. `db:check-views` fails the PR without it — the reviewable moment.
- [lib/indents/pull-rules.ts](lib/indents/pull-rules.ts) + tests: pure `classifyEstimatePull(row) → { state: 'ready'|'needs_qty'|'unlinked'; prefillQty? }` (conversion rule duplicated verbatim — pure modules import nothing).
- [lib/indents/queries.ts](lib/indents/queries.ts): `getEstimatePull(unitId, indentId)` — read the view, aggregate per material across works, join `items`, annotate `already_requested` from existing `estimate_id`+`item_id` lines (fetchAll — the double-buy rule). Source discriminator at ~:446 gains `estimate_id != null → "estimate"`.
- [lib/indents/actions.ts](lib/indents/actions.ts): `addEstimatePullLines` — re-read the view server-side, insert with `item_id`, qty in `items.default_uom`, `estimate_id`; refuse unlinked materials ("Link <material> to a catalogue item in the Estimator first").
- New screen `app/(dashboard)/indents/[indentId]/pull-estimate/page.tsx` (+ loading.tsx): grouped by work category, estimate figure shown ("12 cum ≈ 424 cft"), prefilled/blank/disabled per the classifier. Indent detail offers "Pull from the villa's estimate" when an official estimate exists; construction pull stays alongside until Step F. Indent header gains a "Work" picker writing `indents.work_item_id`.

**Docs:** STATUS.md — Indents row adds `estimate_takeoff_facts`; Estimator row **replaces "Nothing reads Estimator"**. Indents PLAN.md documents Anchor C.

**Verify:** pull cement (linked, same uom), pull a cum/cft material (factor prefill), unlinked refused, double-pull deduped, approve → PO unchanged. **Probe check (critical):** probe can select `estimate_takeoff_facts` rows but zero rows from `estimator_estimate_takeoff` itself, and no rate visible anywhere. `db:check-views` green only with the manifest row in the same commit.

### Step D — POs without an indent (0079) — independent of A–C

**Migration `0079_po_direct_lines.sql`:** drop NOT NULL on `purchase_order_lines.indent_line_id`; `create or replace` `po_lines_qty_guard()` with `if new.indent_line_id is null then return new; end if;` at the top (rest character-for-character 0021 §7); assertions + dated comment recording the founder's reversal of the 0021 decision.

**Code:**

- [lib/purchase-orders/queries.ts](lib/purchase-orders/queries.ts) `PoLineRow.indent_line_id`/`indent_reference` → nullable (~:186-187, mapping ~:292).
- [lib/purchase-orders/po-document.tsx](lib/purchase-orders/po-document.tsx) ~:103 — Indent column renders "Direct" when null.
- [lib/purchase-orders/actions.ts](lib/purchase-orders/actions.ts) `addDirectPoLines` (draft-only, uom from `items.default_uom` server-side, merge same-item — the `addDirectLines` pattern from [lib/indents/actions.ts](lib/indents/actions.ts)).
- PO detail: "Add items directly" beside the indent pool, via the catalogue picker; [app/api/catalogue/route.ts](app/api/catalogue/route.ts) adds `/purchase-orders` (confirmed absent).
- Copy updates: purchase-orders/page.tsx:16,21, list/page.tsx:53,76, new/page.tsx:14, [poId]/page.tsx:81 — "…or directly for bulk and urgent buys".
- `po_line_facts`, manifest, receipts, bills, getDownstreamImpact, ordered-sums: all unchanged (verified they tolerate null anchors).

**Docs:** STATUS.md:112 settled decision rewritten (direct lines allowed, no indent ceiling, issue/receipt gates still apply); PO PLAN.md documents the deliberate no-ceiling.

**Verify:** GEN-scope PO with only direct lines → issue (rates still required) → **receive it in Inventory on the open page** → PDF prints "Direct". Mixed PO renders both.

### Step E — Issues record the work (0080) — independent of A–D; comparison tab needs B

**Migration `0080_issue_work.sql`:**

- `stock_issues.work_item_id uuid references work_items(id)` + partial index. **Not** added to `stock_issues_guard()`'s permanence tuple — retagging a mis-picked work is a label fix; `audit_row()` records it.
- Backstop `stock_issues_plot_needs_work check (to_store_id is not null or work_item_id is not null) NOT VALID` — new plot issues need a work; history excused; transfers never need one.
- New 7-arg `create_stock_issue(…, p_work_item_id, …)` (raises "Say which work this material is for" for plot issues without one; inactive work refused); old 6-arg signature recreated as a delegating wrapper (deploy-window safety); revoke/grant on **both** signatures from public, anon (the 0071 lesson).

**Code:**

- [lib/inventory/actions.ts](lib/inventory/actions.ts): `RecordIssueInput.workItemId`, 7-arg RPC call, new small `retagIssueWork` action.
- Issue form (`app/(dashboard)/inventory/issues/new/_components/issue-form.tsx`): required "What work is this for?" picker when destination = plot (works tree via `lib/masters/works.ts` — reads open; category optgroups, phone-first single select). List/detail show work + category (open the page to verify the category join — BUGCATCHER #2).
- **Estimate-vs-issued tab** (Estimator-owned, needs Step B): pure `lib/estimator/compare.ts` + tests — per work+material: estimated qty vs issued qty (÷ factor; `unitsDiffer` when no factor). New tab on the official estimate reading its own snapshot + `stock_issues(_lines)` (open reads — no view needed in this direction); plot via the unit's 0029 1:1.
- Optional: Reporter dataset "Material issued by villa and work" in [lib/reporter/datasets.ts](lib/reporter/datasets.ts).

**Docs:** STATUS.md — Estimator row adds `stock_issues(_lines)`; Inventory tool row notes work tagging; Inventory PLAN.md documents header-level anchor, retag allowance, NOT VALID excuse.

**Verify (as the probe, which holds exactly /inventory):** plot issue demands a work; transfer doesn't; old issues render; negative-stock guard still fires; raw PostgREST insert without work on a plot issue refused by the CHECK (run the query); comparison tab moves after an issue.

### Step F — Retire the construction pull (no migration)

- Indent screens: construction pull link removed; `pull/` becomes a pointer ("Construction requests now pull from the villa's official estimate" / "No official estimate yet — submit one in the Estimator"). Interiors pull + direct lines unchanged.
- Delete `getConstructionPull` + `addConstructionPullLines` (+ their tests); the `"construction"` source label **stays** for historic lines.
- Budgets construction screens stay with one line of copy ("This plan no longer feeds Indents…"); their eventual retirement is a founder question in TODO.md.
- **Never dropped:** `construction_budgets(_lines)`, `indent_lines.construction_line_id`, FKs, 0019 checks, 0053 stage FK.
- Docs: STATUS.md Indents contract row drops `construction_budgets(_lines)`; Indents + Budgets PLAN.md record the decision and date.
- Verify: an old construction-anchored indent still renders; `git grep getConstructionPull` empty.

## Phase 2 — sketches only (not built now)

- **Supervisors app** (`/supervisors`, phone-first): labour logs per plot+work+contractor (`vendors.is_contractor` from 0073), sees per-work issued materials, "Request an issue" (`issue_requests`: plot, work, item, qty, status requested→fulfilled/declined, `fulfilled_issue_id`) feeding the store-keeper's queue and pre-filling the Step E issue form. Needs: new grant in both `*_apps_app_known` CHECKs, tools.ts registration, its slug added to `estimate_takeoff_facts`' WHERE + manifest row, catalogue-route entry if it picks items.
- **Over-issue warnings**: flag, never refuse. `recordStockIssue` completes the write, returns success-with-warning when cumulative issues for plot+work exceed the official takeoff (arithmetic = Phase 1's `compare.ts`), records an `estimate_overrun_flags` row surfaced on the Estimator welcome + comparison tab to `submitted_by` (recorded since Step B).

## Cross-cutting checklist (every step)

1. `npm run db:apply -- --project ipstebqawrvhkyntctrv --commit` → `npm run db:types:staging` → types committed **with** the migration (PR red until then via `db:check`).
2. `npm test` · `npm run build` · `npm run check:actions` · `npm run db:check-views -- --project ipstebqawrvhkyntctrv`.
3. **Open the page** for every new select string with an embed (BUGCATCHER #2/#4).
4. Probe smoke per step; one real write-button after each staging merge.
5. Founder communication per CLAUDE.md: 3–5 plain bullets before each step, 2-sentence summary + "open this page, try this" checklist after.

## Key reference files

- `supabase/migrations/0074_estimator.sql` — policy-loop shape for new estimator objects
- `supabase/migrations/0019_indents.sql` — anchors, counters, mint, guard patterns reused by 0077–0079
- `lib/estimator/calc.ts` — the single arithmetic implementation; snapshot writer and compare.ts reuse, never duplicate
- `lib/indents/actions.ts` — templates for `addEstimatePullLines` / `addDirectPoLines`
- `scripts/view-manifest.ts` — gains the `estimate_takeoff_facts` row
