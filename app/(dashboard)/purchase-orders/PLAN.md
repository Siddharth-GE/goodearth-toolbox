# Purchase Orders — build notes

**Status: shipped** (Phase 6, merged 2026-08-03, branch deleted).
Migrations `0020` (audit prerequisite) + `0021` (schema) + `0022`
(money-free fact views). Every founder decision: root STATUS.md's
"Decisions locked in" and the 2026-08-03 session log.

POs are raised from **approved indent lines only**, one vendor and one
plot/unit (or "General") per PO — the scope is part of the number:
`PO/<project>/<plot-or-unit>/NNN`, numbers running per scope. Money
enters the system here: a line's rate is the vendor-agreed purchase
price plus a GST % picked from the `gst_rates` master. **Nothing from
Budgets (cost/margin/client rate) appears on a PO, ever.**

## The rules everything rests on

1. **The status machine lives in the database** (`purchase_orders_guard`
   - `po_lines_draft_only`, 0021): draft → issued →
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
- [x] **M1 — groundwork.** Migrations applied in Studio + types
      regenerated; plot/unit `code` fields in Masters; GST Rates tab;
      stub flipped `built: true`; PO list renders empty.
      _Gate passed 2026-08-03 (founder browser test)._
- [x] **M2 — raise a PO.** New-PO flow (project → scope → vendor,
      number previewed), the approved-indent-line pool with remaining
      quantities, line grid with rate + GST dropdown + live totals,
      draft save/delete.
      _Gate passed 2026-08-03; qty-input visibility fixed on feedback._
- [x] **M3 — issue, delete, fulfil.** Issue with the priced-at-click
      check (the button deliberately does NOT gate on the server's
      fullyPriced snapshot — rate saves don't revalidate, so that prop
      goes stale and the button played dead, a founder-found bug);
      request-deletion (note required) → admin approve/refuse, withdraw
      by requester; status banners; indent detail's "ordered X of Y"
      with PO references (via the money-free `po_line_facts` view,
      migration `0022`); the `Attribution` component
      (`components/ui/attribution.tsx`) on PO and Indent line grids and
      banners; `updated_by` stamped by all indent/PO line actions.
      _Gate passed 2026-08-03._
- [x] **M4 — the document + Overview.** The PO PDF
      (`lib/purchase-orders/po-document.tsx` on the shared shell —
      vendor block with GSTIN, lines with GST, totals by slab, DRAFT
      watermark, signature block on issued only); Overview pipeline
      stage 02 real via money-free `po_facts`.
      _Gate passed 2026-08-03; merged same day. Letterhead assets
      still placeholder — swap tracked in root STATUS.md._

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
