# TODO — Phase 8: Bills

The complete build plan for the next phase, written so an agent with
**no context beyond this repo** can pick it up. Read `STATUS.md` first
(what's shipped, settled decisions, session log), `CLAUDE.md` for the
architecture rules, `DESIGN.md` before styling anything. Every decision
below was approved by the founder on 2026-08-03 as part of the Phases
6–8 plan.

**Phase 7 (Inventory) shipped and merged on 2026-08-03** (migrations
`0023`–`0024`); its record lives in
`app/(dashboard)/inventory/PLAN.md`. Purchase Orders (Phase 6) and
Inventory (Phase 7) are both fresh reference implementations for
nearly everything below.

**Work items move out of this file and into STATUS.md as they ship.**

## How every phase runs (the established rhythm)

1. One phase = one branch (`feature/bills`). Merge
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

## Phase 8 — Bills (`/bills`) — NEXT

The accounts-facing record of what Goodearth owes and has paid. The
smallest phase. Branch `feature/bills`. Migration **`0025`** (this
plan originally said 0024, which Phase 7's stock-by-location follow-up
took — the founder asked for plots on the Stock screen after testing).

### Kickoff questions for the founder

- **Must the approver be a different person than the recorder?**
  (Long-standing open question. Working assumption: a named
  `bill_approvers` list in Settings like `indent_approvers`,
  self-approval allowed unless the founder says otherwise.)
- What counts as a payment reference (cheque no. / UTR / free text)?
  (Working assumption: one free-text `payment_ref`.)
- Bill numbering (working assumption: `BILL/<project code>/NNN`).

### Migration 0025 — schema outline

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
- **M1 — record.** 0025 applied + types; labour contracts in Masters;
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
