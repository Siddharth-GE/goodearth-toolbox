# TODO — Phase 8: Bills (`/bills`)

The build plan for the next phase. Read `STATUS.md` first, `CLAUDE.md`
for the rules. Approved by the founder 2026-08-03; work items move to
STATUS.md as they ship. Branch `feature/bills`, migration **`0025`**.
PO (Phase 6) and Inventory (Phase 7) are the reference implementations
for nearly everything below.

The accounts-facing record of what Goodearth owes and has paid:
recorded → approved → paid, with an unpaid-bills view. The smallest
phase.

## Decisions already made — do not re-ask

- Over-billing against a PO/contract **warns, never blocks** (real
  invoices legitimately differ; a human decides).
- **Labour contracts** are a small Masters-managed table; a bill
  references a PO **or** a labour contract, exactly one.
- Bill amounts are **stored as entered from the paper invoice**
  (taxable / GST / total) — the vendor's figures, not computed, unlike
  POs.
- Anchor on `purchase_order_lines.id` / money-free reads via
  `po_facts` views — CLAUDE.md's money rules apply throughout.

## Kickoff questions for the founder

- Must the approver differ from the recorder? (Working assumption: a
  `bill_approvers` list in Settings like `indent_approvers`,
  self-approval allowed.)
- Payment reference format? (Assumption: one free-text `payment_ref`.)
- Bill numbering? (Assumption: `BILL/<project code>/NNN`.)

## Migration 0025 — schema outline

- **`labour_contracts`** — vendor_id (contractors are vendors),
  project_id, `scope text`, `contract_value numeric`, `is_active`,
  stamps. Masters RLS pattern (reads open, writes admin — see `0004`).
- **`bills`** — vendor_id, project_id; anchor `po_id` **or**
  `labour_contract_id`, exactly-one CHECK (the `0019` §5 mirror);
  `invoice_no` + `invoice_date`; `taxable_amount`, `gst_amount`,
  `total_amount`; status `recorded → approved → paid` + send-back with
  mandatory `rejection_note` (the indent guard shape);
  `approved_by/at`, `paid_by/at`, `payment_ref`; `bill_no` +
  `reference` minted via `bill_counters`; actor stamps.
- **`bills_guard`** — permanent number; edits only while `recorded`;
  approve requires admin-or-`bill_approvers` (DB-side, like
  `indents_guard`); paying requires approved + payment_ref; every
  transition whitelisted.
- **`bill_approvers`** — the `indent_approvers` clone (`0019` §2),
  managed from Settings alongside indent approvers.
- **RLS**: bill money ⇒ SELECT and writes gated to `has_app('/bills')`
  (the PO precedent). If the PO detail page should show
  billed-vs-ordered to PO holders, add a narrow totals-only view at
  build time — never a second SELECT policy.
- Audit + updated_at triggers; counters per the established pattern.
- Also extend the `user_apps_app_known` CHECK with `/bills`.

## Build

- `lib/bills/{reference,workflow}.ts` + tests (mint mirror; status
  machine with the approver-list actor shape from
  `lib/indents/workflow.ts`); then `queries.ts` + `actions.ts` under
  `requireTool("/bills")`.
- `app/(dashboard)/bills/`: list with status tabs (Recorded / Approved
  / Paid / **Unpaid**); record form — vendor → that vendor's PO or
  contract → invoice no./date/amounts, with PO-total vs already-billed
  and the soft over-billing warning; detail with approve / send-back
  (note) / mark-paid (payment_ref); attribution; `loading.tsx`.
- Masters: Labour Contracts tab (`lib/masters/labour-contracts.ts` +
  `-actions.ts` — two-file split REQUIRED). Settings: bill approvers
  column.
- PO detail: the ordered / received / billed picture.
- Overview: stages 04 "Bills booked" and 05 "Paid" go real — **counts
  only** (bill money is `/bills`-gated; Overview renders for everyone).

**M1 — record.** `0025` applied + types; labour contracts in Masters;
recording against both anchors; over-billing warning.
_Gate: record a real vendor bill against a real PO._

**M2 — approve & pay.** Status machine + approvers in Settings; unpaid
/ per-vendor / per-project views; PO billed picture; Overview 04–05;
docs updated, this file pruned.
_Gate: approve a bill and mark it paid with a reference._

## After Phase 8

Phase 9: Overview fully real + one real project run end-to-end. Any
session: the master-data load, letterhead assets, and the deferred list
— all in STATUS.md.
