# Purchase Orders — the rules

**Shipped 2026-08-03.** Migrations `0020` (audit prerequisite) + `0021` (schema) + `0022` (money-free fact views).

POs are raised from **approved indent lines only**, one vendor and one plot/unit (or "General") per PO — the scope is part of the number: `PO/<project>/<plot-or-unit>/NNN`, numbers running per scope. **Money enters the system here**: a line's rate is the vendor-agreed purchase price plus a GST % picked from the `gst_rates` master. **Nothing from Budgets — cost, margin, client rate — appears on a PO, ever.**

_Trimmed 2026-08-14: the milestone log lives in git._

## The rules everything rests on

1. **The status machine lives in the database** (`purchase_orders_guard` + `po_lines_draft_only`): draft → issued → (deletion_requested → cancelled | back to issued). `completed` belongs to Inventory's receipt trigger alone. Lines and header editable only in draft. `lib/purchase-orders/workflow.ts` mirrors it **for buttons only**.
2. **Over-ordering against an indent is impossible.** `unique (po_id, indent_line_id)` plus the `po_lines_qty_guard` trigger — serialised on an **advisory lock**, not `select … for update`, because a row lock would need UPDATE rights under another tool's RLS that the acting user doesn't hold (`0021` §7) — refuse the same indent line twice on a PO, and any total beyond the approved quantity across all non-cancelled POs. **A direct line (`0079` — `indent_line_id` null, the bulk/urgent path) has NO quantity ceiling, deliberately:** it is not plot-specific, so there is no approved figure to cap it against. The guard early-returns on it; pricing-before-issue and the receipt cap (`grn_lines_qty_guard`) are the gates that remain. Same-item direct lines merge on add; the unique pair never sees them (NULLs are distinct).
3. **Deleting an issued PO takes an admin's yes** — request with a note → admin approves → cancelled, and the quantities return to the pool. Drafts go via `delete_draft_purchase_order()`, creator-or-admin.
4. **Money is gated.** SELECT on the PO tables requires `/purchase-orders` (the Budgets precedent). **Any future money-free exposure is a narrow view, never a wider policy.** _(`0055` widened the qual to admit `/reporter`, by founder decision — a widened qual, still one policy.)_
5. **Amounts are computed, never stored** — `lib/purchase-orders/math.ts` is the only module that computes PO money. Null is not zero; round at display.

## Things that will bite

- **The Issue button must not gate on the server's `fullyPriced` snapshot.** Rate saves don't revalidate, so that prop goes stale and the button plays dead. It checks priced-at-click instead. This was a founder-found bug and the obvious "fix" reintroduces it.
- **Line pulls insert row-by-row, deliberately.** The qty guard raises per line with the item's remaining figure, and a batch insert would fail wholesale on the first refusal. Each reports partial success honestly.
- **Reads go to indents and masters tables directly** — never another tool's gated queries module.
- **Consumers read `po_facts` / `po_line_facts`**, which are money-free by column list and open to all authenticated. That is deliberate and documented in `0022`: what exists and how much was ordered is operational fact, not commercial secret. **Never add a money column to either.**
- **`po_billing_totals` carries money** (ordered and billed) and is WHERE-gated to `/purchase-orders` OR `/bills`. It is not in the money-free family despite sitting beside it.

## Open

Real letterhead assets — logo, address, GST number, terms — are still placeholder in the PO PDF. Optionally a Geist `.ttf` to lift every PDF at once.
