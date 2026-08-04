# Bills — build notes

**Status: shipped** (Phase 8, merged 2026-08-04, branch deleted).
Migrations `0025` + `0026`. Gates passed the same day: the founder's
browser run on the preview, plus a 12-check single-grant probe smoke
straight at PostgREST (bill money invisible without `/bills`, PO money
invisible to bills-only, `po_billing_totals` open to exactly the two
grants, non-approver approval refused by the trigger). Every founder
decision: root STATUS.md's "Decisions locked in" and the session log.

The accounts-facing record of what Goodearth owes and has paid: a
bill is one of **three kinds** — against an issued purchase order,
against an **approved** labour contract, or **NMR (daily wages)** with
no anchor at all — numbered `BILL/<project>/<plot-or-unit-or-GEN>/NNN`
(the PO shape; PO/contract bills derive the scope from their anchor,
NMR picks it directly), moving recorded → approved → paid with
send-back carrying a mandatory note.

**Second pass (0026, same day, founder corrections):** labour
contracts moved out of Masters into Bills itself (`/bills/contracts`),
gained a `pending_approval → approved` step (same deciders as bills,
terms lock on approval, deactivate is the correction path), and NMR
arrived with an **optional** vendor (a contractor when one supplied
the workers, nothing when the muster roll is paid directly).

## The rules everything rests on

1. **The status machine lives in the database** (`bills_guard`, 0025):
   recorded → approved → paid, send-back approved → recorded with a
   mandatory note that the next approval clears. Header/amount edits
   only while recorded; anchor, vendor, scope and number permanent.
   `lib/bills/workflow.ts` mirrors it for buttons.
2. **Approvers are a named list** (`bill_approvers`, managed in
   Settings beside indent approvers; admins always may).
   **Self-approval allowed** — founder decision. The same list
   approves labour contracts (`labour_contracts_guard`, 0026).
3. **Amounts are stored as entered** from the paper invoice
   (taxable/GST/total — the vendor's figures, never computed, no
   total-equals-sum CHECK). Over-billing against the PO value or
   contract value **warns, never blocks**.
4. **Money is gated.** SELECT on `bills` requires `/bills`. The two
   windows: `bill_facts` (money-free, open — Overview counts) and
   `po_billing_totals` (one ordered/billed total per PO, WHERE-gated to
   `/purchase-orders` OR `/bills` — the PO detail's billed picture and
   the record form's warning). Never a second SELECT policy.
5. **The mint derives everything from the anchor.** `create_bill()`
   reads the money-free `po_facts` (a /bills-only user can't read the
   PO tables) or the contract row, copies project/plot/unit/vendor,
   resolves the scope, and mints via `bill_counters`. Deliberately no
   vendor-inactive check — a real invoice from a deactivated vendor
   still enters the books; the contract's own `is_active` is the
   off-switch.
6. **Labour contracts belong to Bills** (0026 — 0025 had them in
   Masters; the founder moved them): created at `/bills/contracts` by
   any `/bills` holder, `pending_approval` until a decider approves,
   terms permanent after. `kind` on bills is explicit
   (`po`/`contract`/`nmr`) with CHECKs tying it to the anchors;
   `vendor_id` is nullable for NMR only.

## Milestones

- [x] **M1 — record.** 0025 applied (management API) + types; pure
      reference/workflow modules (11 tests, suite 74 → 85); Labour
      Contracts tab in Masters; list with All/Recorded/Approved/
      Unpaid/Paid tabs (Unpaid = `status <> 'paid'`); record form
      (vendor → anchor optgroups `po:` / `contract:`, over-billing
      warning, taxable+GST≠total nudge); detail with edit-on-blur while
      recorded, per-status banners, recorder-or-admin delete.
      _Gate: founder records a real vendor bill against a real PO._
- [x] **M2 — approve & pay.** Bill-approvers column in Settings (the
      approver checkbox generalised to take its action as a prop);
      approve / send-back (note dialog) / mark-paid (payment_ref
      dialog); vendor + project list filters; PO detail's billed
      section; Overview stages 04–05 real (counts only).
      _Gate: approve a bill and mark it paid with a reference._

## Notes

- Data layer: `lib/bills/queries.ts` (reads, `server-only`) +
  `actions.ts` (writes, file-level `"use server"`, no type re-exports —
  the outage rule), every function opening `requireTool("/bills")`
  except `countBillsPipeline` (deliberately ungated, reads `bill_facts`
  only — the Overview renders for everyone).
- The PO reference on a bill comes from `po_facts`, never an embedded
  `purchase_orders` join — the embed silently nulls for /bills-only
  users (RLS filters the joined row).
- Transition updates carry **no `.eq("status")` filter** — a stale
  button gets `bills_guard`'s message instead of a silent zero-row
  "success" (the PO lesson).
- `/bills` was already in the `user_apps_app_known` CHECK (0017
  pre-listed all planned tools) — no constraint change needed.
