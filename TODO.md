# TODO — Phases 7 & 8: Inventory, then Bills

The complete build plan for the next two phases, written so an agent
with **no context beyond this repo** can pick it up. Read `STATUS.md`
first (what's shipped, settled decisions, session log), `CLAUDE.md`
for the architecture rules, `DESIGN.md` before styling anything. Every
decision below was approved by the founder on 2026-08-03 as part of the
Phases 6–8 plan; Phase 6 (Purchase Orders) shipped the same day and is
the freshest reference implementation for nearly everything here.

**Work items move out of this file and into STATUS.md as they ship.**

## How every phase runs (the established rhythm)

1. One phase = one branch (`feature/inventory`, `feature/bills`). Merge
   to `master` only after the founder browser-tests each milestone gate
   on the Vercel preview and signs off. Delete the branch after merge.
2. **Migrations are applied by the founder in Supabase Studio** (SQL
   editor, numbered order) — there is no CLI path from the dev machine.
   The loop that works: write the migration early → build everything
   that doesn't reference new schema names → hand the founder one
   "run this file in Studio" step → they confirm (they respond within
   minutes mid-session) → `npm run db:types` → the schema-dependent
   code now typechecks. Commit regenerated types with the migration.
3. Verification before every push: `npm run typecheck`, `npm run build`,
   `npm test`, `npm run check:actions`, prettier. Before merging:
   a local Playwright smoke (install in the session scratchpad,
   `npm run build && npm start`, drive localhost:3000 as the probe
   user). After any production deploy that changes server actions:
   press one real write-button on production (the outage habit).
4. After each working piece: commit with a plain-English message. At
   session end: update the tool's `PLAN.md`, `STATUS.md`'s log, and
   prune this file.
5. Communication: the founder is not a developer. Explain in plain
   language, give an "open this page, try this action" checklist at
   every gate, ask before anything not in this plan.

## Decisions already made (do not re-litigate, do not re-ask)

- **Inventory is quantities only — no money anywhere in its schema.**
  Money lives on the PO and the Bill; valuation is the accountant's.
- **Goods are received into a store OR directly at the plot/site** the
  PO belongs to — chosen per receipt. Direct-to-site receipts count
  toward PO fulfilment and appear in history tagged to the plot, but
  never enter store stock (consumed where they landed).
- **Stock is always computed from movements** (receipts − issues ±
  adjustments), never a hand-edited balance.
- **Bills record + payment tracking**: recorded → approved → paid, with
  an unpaid-bills view. Over-billing against a PO/contract **warns,
  never blocks** (real invoices legitimately differ; a human decides).
- **Labour contracts** are a small Masters-managed table; a bill
  references a PO **or** a labour contract, exactly one.
- **Attribution everywhere**: every line grid / document banner shows
  the acting user's avatar, name on hover — reuse
  `components/ui/attribution.tsx` + stamp `updated_by`, exactly as the
  PO and Indent screens do today.
- Anchoring and money-visibility rules for PO consumers are in
  CLAUDE.md ("For tools consuming Purchase Orders") — anchor on
  `purchase_order_lines.id`; money-free reads via `po_facts` /
  `po_line_facts` (migration `0022`, already applied).

---

## Phase 7 — Inventory (`/inventory`) — NEXT

The store-keeper's tool: record what arrives against POs, know what's
in each store, record what goes out. Branch `feature/inventory`.
Migration **`0023`**. Reference implementations: `lib/purchase-orders/*`
and `lib/indents/*` for every pattern named below.

### Kickoff questions for the founder (the only open ones)

- The real list of stores (Masters → Stores may need rows/cleanup).
- Do manufacturing issues need a destination finer than
  "manufacturing"? (Working assumption: no — one bucket.)
- GRN/issue numbering format confirmation (working assumption:
  `GRN/<project code>/NNN` and `ISS/<project code>/NNN`, per-project
  counters, the indent-numbering pattern).

### Migration 0023 — schema outline

All re-runnable (if-not-exists / create-or-replace / drop-if-exists —
the 0016 convention, followed by 0019/0021). `/inventory` is **already
in the `user_apps_app_known` CHECK** (0017 pre-listed it) — no
constraint change needed.

- **`goods_receipts`** — project_id (not null), po_id (not null FK →
  purchase_orders; receipts are always against a PO), destination:
  `store_id` FK **or** direct-to-site flag/plot columns copied from the
  PO — exactly-one CHECK; `grn_no int` + `reference text` (minted in
  `create_goods_receipt()` via a `grn_counters (project_id, last_no)`
  upsert-with-row-lock — copy `create_purchase_order()` 0021 §9);
  `challan_no text` (vendor's delivery paper), `received_at date`,
  `note`, actor stamps (`created_by`, `updated_by`), timestamps.
- **`goods_receipt_lines`** — receipt_id (NO cascade — the 0019 §5
  lesson: cascaded child deletes misfire guards), `po_line_id` (not
  null FK → purchase_order_lines, the provenance anchor), own
  `item_id`, `quantity > 0`, `uom` (same CHECK list as everywhere),
  `note`, stamps.
- **Over-receipt guard** (`grn_lines_qty_guard`): before insert/update,
  serialise on `pg_advisory_xact_lock(hashtextextended(po_line_id::text, 0))`
  — an advisory lock, NOT `FOR UPDATE` on the PO line (a row lock needs
  UPDATE rights under the PO tables' RLS, which an inventory user
  doesn't hold; this exact reasoning is documented in 0021 §7) — then
  sum received across all receipts for that po_line and refuse beyond
  the PO line's quantity. **Reads of purchase_order_lines inside the
  trigger run as invoker and are RLS-gated** — read the needed
  quantity via `po_line_facts` (open to authenticated) instead.
- **PO auto-completion**: an AFTER trigger on goods_receipt_lines — when
  every line of the PO is fully received, update the PO to `completed`.
  This requires **replacing `purchase_orders_guard()`** (create or
  replace in 0023 — a new migration may replace a function, never edit
  an applied file) to admit `issued → completed`, and to **refuse
  `deletion_requested → cancelled` when any receipt exists** against
  the PO's lines (the check 0021 §8 left a comment for). The guard
  update runs as the receiving user, so the `purchase_orders` UPDATE
  RLS policy needs widening to `has_app('/purchase-orders') or
has_app('/inventory')` — or, cleaner, make the completion trigger
  function `security definer` (owned by postgres) so no policy changes;
  choose at build time and document why in the migration.
- **`stock_issues`** + **`stock_issue_lines`** — issuing `store_id`
  (not null), destination: project_id/unit_id or `to_manufacturing
boolean` (exactly-one CHECK), `ISS/<code>/NNN` mint via
  `iss_counters`, own item/qty/uom per line, stamps. **Negative-stock
  guard**: advisory lock keyed on (store_id, item_id) —
  `hashtextextended(store_id::text || item_id::text, 0)` — then compute
  on-hand from movements and refuse an issue that would go below zero.
- **`stock_adjustments`** — store_id, item_id, `quantity numeric`
  (signed — positive adds, negative removes), **`reason text` with a
  non-empty CHECK** (mandatory), stamps. Opening stock is a positive
  adjustment. Same negative-stock advisory-lock guard on negative
  adjustments.
- **`stock_on_hand` view** — sum per (store_id, item_id) of: receipt
  lines into stores (join goods_receipts where store_id is not null),
  minus issue lines, plus adjustments. Plain view, readable by
  authenticated — no money exists anywhere in these tables.
- **Audit + updated_at triggers** on all five new tables (`audit_row()`
  per 0019 §10 — every table has `id`, so it applies cleanly).
- **RLS**: reads open to authenticated (no money — the Indents
  precedent, stated in 0019 §12); writes `has_app('/inventory')`.
  Counters: the po_counters pattern (0021 §3).

### Pure modules (tested, import-free — the lib/budgets/math.ts shape)

- `lib/inventory/reference.ts` — GRN/ISS reference mints mirroring the
  SQL (`lpad`/`greatest` — lpad TRUNCATES past its target, the pinned
  0019 §7 lesson; copy `lib/purchase-orders/reference.ts` + tests).
- `lib/inventory/stock.ts` — movement→balance arithmetic: signed
  quantities, per-store-per-item aggregation, "would this issue go
  negative" — with tests.

### Data layer & screens

- `lib/inventory/queries.ts` (`server-only`) + `actions.ts` (file-level
  `"use server"`, **never `export type {...}`** — the 2026-08-03 outage
  rule, enforced by CI's `check:actions`). Every function opens
  `requireTool("/inventory")` — except any Overview count query, which
  is deliberately ungated (the `countIndentsPipeline` /
  `countPosPipeline` precedent, comments explain why). Reads cross-tool
  tables directly, never another tool's gated queries module. `fetchAll`
  for completeness-critical reads (build the query INSIDE the callback —
  fetchAll pages by calling it repeatedly, a reused builder stacks
  clauses); stated-limit + exact count for lists; never count from
  `rows.length`.
- `app/(dashboard)/inventory/` — replace the ComingSoon stub, flip
  `built: true` in `lib/tools.ts`, `loading.tsx` everywhere:
  - **Receive** flow: pick an issued PO (list gated to
    status='issued'), see lines with ordered / received / remaining
    (the pool-screen pattern —
    `app/(dashboard)/purchase-orders/[poId]/pull/` is the model,
    including disabled-and-labelled fully-received lines), enter
    arrived quantities, pick destination: store select OR
    "directly at <the PO's plot/unit>", challan no., save → GRN.
  - **Stock** view: by store and by item from `stock_on_hand`, with
    per-item movement history (receipts in, issues out, adjustments,
    direct-to-site receipts shown tagged to their plot).
  - **Issues** flow: store → destination (project/unit or
    manufacturing) → item lines (catalogue picker for materials) →
    save; negative-stock refusals surfaced as friendly messages.
  - **Adjustments**: store, item, signed qty, mandatory reason.
  - `NavTabs` between Receive / Stock / Issues / Adjustments (route
    navigation → `NavTabs`, not `Tabs` — DESIGN.md).
- PO detail page: the receipts section goes live (it currently says
  Phase 7 fills it) — list this PO's GRNs with quantities and
  destinations.
- Attribution on every grid; actions stamp `updated_by`.
- Overview (`app/(dashboard)/_components/operations-pipeline.tsx`):
  stage 03 "Goods received" goes real — receipts this month via an
  ungated count (reads are open, no money); drop it from
  `PLANNED_STAGES` exactly as stage 02 was done.

### Milestones & gates

- **M1 — receive.** 0023 applied (founder, Studio) + types regenerated;
  GRN against a PO with partial deliveries; store-or-site destination;
  over-receipt refused; PO auto-completes when fully received; PO
  detail shows receipts. _Gate: receive a real PO in two parts, watch
  it flip to Completed._
- **M2 — stock.** Stock-on-hand + per-item movement history.
  _Gate: the founder checks one item's count against reality._
- **M3 — out & adjust.** Issues (negative-stock refusal proven in the
  browser), adjustments/opening stock, Overview stage 03, PLAN.md files
  - STATUS.md updated, this file pruned. _Gate: issue material to a
    unit, then adjust a count with a reason._

Start `app/(dashboard)/inventory/PLAN.md` at kickoff (copy the
purchase-orders one's shape).

---

## Phase 8 — Bills (`/bills`) — after Inventory merges

The accounts-facing record of what Goodearth owes and has paid. The
smallest phase. Branch `feature/bills`. Migration **`0024`**.

### Kickoff questions for the founder

- **Must the approver be a different person than the recorder?**
  (Long-standing open question. Working assumption: a named
  `bill_approvers` list in Settings like `indent_approvers`,
  self-approval allowed unless the founder says otherwise.)
- What counts as a payment reference (cheque no. / UTR / free text)?
  (Working assumption: one free-text `payment_ref`.)
- Bill numbering (working assumption: `BILL/<project code>/NNN`).

### Migration 0024 — schema outline

- **`labour_contracts`** — vendor_id (the contractor — vendors are the
  one counterparty master), project_id, `scope text`, `contract_value
numeric`, `is_active`, stamps. **Masters RLS pattern** (reads open,
  writes admin — see 0004): it's managed from a Masters tab, not from
  Bills.
- **`bills`** — vendor_id, project_id, anchor: `po_id` **or**
  `labour_contract_id` — exactly-one CHECK (the indent-line-anchor
  mirror, 0019 §5); vendor's paper: `invoice_no text` + `invoice_date
date`; money: `taxable_amount`, `gst_amount`, `total_amount` (stored
  as entered from the paper invoice — unlike POs these are the vendor's
  figures, not computed); status `recorded → approved → paid` +
  send-back to `recorded` with a mandatory `rejection_note` (the indent
  guard shape, 0019 §6); `approved_by/at`, `paid_by/at`,
  `payment_ref`; internal `bill_no` + `reference` minted via
  `bill_counters`; actor stamps, `updated_by`.
- **`bills_guard` trigger** — permanent number; edits only while
  `recorded`; approve requires admin-or-`bill_approvers` (checked
  DB-side like `indents_guard`); paying requires approved + stamps +
  payment_ref; every transition whitelisted.
- **`bill_approvers`** — the `indent_approvers` clone (0019 §2,
  including the no-audit-without-id note), managed from Settings
  alongside indent approvers (extend the Settings screen's approver
  column pattern).
- **RLS**: money ⇒ SELECT **and** writes gated to `has_app('/bills')`
  (the PO tables' precedent, 0021 §12). If the PO detail page should
  show billed-vs-ordered to PO holders, add a narrow money-free or
  totals-only view at build time — never a second SELECT policy.
- Audit + updated_at triggers; counters per the established pattern.

### Pure modules, screens, milestones

- `lib/bills/{reference,workflow}.ts` + tests (mint mirror; status
  machine `canEdit/canApprove/canPay/canSendBack` with the
  approver-list actor shape from `lib/indents/workflow.ts`).
- `lib/bills/queries.ts` + `actions.ts`, `requireTool("/bills")`.
- `app/(dashboard)/bills/`: list with status tabs (Recorded / Approved
  / Paid) + an **Unpaid** view (approved, not yet paid); record form —
  pick vendor → pick that vendor's PO or labour contract, enter
  invoice no./date/amounts; the screen shows PO (or contract) total vs
  already-billed with a **soft warning** on over-billing; detail with
  approve / send-back (note required) / mark-paid (payment_ref) —
  the indent `ActionButtons` + dialog shape; attribution throughout;
  `loading.tsx`.
- Masters: a Labour Contracts tab (`lib/masters/labour-contracts.ts` +
  `-actions.ts` — the two-file split is REQUIRED, see CLAUDE.md's
  "Shared masters"); Settings: bill approvers column.
- PO detail: the ordered / received / billed picture (decide the
  money-visibility path at build time, above).
- Overview: stage 04 "Bills booked" and stage 05 "Paid" go real —
  counts only unless every viewer may see amounts (they may not:
  bill money is `/bills`-gated, and Overview renders for everyone — so
  counts, the stage-01/02 precedent).
- **M1 — record.** 0024 applied + types; labour contracts in Masters;
  bill recording against both anchors; over-billing warning.
  _Gate: record a real vendor bill against a real PO._
- **M2 — approve & pay.** Status machine + approvers in Settings;
  unpaid / per-vendor / per-project views; PO billed picture; Overview
  stages 04–05; docs updated, this file pruned (Phase 9 note remains).
  _Gate: approve a bill and mark it paid with a reference._

---

## After Phase 8

Phase 9 (per STATUS.md's table): Overview fully real + one real project
run end-to-end. Also still pending, any session: the founder's
master-data load (see STATUS.md "Next up"), the letterhead asset swap
(STATUS.md), and the deferred items list in STATUS.md ("Deferred, with
the trigger for revisiting").
