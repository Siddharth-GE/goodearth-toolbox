# Purchase Orders — build notes

**Status: in progress** (Phase 6, branch `feature/purchase-orders`).
Migrations `0020` (audit prerequisite) + `0021` (schema). Full phase
plan and every founder decision: the root PLAN.md session log for
2026-08-03 and the approved detailed plan it references.

POs are raised from **approved indent lines only**, one vendor and one
plot/unit (or "General") per PO — the scope is part of the number:
`PO/<project>/<plot-or-unit>/NNN`, numbers running per scope. Money
enters the system here: a line's rate is the vendor-agreed purchase
price plus a GST % picked from the `gst_rates` master. **Nothing from
Budgets (cost/margin/client rate) appears on a PO, ever.**

## The rules everything rests on

1. **The status machine lives in the database** (`purchase_orders_guard`
   + `po_lines_draft_only`, 0021): draft → issued →
   (deletion_requested → cancelled | back to issued); `completed` is
   Phase 7's receipt trigger's alone. Lines and header editable only in
   draft. `lib/purchase-orders/workflow.ts` mirrors it for buttons.
2. **Over-ordering is impossible.** `unique (po_id, indent_line_id)` +
   the `po_lines_qty_guard` trigger (advisory-lock serialised) refuse
   the same indent line twice on a PO and any total beyond the approved
   quantity across all non-cancelled POs.
3. **Deleting an issued PO takes an admin's yes** — request with a note
   → admin approves → cancelled (quantities return to the pool). Drafts:
   creator-or-admin via `delete_draft_purchase_order()`.
4. **Money is gated.** SELECT on PO tables requires `/purchase-orders`
   (the Budgets precedent). Any future money-free exposure is a narrow
   view, never a wider policy.
5. **Amounts are computed, never stored** — `lib/purchase-orders/math.ts`
   (null-is-not-zero, round-at-display), the only module that computes
   PO money.

## Milestones

- [x] **M0 — schema + pure logic.** 0020 + 0021 written; reference/
      math/workflow modules tested (15 tests).
- [ ] **M1 — groundwork.** Migrations applied in Studio + types
      regenerated; plot/unit `code` fields in Masters; GST Rates tab;
      stub flipped `built: true`; PO list renders empty.
      _Gate: set codes on a real plot, edit the GST list._
- [ ] **M2 — raise a PO.** New-PO flow (project → scope → vendor), the
      approved-indent-line pool with remaining quantities, line grid
      with rate + GST dropdown + live totals, draft save/delete.
      _Gate: build a draft PO from a real indent's lines._
- [ ] **M3 — issue, delete, fulfil.** Issue with the fully-priced
      check; request-deletion → admin-approve; indent detail's
      "ordered X of Y"; the attribution component (avatar + name on
      hover) on PO and Indents screens.
      _Gate: issue, request deletion as staff, approve as admin._
- [ ] **M4 — the document + Overview.** The letterhead PO PDF (real
      assets from the founder swap in before merge), Overview pipeline
      stage 02 real.
      _Gate: print a PO and check it against a real vendor order._

## Notes

- Data layer: `lib/purchase-orders/queries.ts` (reads, `server-only`) +
  `actions.ts` (writes, file-level `"use server"`, no type re-exports —
  the outage rule), every function opening
  `requireTool("/purchase-orders")`. Reads indents/masters tables
  directly — never another tool's gated queries module.
- Founder inputs still pending: real letterhead assets (logo, address,
  GST no., terms; placeholder until then) and optionally a Geist `.ttf`
  to lift every PDF at once.
- `/purchase-orders` was already in the `user_apps_app_known` CHECK
  (0017 pre-listed all planned tools) — no constraint change needed.
